// ================== 2. ANALYSIS (format-agnostic) ==================

// Landing voltage = max voltage over the last 10 s (ignores the impact drop on a crash).
function landingVoltage(S) {
  var tEnd = S[S.length - 1].t, m = null;
  for (var i = S.length - 1; i >= 0; i--) {
    if (S[i].t < tEnd - CRASH_TAIL_MS) break;
    if (typeof S[i].voltage === "number" && (m == null || S[i].voltage > m)) m = S[i].voltage;
  }
  if (m != null) return m;
  for (var j = S.length - 1; j >= 0; j--) {
    if (typeof S[j].voltage === "number") return S[j].voltage;
  }
  return null;
}

// Sag = voltage at the FIRST throttle==100% while airborne, excluding the final crash window.
function sagVoltage(S) {
  var tEnd = S.length ? S[S.length - 1].t : 0;
  var body = (tEnd - S[0].t > 60000) ? S.filter(function (s) { return s.t < tEnd - CRASH_TAIL_MS; }) : S;
  for (var i = 0; i < body.length; i++) {
    var s = body[i];
    if (typeof s.throttle === "number" && s.throttle >= 100 &&
        typeof s.voltage === "number" && isAirborne(s)) {
      return s.voltage;
    }
  }
  return null;
}

// A segment counts as a flight only if it actually got airborne.
function isFlightSamples(S) {
  return (maxOf(S, "alt") || 0) >= 30 || (maxOf(S, "airspeed") || 0) >= 15;
}

// Declarative column list: add / reorder a column by editing this array.
var METRICS = [
  { h: "Серійний номер борта",               fn: function (f) { return String(f.board); } },
  { h: "Напруга при взльоті, В",             fn: function (f) { return r2(firstNum(f.samples, "voltage")); } },
  { h: "Напруга при посадці, В",             fn: function (f) { return r2(landingVoltage(f.samples)); } },
  { h: "Напруга просадки при газі 100%, В",  fn: function (f) { return r2(sagVoltage(f.samples)); } },
  { h: "Максимальна сила струму, А",         fn: function (f) { return r1(maxOf(f.samples, "current")); } },
  { h: "Максимальна швидкість (arspd), м/с", fn: function (f) { return r1(maxOf(f.samples, "airspeed")); } },
  { h: "Час взльоту (hh:mm)",                fn: function (f) { return f.timeReliable ? fmtKyiv(f.samples[0].t) : ""; }, manualIfBlank: true },
  { h: "Час посадки (hh:mm)",                fn: function (f) { return f.timeReliable ? fmtKyiv(f.samples[f.samples.length - 1].t) : ""; }, manualIfBlank: true },
  { h: "Час в повітрі (hh:mm)",              fn: function (f) { return fmtDurMs(f.samples[f.samples.length - 1].t - f.samples[0].t); } },
  { h: "Максимальна висота, м",              fn: function (f) { return r0(maxOf(f.samples, "alt")); } },
  { h: "Максимальна відстань від бази, м",   fn: function (f) { return r0(trackStats(f).maxd); } },
  { h: "Пройдений шлях, км",                 fn: function (f) { var p = trackStats(f).path; return p == null ? "" : r1(p); } }
];
var COLUMNS = METRICS.map(function (m) { return m.h; });

function computeRow(flight) {
  var alt = maxOf(flight.samples, "alt");
  return {
    row: METRICS.map(function (m) { return m.fn(flight); }),
    ground: (alt == null || alt < 30),
    manualCols: METRICS
      .map(function (m, i) { return (m.manualIfBlank && !flight.timeReliable) ? i : -1; })
      .filter(function (i) { return i >= 0; })
  };
}
