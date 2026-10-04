/**
 * ST30 Top Mount Exercise UI.
 */
(function () {
  var state = { files: [], points: [], report: null, warnings: [], rodTouched: false };

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
      td(r.targetHeight != null ? TipDevCalc.fmt(Math.abs(r.targetHeight), 3) + ' m' : '—');
      td(r.tiltAngleDeg != null ? r.tiltAngleDeg.toFixed(2) + '°' : '—');
      td(r.pitchDeg != null ? r.pitchDeg.toFixed(2) + '°' : '—');
      td(r.rollDeg != null ? r.rollDeg.toFixed(2) + '°' : '—');
      td(TipDevCalc.fmtMm(r.d && r.d.dn), 'delta');
      td(TipDevCalc.fmtMm(r.d && r.d.de), 'delta');
      td(TipDevCalc.fmtMm(r.d && r.d.dz));
      td(TipDevCalc.fmtMm(r.d && r.d.horiz));
      td(r.check ? r.check.specXY + ' | ' + r.check.specZ : '—');
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
      td(TipDevCalc.fmtMm(r.d && r.d.dn), 'delta');
      td(TipDevCalc.fmtMm(r.d && r.d.de), 'delta');
      td(TipDevCalc.fmtMm(r.d && r.d.dz));
      td(TipDevCalc.fmtMm(r.d && r.d.horiz));
      tbody.appendChild(tr);
    });
  }

  function sumLine(s) {
    if (!s) return '—';
    return (
      'n=' +
      s.count +
      ' · avg horiz ' +
      TipDevCalc.fmtMm(s.avgHoriz) +
      ' mm · max horiz ' +
      TipDevCalc.fmtMm(s.maxHoriz) +
      ' mm @ ' +
      (s.maxHorizTilt || '—')
    );
  }

  function renderDebrief(debrief) {
    if (!debrief) return;
    function paint(qEl, aEl, q) {
      $(qEl).textContent = q.answer;
      $(qEl).className = 'debrief-answer';
      $(aEl).textContent = q.fillIn;
    }
    paint('debrief-q1-yn', 'debrief-q1-notes', debrief.q1);
    paint('debrief-q2-yn', 'debrief-q2-notes', debrief.q2);
    $('debrief-q3-yn').textContent = debrief.q3.horizMm != null ? debrief.q3.horizMm.toFixed(1) + ' mm' : '—';
    $('debrief-q3-yn').className = 'debrief-answer';
    $('debrief-q3-notes').textContent = debrief.q3.fillIn;
  }

  function renderResults() {
    var report = state.report;
    if (!report) { $('results').classList.add('hidden'); updateButtons(); return; }
    $('results').classList.remove('hidden');
    var b = report.bench;
    $('stat-bench').textContent = b ? b.name : 'Missing';
    if ($('stat-coord-unit')) $('stat-coord-unit').textContent = report.coordUnitLabel || '—';
    function rodLine(rod) {
      if (!rod) return '—';
      return (
        TipDevCalc.fmt(Number(rod.rodHeightM), 3) +
        ' m → ' +
        rod.specRow.label +
        (rod.rodFromCsv ? ' (CSV)' : '')
      );
    }
    if ($('stat-rod-a')) $('stat-rod-a').textContent = rodLine(report.rodA);
    if ($('stat-rod-b')) $('stat-rod-b').textContent = rodLine(report.rodB);
    $('stat-down').textContent = sumLine(report.summary.tipDown);
    $('stat-up').textContent = sumLine(report.summary.tipUp);
    renderDebrief(report.debrief);
    fillActivityTable('tbody-down', report.tipDown);
    fillActivityTable('tbody-up', report.tipUp);
    fillCompare(report.compare);
    if (state.warnings.length) setAlert(state.warnings.join('\n'), !report.bench);
    else setAlert('');
    updateButtons();
  }

  function optsFromForm() {
    return {
      rodHeightA: $('rod-height-a') ? $('rod-height-a').value : '1.55',
      rodUnitA: $('rod-unit-a') ? $('rod-unit-a').value : 'm',
      rodHeightB: $('rod-height-b') ? $('rod-height-b').value : '0.145',
      rodUnitB: $('rod-unit-b') ? $('rod-unit-b').value : 'm',
      coordUnit: $('coord-unit') ? $('coord-unit').value : 'usft',
      useCsvRodHeight: !state.rodTouched,
    };
  }

  function medianAbsM(points, activity, unit) {
    var vals = [];
    (points || []).forEach(function (p) {
      if (!p || !p.parsed || p.parsed.kind !== 'shot') return;
      if (p.parsed.activity !== activity) return;
      if (p.targetHeight == null) return;
      vals.push(Math.abs(p.targetHeight) * unit.toM);
    });
    if (!vals.length) return null;
    vals.sort(function (a, b) { return a - b; });
    var mid = Math.floor(vals.length / 2);
    return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
  }

  function applyCsvRodHeight(points) {
    if (state.rodTouched) return;
    var unit = TipDevCalc.coordUnitInfo($('coord-unit') ? $('coord-unit').value : 'usft');
    var medA = medianAbsM(points, 'A', unit);
    var medB = medianAbsM(points, 'B', unit);
    if (medA != null && $('rod-height-a')) {
      $('rod-height-a').value = String(Number(medA.toFixed(4)));
      if ($('rod-unit-a')) $('rod-unit-a').value = 'm';
    }
    if (medB != null && $('rod-height-b')) {
      $('rod-height-b').value = String(Number(medB.toFixed(4)));
      if ($('rod-unit-b')) $('rod-unit-b').value = 'm';
    }
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
      applyCsvRodHeight(state.points);
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
    function markRodTouched() { state.rodTouched = true; rebuild(); }
    ['rod-height-a', 'rod-unit-a', 'rod-height-b', 'rod-unit-b'].forEach(function (id) {
      if ($(id)) $(id).addEventListener('change', markRodTouched);
    });
    if ($('coord-unit')) $('coord-unit').addEventListener('change', rebuild);
    $('btn-clear').addEventListener('click', function () {
      state.files = []; state.points = []; state.report = null; state.warnings = []; state.rodTouched = false;
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
