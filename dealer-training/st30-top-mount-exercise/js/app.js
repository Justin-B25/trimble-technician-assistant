/**
 * ST30 Top Mount Exercise UI.
 */
(function () {
  var state = { files: [], points: [], report: null, warnings: [] };

  function $(id) { return document.getElementById(id); }

  function fileKey(f) { return f.name + '::' + f.size + '::' + f.lastModified; }

  function addFiles(fileList) {
    var existing = {};
    state.files.forEach(function (f) { existing[fileKey(f)] = true; });
    Array.prototype.forEach.call(fileList, function (f) {
      if (!existing[fileKey(f)]) state.files.push(f);
    });
  }

  function renderFileList() {
    var ul = $('list-csv');
    ul.innerHTML = '';
    state.files.forEach(function (f, idx) {
      var li = document.createElement('li');
      var span = document.createElement('span');
      span.textContent = f.name;
      var btn = document.createElement('button');
      btn.type = 'button'; btn.textContent = 'Remove';
      btn.addEventListener('click', function (e) {
        e.stopPropagation(); state.files.splice(idx, 1); renderFileList(); rebuild();
      });
      li.appendChild(span); li.appendChild(btn); ul.appendChild(li);
    });
  }

  function setAlert(msg, isError) {
    var el = $('alert');
    if (!msg) { el.classList.add('hidden'); el.textContent = ''; return; }
    el.textContent = msg; el.classList.remove('hidden');
    el.classList.toggle('alert-error', !!isError);
  }

  function updateButtons() {
    var has = state.report && state.report.bench;
    $('btn-csv').disabled = !has;
    $('btn-pdf').disabled = !has;
  }

  function fillActivityTable(tbodyId, rows) {
    var tbody = $(tbodyId);
    tbody.innerHTML = '';
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      function td(t, cls) {
        var c = document.createElement('td');
        if (cls) c.className = cls;
        c.textContent = t; tr.appendChild(c);
      }
      td(r.tiltLabel);
      td(r.pointName);
      td(TipDevCalc.fmt(r.d && r.d.dn), 'delta');
      td(TipDevCalc.fmt(r.d && r.d.de), 'delta');
      td(TipDevCalc.fmt(r.d && r.d.dz));
      td(TipDevCalc.fmt(r.d && r.d.horiz));
      td(r.check ? r.check.specXY + ' | ' + r.check.specZ : '—');
      td(r.check ? (r.check.pass ? 'Y' : 'N') : '—', r.check ? (r.check.pass ? 'ok' : 'bad') : '');
      tbody.appendChild(tr);
    });
  }

  function fillCompare(rows) {
    var tbody = $('tbody-compare');
    tbody.innerHTML = '';
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      function td(t, cls) {
        var c = document.createElement('td');
        if (cls) c.className = cls;
        c.textContent = t; tr.appendChild(c);
      }
      td(r.tiltLabel); td(r.tipDownName); td(r.tipUpName);
      td(TipDevCalc.fmt(r.d && r.d.dn), 'delta');
      td(TipDevCalc.fmt(r.d && r.d.de), 'delta');
      td(TipDevCalc.fmt(r.d && r.d.dz));
      td(TipDevCalc.fmt(r.d && r.d.horiz));
      tbody.appendChild(tr);
    });
  }

  function sumLine(s) {
    if (!s) return '—';
    return 'n=' + s.count + ' · avg horiz ' + TipDevCalc.fmt(s.avgHoriz) +
      ' · max horiz ' + TipDevCalc.fmt(s.maxHoriz) + ' @ ' + (s.maxHorizTilt || '—');
  }

  function renderResults() {
    var report = state.report;
    if (!report) { $('results').classList.add('hidden'); updateButtons(); return; }
    $('results').classList.remove('hidden');
    var b = report.bench;
    $('stat-bench').textContent = b ? b.name : 'Missing';
    $('stat-rod').textContent = (report.rodHeightInput || '—') + ' ' + (report.rodUnit || '');
    $('stat-spec').textContent = report.specRow.label;
    $('stat-down').textContent = sumLine(report.summary.tipDown);
    $('stat-up').textContent = sumLine(report.summary.tipUp);
    fillActivityTable('tbody-down', report.tipDown);
    fillActivityTable('tbody-up', report.tipUp);
    fillCompare(report.compare);
    if (state.warnings.length) setAlert(state.warnings.join('\n'), !report.bench);
    else setAlert('');
    updateButtons();
  }

  function optsFromForm() {
    return { rodHeight: $('rod-height').value, rodUnit: $('rod-unit').value };
  }

  async function rebuild() {
    state.points = []; state.report = null; state.warnings = [];
    updateButtons();
    if (!state.files.length) { $('results').classList.add('hidden'); setAlert(''); return; }
    try {
      setAlert('Reading CSV…');
      var loaded = await TipDevParsers.loadCsvFiles(state.files);
      state.points = loaded.points;
      state.warnings = loaded.warnings || [];
      state.report = TipDevCalc.buildReport(state.points, optsFromForm());
      state.warnings = state.warnings.concat(state.report.warnings || []);
      renderResults();
    } catch (err) {
      setAlert(err && err.message ? err.message : String(err), true);
      $('results').classList.add('hidden');
    }
  }

  function wireDropzone() {
    var zone = $('dz-csv'), input = $('file-csv');
    zone.addEventListener('click', function (e) { if (e.target.tagName !== 'BUTTON') input.click(); });
    zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('is-drag'); });
    zone.addEventListener('dragleave', function () { zone.classList.remove('is-drag'); });
    zone.addEventListener('drop', function (e) {
      e.preventDefault(); zone.classList.remove('is-drag');
      if (e.dataTransfer && e.dataTransfer.files) { addFiles(e.dataTransfer.files); renderFileList(); rebuild(); }
    });
    input.addEventListener('change', function () {
      if (input.files && input.files.length) { addFiles(input.files); input.value = ''; renderFileList(); rebuild(); }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    wireDropzone();
    $('rod-height').addEventListener('change', rebuild);
    $('rod-unit').addEventListener('change', rebuild);
    $('btn-clear').addEventListener('click', function () {
      state.files = []; state.points = []; state.report = null; state.warnings = [];
      renderFileList(); $('results').classList.add('hidden'); setAlert(''); updateButtons();
    });
    $('btn-csv').addEventListener('click', function () {
      if (!state.report) return;
      var blob = new Blob([TipDevCalc.rowsToCsv(state.report)], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'st30-top-mount-exercise.csv'; a.click();
      URL.revokeObjectURL(a.href);
    });
    $('btn-pdf').addEventListener('click', function () {
      if (!state.report) return;
      TipDevPdf.open(state.report, { job: $('job-name').value.trim(), date: new Date().toLocaleString() });
    });
    updateButtons();
  });
})();
