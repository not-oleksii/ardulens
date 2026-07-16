// ================== 5. FORMAT REGISTRY ==================
var PARSERS = [
  { test: function (name, u8) { return /\.bin$/i.test(name) || (u8.length > 2 && u8[0] === 0xA3 && u8[1] === 0x95); },
    parse: function (buf, board) { return parseBin(buf, board); } },
  { test: function () { return true; },                       // fallback: skylog (text)
    parse: function (buf) { return parseSkylog(buf); } }
];

function parseFile(name, buf, board) {
  var u8 = new Uint8Array(buf);
  for (var i = 0; i < PARSERS.length; i++) {
    if (PARSERS[i].test(name, u8)) return PARSERS[i].parse(buf, board);
  }
}
