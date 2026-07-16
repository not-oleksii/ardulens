// ================== 1. SHARED HELPERS ==================
var AIR_MODES = new Set([4, 5, 15]);   // ACRO, FBWA, GUIDED
var AIRBORNE_SPEED = 10;               // m/s -> considered flying
var MAX_FROM_CENTER = 300000;          // 300 km -> reject cross-country teleports
var MAX_STEP_SPEED = 150;              // m/s -> reject impossible jumps between samples
var CRASH_TAIL_MS = 10000;             // final window ignored for landing/sag (impact)

function haversine(lat1, lon1, lat2, lon2) {
  var R = 6371000, rad = Math.PI / 180;
  var p1 = lat1 * rad, p2 = lat2 * rad;
  var dp = (lat2 - lat1) * rad, dl = (lon2 - lon1) * rad;
  var x = Math.sin(dp / 2) * Math.sin(dp / 2) +
          Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

function median(values) {
  var s = values.slice().sort(function (a, b) { return a - b; });
  return s.length ? s[s.length >> 1] : 0;
}

function r2(x) { return x == null ? "" : x.toFixed(2); }
function r1(x) { return x == null ? "" : x.toFixed(1); }
function r0(x) { return x == null ? "" : String(Math.round(x)); }

function firstNum(samples, key) {
  for (var i = 0; i < samples.length; i++) {
    if (typeof samples[i][key] === "number") return samples[i][key];
  }
  return null;
}

function maxOf(samples, key) {
  var m = null;
  for (var i = 0; i < samples.length; i++) {
    var v = samples[i][key];
    if (typeof v === "number" && (m == null || v > m)) m = v;
  }
  return m;
}

function isFlying(s)   { return typeof s.airspeed === "number" && s.airspeed >= AIRBORNE_SPEED; }
function isAirborne(s) { return isFlying(s) || AIR_MODES.has(s.mode); }

// Downsample track to ~1 Hz and drop teleport outliers (GPS spoofing / EW).
function cleanTrack(pts) {
  if (!pts.length) return { points: [], removed: 0 };

  var ds = [], lastT = null;
  for (var i = 0; i < pts.length; i++) {
    var p = pts[i];
    if (lastT == null || p.t - lastT >= 1000) { ds.push(p); lastT = p.t; }
  }

  var cLat = median(ds.map(function (p) { return p.lat; }));
  var cLon = median(ds.map(function (p) { return p.lon; }));
  var near = ds.filter(function (p) {
    return haversine(cLat, cLon, p.lat, p.lon) <= MAX_FROM_CENTER;
  });

  var out = near.length ? [near[0]] : [];
  for (var k = 1; k < near.length; k++) {
    var a = out[out.length - 1], b = near[k];
    var dt = Math.abs(b.t - a.t) / 1000;
    var d = haversine(a.lat, a.lon, b.lat, b.lon);
    if (dt > 0 && d / dt > MAX_STEP_SPEED) continue;   // impossible jump -> skip
    out.push(b);
  }
  return { points: out, removed: ds.length - out.length };
}

// Max distance from base + path length (cached per flight).
function trackStats(flight) {
  if (flight.__t) return flight.__t;

  var S = flight.samples, pts = [];
  for (var i = 0; i < S.length; i++) {
    var s = S[i];
    if (typeof s.lat === "number" && typeof s.lon === "number" &&
        Math.abs(s.lat) > 1e-4 && Math.abs(s.lon) > 1e-4) {
      pts.push({ t: s.t, lat: s.lat, lon: s.lon });
    }
  }

  var c = cleanTrack(pts);
  var maxd = null, path = 0, base = c.points[0], prev = null;
  if (c.points.length) {
    maxd = 0;
    for (var j = 0; j < c.points.length; j++) {
      var p = c.points[j];
      var d = haversine(base.lat, base.lon, p.lat, p.lon);
      if (d > maxd) maxd = d;
      if (prev) path += haversine(prev.lat, prev.lon, p.lat, p.lon);
      prev = p;
    }
  }

  flight.__t = { maxd: maxd, path: c.points.length ? path / 1000 : null, removed: c.removed };
  return flight.__t;
}

function fmtDurMs(ms) {
  var m = Math.round(ms / 60000);
  if (m < 0) m = 0;
  return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
}

function fmtKyiv(ms) {
  try {
    return new Intl.DateTimeFormat("uk-UA", {
      timeZone: "Europe/Kyiv", hour: "2-digit", minute: "2-digit", hour12: false
    }).format(new Date(ms));
  } catch (e) {
    return new Intl.DateTimeFormat("uk-UA", {
      timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false
    }).format(new Date(ms));
  }
}
