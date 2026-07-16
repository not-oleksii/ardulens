// ================== 4. PARSER: BIN (ArduPilot DataFlash) ==================
function readStr(dv, off, len) {
  var s = "";
  for (var k = 0; k < len; k++) {
    var b = dv.getUint8(off + k);
    if (b === 0) break;
    s += String.fromCharCode(b);
  }
  return s;
}

// Read one field by ArduPilot format char; returns [value, byteSize].
function readField(dv, off, ch) {
  switch (ch) {
    case 'b': return [dv.getInt8(off), 1];
    case 'B': case 'M': return [dv.getUint8(off), 1];
    case 'h': return [dv.getInt16(off, true), 2];
    case 'H': return [dv.getUint16(off, true), 2];
    case 'i': return [dv.getInt32(off, true), 4];
    case 'I': return [dv.getUint32(off, true), 4];
    case 'f': return [dv.getFloat32(off, true), 4];
    case 'd': return [dv.getFloat64(off, true), 8];
    case 'c': return [dv.getInt16(off, true) * 0.01, 2];
    case 'C': return [dv.getUint16(off, true) * 0.01, 2];
    case 'e': return [dv.getInt32(off, true) * 0.01, 4];
    case 'E': return [dv.getUint32(off, true) * 0.01, 4];
    case 'L': return [dv.getInt32(off, true) * 1e-7, 4];
    case 'q': return [Number(dv.getBigInt64(off, true)), 8];
    case 'Q': return [Number(dv.getBigUint64(off, true)), 8];
    case 'n': return [readStr(dv, off, 4), 4];
    case 'N': return [readStr(dv, off, 16), 16];
    case 'Z': return [readStr(dv, off, 64), 64];
    default:  return [0, 1];
  }
}

// Self-describing DataFlash: FMT messages (type 128) define every other message.
function parseDataflash(buf) {
  var dv = new DataView(buf), u8 = new Uint8Array(buf), n = u8.length;
  var formats = {}, out = {}, p = 0;
  var want = new Set(["GPS", "BAT", "CTUN", "ARSP", "ARM", "MODE", "POS", "STAT"]);

  while (p + 3 <= n) {
    if (u8[p] !== 0xA3 || u8[p + 1] !== 0x95) { p++; continue; }   // resync to header
    var type = u8[p + 2];

    if (type === 128) {   // FMT: B B n(4) N(16) Z(64)
      var t = dv.getUint8(p + 3), len = dv.getUint8(p + 4);
      var name = readStr(dv, p + 5, 4);
      var fmt = readStr(dv, p + 9, 16);
      var labels = readStr(dv, p + 25, 64).split(",");
      formats[t] = { name: name, fmt: fmt, labels: labels, len: len };
      p += 89;
      continue;
    }

    var d = formats[type];
    if (!d) { p++; continue; }
    var size = d.len - 3;
    if (p + 3 + size > n) break;

    if (want.has(d.name)) {
      var off = p + 3, rec = {};
      for (var k = 0; k < d.fmt.length; k++) {
        var rf = readField(dv, off, d.fmt[k]);
        rec[d.labels[k]] = rf[0];
        off += rf[1];
      }
      (out[d.name] = out[d.name] || []).push(rec);
    }
    p += 3 + size;
  }
  return out;
}

// Under spoofing there can be two GPS units; the real one has the most stable latitude.
function realGpsInstance(GPS) {
  var byI = {};
  GPS.forEach(function (g) { (byI[g.I] = byI[g.I] || []).push(g); });

  var best = null, bestSd = Infinity;
  for (var i in byI) {
    var lats = byI[i].filter(function (g) { return Math.abs(g.Lat) > 1; }).map(function (g) { return g.Lat; });
    if (lats.length < 3) continue;
    var m = lats.reduce(function (a, b) { return a + b; }, 0) / lats.length;
    var sd = Math.sqrt(lats.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / lats.length);
    if (sd < bestSd) { bestSd = sd; best = i; }
  }
  return (best != null ? byI[best] : []).filter(function (g) { return Math.abs(g.Lat) > 1; });
}

// Flight windows: ARM(1->0) pairs, or the STAT.Armed span if ARM pairs are missing.
function binWindows(m) {
  var ARM = (m.ARM || []).slice().sort(function (a, b) { return a.TimeUS - b.TimeUS; });

  var segs = [], start = null;
  ARM.forEach(function (a) {
    if (a.ArmState === 1 && start == null) start = a.TimeUS;
    else if (a.ArmState === 0 && start != null) { segs.push([start, a.TimeUS]); start = null; }
  });

  var full = segs.filter(function (s) { return s[1] - s[0] > 60e6; });
  if (full.length > 1) {   // merge short re-arm gaps (<30 s)
    var mg = [full[0]];
    for (var i = 1; i < full.length; i++) {
      if (full[i][0] - mg[mg.length - 1][1] < 30e6) mg[mg.length - 1][1] = full[i][1];
      else mg.push(full[i]);
    }
    full = mg;
  }
  if (full.length) return full;

  // Fallback: log started already armed -> use STAT.Armed span.
  var STAT = m.STAT || [], lo = null, hi = null;
  for (var j = 0; j < STAT.length; j++) {
    var s = STAT[j];
    if (s.Armed === 1) {
      if (lo == null || s.TimeUS < lo) lo = s.TimeUS;
      if (hi == null || s.TimeUS > hi) hi = s.TimeUS;
    }
  }
  if (lo != null && hi - lo > 60e6) return [[lo, hi]];
  return [];
}

// Join per-field streams into unified samples at 100 ms (sample-and-hold).
function holdMerge(s, e, streams) {
  var ptr = {};
  for (var k in streams) ptr[k] = 0;

  var samples = [];
  for (var t = s; t <= e; t += 100000) {   // step 100 ms (in microseconds)
    var smp = { t: t / 1000 };
    for (var kk in streams) {
      var arr = streams[kk];
      while (ptr[kk] + 1 < arr.length && arr[ptr[kk] + 1].t <= t) ptr[kk]++;
      var cur = arr[ptr[kk]];
      smp[kk] = (cur && cur.t <= t) ? cur.v : undefined;
    }
    samples.push(smp);
  }
  return samples;
}

function parseBin(buf, board) {
  var m = parseDataflash(buf);
  var wins = binWindows(m);
  if (!wins.length) return { info: "У .bin не вдалося визначити виліт (немає ані пари ARM, ані STAT.Armed)." };

  var BAT = m.BAT || [], CTUN = m.CTUN || [], ARSP = m.ARSP || [];
  var MODE = (m.MODE || []).slice().sort(function (a, b) { return a.TimeUS - b.TimeUS; });

  // Position/altitude from POS (fused, spoof-resistant); fall back to the real GPS unit.
  var POS = (m.POS || []).filter(function (p) { return Math.abs(p.Lat) > 1; });
  var usePos = POS.length > 0;
  var track = usePos ? POS : realGpsInstance(m.GPS || []);
  var bd = board || "?";

  var mk = function (arr, vk) { return arr.map(function (x) { return { t: x.TimeUS, v: x[vk] }; }); };

  var flights = wins.map(function (w) {
    var s = w[0], e = w[1];
    var streams = {
      voltage:  mk(BAT, "Volt"),
      current:  mk(BAT, "Curr"),
      airspeed: mk(ARSP, "Airspeed"),
      throttle: mk(CTUN, "ThO"),
      mode:     MODE.map(function (x) { return { t: x.TimeUS, v: x.ModeNum }; }),
      alt:      track.map(function (x) { return { t: x.TimeUS, v: usePos ? x.RelHomeAlt : x.Alt }; }),
      lat:      track.map(function (x) { return { t: x.TimeUS, v: x.Lat }; }),
      lon:      track.map(function (x) { return { t: x.TimeUS, v: x.Lng }; })
    };
    for (var k in streams) streams[k].sort(function (a, b) { return a.t - b.t; });

    var samples = holdMerge(s, e, streams);

    // GPS fallback gives AMSL altitude -> make it relative to the takeoff point.
    if (!usePos) {
      var base = null;
      for (var i = 0; i < samples.length; i++) if (typeof samples[i].alt === "number") { base = samples[i].alt; break; }
      if (base == null) base = 0;
      for (var j = 0; j < samples.length; j++) if (typeof samples[j].alt === "number") samples[j].alt -= base;
    }

    return { board: bd, timeReliable: false, fmt: "bin", samples: samples };
  }).filter(function (f) { return isFlightSamples(f.samples); });

  if (!flights.length) return { info: "У .bin немає вильоту (борт не піднявся в повітря)." };
  return { flights: flights, boards: [bd], fmt: "bin" };
}
