// ================== 3. PARSER: SKYLOG ==================
var TLM_RE   = /\{telemetry:"([^"]*)"\}/;
var SETID_RE = /\{setid:(\d+)/;
var IDM_RE   = /\{id:(\d+)/;
var ENVID_RE = /\{env:\{[^}]*\bid:(\d+)/;

function coerce(v) {
  v = v.trim();
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  var f = parseFloat(v);
  return isNaN(f) ? v : f;
}

function parseKV(inner) {
  var o = {};
  inner.split(",").forEach(function (p) {
    var i = p.indexOf(":");
    if (i < 0) return;
    o[p.slice(0, i).trim()] = coerce(p.slice(i + 1));
  });
  return o;
}

// Prefer inertial lat/lon (spoofing-resistant); fall back to raw GPS.
function skBest(r) {
  if (typeof r.lat === "number" && Math.abs(r.lat) > 1e-4 &&
      typeof r.lon === "number" && Math.abs(r.lon) > 1e-4) return [r.lat, r.lon];
  if (typeof r.gps_lat === "number" && Math.abs(r.gps_lat) > 1e-4 &&
      typeof r.gps_lon === "number" && Math.abs(r.gps_lon) > 1e-4) return [r.gps_lat, r.gps_lon];
  return [null, null];
}

// Most frequent board id inside a segment.
function boardOf(seg) {
  var c = {};
  for (var i = 0; i < seg.length; i++) c[seg[i]._board] = (c[seg[i]._board] || 0) + 1;
  var best = null, bn = -1;
  for (var k in c) if (c[k] > bn) { bn = c[k]; best = k; }
  return best;
}

function parseSkylog(buf) {
  var text = new TextDecoder("utf-8").decode(buf);

  if (text.indexOf("{telemetry:") < 0) {
    return {
      error: text.indexOf("{tlm:") >= 0
        ? "Цей skylog записаний БЕЗ -extended_log (лише сирий {tlm:...}). Скористайтесь .bin цього борта."
        : "У файлі немає розшифрованої телеметрії {telemetry:...}."
    };
  }

  // The active board id switches via setid/id/env(id); telemetry after a switch
  // belongs to that board -> tag every record.
  var cur = null, recs = [], lines = text.split(/\r?\n/);
  for (var li = 0; li < lines.length; li++) {
    var line = lines[li];
    var mi = SETID_RE.exec(line) || IDM_RE.exec(line) || ENVID_RE.exec(line);
    if (mi) cur = parseInt(mi[1], 10);
    if (line.indexOf("telemetry") < 0) continue;
    var m = TLM_RE.exec(line);
    if (!m) continue;
    var o = parseKV(m[1]);
    if ("time" in o) { o._board = cur; recs.push(o); }
  }

  var seen = {};
  recs.sort(function (a, b) { return a.time - b.time; });
  var uniq = recs.filter(function (r) {
    var k = r.time + "/" + r._board;
    if (seen[k]) return false;
    seen[k] = 1;
    return true;
  });

  // Split into armed segments, breaking on a board change.
  var segs = [], c = [];
  for (var i = 0; i < uniq.length; i++) {
    var r = uniq[i];
    if (Number(r.armed) === 1) {
      if (c.length && c[c.length - 1]._board !== r._board) { if (c.length >= 2) segs.push(c); c = []; }
      c.push(r);
    } else {
      if (c.length >= 2) segs.push(c);
      c = [];
    }
  }
  if (c.length >= 2) segs.push(c);

  // Merge same-board segments split by a short disarm (<30 s) - re-arm glitches.
  var mg = segs.length ? [segs[0]] : [];
  for (var j = 1; j < segs.length; j++) {
    var s = segs[j], last = mg[mg.length - 1];
    if (boardOf(s) === boardOf(last) && s[0].time - last[last.length - 1].time < 30000) {
      mg[mg.length - 1] = last.concat(s);
    } else {
      mg.push(s);
    }
  }

  var flights = mg.map(function (seg) {
    var samples = seg.map(function (r) {
      var co = skBest(r);
      return {
        t: r.time, voltage: r.voltage, current: r.current, airspeed: r.airspeed,
        throttle: r.throttle, alt: r.alt, lat: co[0], lon: co[1], mode: r.mode
      };
    });
    return { board: boardOf(seg), timeReliable: true, fmt: "skylog", samples: samples };
  }).filter(function (f) { return isFlightSamples(f.samples); });

  var boards = {};
  flights.forEach(function (f) { boards[f.board] = 1; });
  return { flights: flights, boards: Object.keys(boards), fmt: "skylog" };
}
