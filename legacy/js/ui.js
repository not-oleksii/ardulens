// ================== 6. UI ==================
var drop = document.getElementById("drop");
var fileInput = document.getElementById("fileInput");
var result = document.getElementById("result");
var boardInput = document.getElementById("boardId");

drop.addEventListener("click", function () { fileInput.click(); });
drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("hover"); });
drop.addEventListener("dragleave", function () { drop.classList.remove("hover"); });
drop.addEventListener("drop", function (e) {
  e.preventDefault();
  drop.classList.remove("hover");
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener("change", function (e) { if (e.target.files.length) handleFile(e.target.files[0]); });

// Live filter: re-render the already-parsed result while typing.
boardInput.addEventListener("input", function () { if (window.__result) renderTable(); });

function handleFile(file) {
  var reader = new FileReader();
  reader.onload = function () {
    var res;
    try {
      res = parseFile(file.name, reader.result, boardInput.value.trim());
    } catch (err) {
      window.__result = null;
      show('<div class="msg err">Помилка розбору: ' + esc(err.message) + '</div>');
      return;
    }
    res.name = file.name;
    window.__result = res;
    renderTable();
  };
  reader.readAsArrayBuffer(file);
}

function renderTable() {
  var res = window.__result;
  if (!res) return;
  if (res.error) { show('<div class="msg err">' + esc(res.error) + '</div>'); return; }
  if (res.info)  { show('<div class="msg info">' + esc(res.info) + '</div>'); return; }

  var filter = boardInput.value.trim();
  var all = res.flights;
  // Partial (substring) match: "35" matches 3570, 3526, 3557...
  var flights = filter
    ? all.filter(function (f) { return String(f.board).indexOf(filter) >= 0; })
    : all;

  var computed = flights.map(function (f) { return { f: f, r: computeRow(f) }; });
  window.__rows = computed.map(function (x) { return x.r.row; });

  var removed = 0;
  flights.forEach(function (f) { removed += trackStats(f).removed; });

  var html = '<div class="msg info">Файл <code>' + esc(res.name) + '</code> (' + res.fmt +
             '): показано вильотів <b>' + flights.length + '</b> з ' + all.length + '.</div>';

  if (res.fmt === "skylog" && res.boards.length > 1) {
    html += '<div class="msg warn">У лозі кілька бортів: <b>' + res.boards.join(", ") +
            '</b>. Стовпець 1 - визначений номер борта кожного вильоту.</div>';
  }
  if (filter && !flights.length) {
    html += '<div class="msg warn">Вильотів за фільтром "' + esc(filter) +
            '" немає. Борти в лозі: ' + esc(res.boards.join(", ")) + '.</div>';
  }
  if (removed > 0) {
    html += '<div class="msg warn">Відкинуто ' + removed + ' точок як телепорт/спуфінг (РЕБ).</div>';
  }
  if (res.fmt === "bin") {
    html += '<div class="msg warn">.bin: час взльоту/посадки - вручну (GPS-час підмінюється РЕБ); ' +
            'тривалість - з бортового годинника.</div>';
  }

  html += '<div class="row-actions">' +
          '<button onclick="copyAll(false)">Копіювати всі рядки</button>' +
          '<button class="ghost" onclick="copyAll(true)">Копіювати із заголовком</button></div>';

  html += "<table><thead><tr>" +
          COLUMNS.map(function (col) { return "<th>" + esc(col) + "</th>"; }).join("") +
          "<th></th></tr></thead><tbody>";

  computed.forEach(function (x, i) {
    var manual = x.r.manualCols;
    html += '<tr' + (x.r.ground ? ' title="ймовірно наземний тест (висота ~0)"' : '') + ">" +
      x.r.row.map(function (v, ci) {
        var cls = ci === 0 ? "board" : (manual.indexOf(ci) >= 0 ? "manual" : (x.r.ground ? "ground" : ""));
        return '<td class="' + cls + '">' + (esc(v) || (manual.indexOf(ci) >= 0 ? 'вручну' : '')) + '</td>';
      }).join("") +
      '<td><button class="ghost" onclick="copyRow(' + i + ')">Копіювати</button></td></tr>';
  });

  html += "</tbody></table>";
  html += '<div class="hint">Стовпець 1 (блакитний) - визначений номер борта. ' +
          (res.fmt === "bin" ? 'Жовті клітинки (час) - вручну. ' : '') +
          'Сірі рядки - ймовірно наземні тести.</div>';

  show(html);
}

window.copyRow = function (i) { copyText(window.__rows[i].join("\t")); };
window.copyAll = function (withHeader) {
  var lines = window.__rows.map(function (r) { return r.join("\t"); });
  if (withHeader) lines.unshift(COLUMNS.join("\t"));
  copyText(lines.join("\n"));
};

function copyText(t) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(function () { toast("Скопійовано"); }).catch(function () { fallbackCopy(t); });
  } else {
    fallbackCopy(t);
  }
}

function fallbackCopy(t) {
  var ta = document.createElement("textarea");
  ta.value = t;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); toast("Скопійовано"); }
  catch (e) { toast("Не вдалось"); }
  document.body.removeChild(ta);
}

function show(h) { result.innerHTML = h; }

function esc(s) {
  return String(s).replace(/[&<>"]/g, function (m) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m];
  });
}

var toastTimer;
function toast(msg) {
  var t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove("show"); }, 1600);
}
