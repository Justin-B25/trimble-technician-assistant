/**
 * ST30 Top Mount Exercise UI — CSV + UP/DOWN rod heights → tip-spec compare.
 */
(function () {
  var state = { files: [], points: [], report: null, warnings: [] };

  function $(id) {
    return document.getElementById(id);
  }

  function fileKey(f) {
    return f.name + '::' + f.size + '::' + f.lastModified;
  }

  function addFiles(fileList) {
    var existing = {};
    state.files.forEach(function (f) {
      existing[fileKey(f)] = true;
    });
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
      btn.type = 'button';
      btn.textContent = 'Remove';
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        state.files.splice(idx, 1);
        renderFileList();
        rebuild();
      });
      li.appendChild(span);
      li.appendChild(btn);
      ul.appendChild(li);
    });
  }

  function setAlert(msg, isError) {
    var el = $('alert');
    if (!msg) {
      el.classList.add('hidden');
      el.textContent = '';
      return;
    }
    el.textContent = msg;
    el.classList.remove('hidden');
    el.classList.toggle('alert-error', !!isError);
  }

  function updateButtons() {
    var hasCsv = state.files.length > 0;
    var has = state.report && state.report.bench;
    if ($('btn-compute')) $('btn-compute').disabled = !hasCsv;
    $('btn-csv').disabled = !has;
    $('btn-pdf').disabled = !has;
  }

  function vsAdvertised(check, tilt) {
    if (tilt === 0) return { text: 'origin (0°)', cls: '' };
    if (!check) return { text: '—', cls: '' };
    var bits = [];
    var cls = 'ok';
    if (check.passXY) {
      bits.push('XY ' + check.horizMm.toFixed(1) + ' ≤ ' + check.specXY);
    } else {
      bits.push('XY ' + check.horizMm.toFixed(1) + ' > ' + check.specXY);
      cls = 'bad';
    }
    if (check.passZ) {
      bits.push('Z ' + check.zMm.toFixed(1) + ' ≤ ' + check.specZ);
    } else {
      bits.push('Z ' + check.zMm.toFixed(1) + ' > ' + check.specZ);
      cls = 'bad';
    }
    return { text: bits.join(' · '), cls: cls };
  }

  function fillActivityTable(tbodyId, rows) {
    var tbody = $(tbodyId);
    if (!tbody) return;
    tbody.innerHTML = '';
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      function td(t, cls) {
        var c = document.createElement('td');
        if (cls) c.className = cls;
        c.textContent = t;
        tr.appendChild(c);
      }
      var horiz = r.d ? Math.abs(r.d.horiz) : null;
      var absZ = r.d ? Math.abs(r.d.dz) : null;
      var vs = vsAdvertised(r.check, r.tilt);
      td(r.tiltLabel);
      td(r.pointName);
      td(TipDevCalc.fmtMm(horiz), r.check ? (r.check.passXY || r.tilt === 0 ? 'ok' : 'bad') : 'delta');
      td(r.check ? String(r.check.specXY) : '—');
      td(TipDevCalc.fmtMm(absZ), r.check ? (r.check.passZ || r.tilt === 0 ? 'ok' : 'bad') : '');
      td(r.check ? String(r.check.specZ) : '—');
      td(vs.text, vs.cls);
      tbody.appendChild(tr);
    });
  }

  function fillCompare(rows) {
    var tbody = $('tbody-compare');
    if (!tbody) return;
    tbody.innerHTML = '';
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      function td(t, cls) {
        var c = document.createElement('td');
        if (cls) c.className = cls;
        c.textContent = t;
        tr.appendChild(c);
      }
      td(r.tiltLabel);
      td(r.tipDownName);
      td(r.tipUpName);
      td(TipDevCalc.fmtMm(r.d && r.d.dn), 'delta');
      td(TipDevCalc.fmtMm(r.d && r.d.de), 'delta');
      td(TipDevCalc.fmtMm(r.d && r.d.dz));
      td(TipDevCalc.fmtMm(r.d && r.d.horiz));
      tbody.appendChild(tr);
    });
  }

  function highlightSpecRows(report) {
    var table = $('spec-table');
    if (!table) return;
    var hA = report && report.rodA && report.rodA.specRow ? report.rodA.specRow.heightM : null;
    var hB = report && report.rodB && report.rodB.specRow ? report.rodB.specRow.heightM : null;
    Array.prototype.forEach.call(table.querySelectorAll('tbody tr'), function (tr) {
      var h = Number(tr.getAttribute('data-height'));
      tr.classList.remove('is-up', 'is-down', 'is-both');
      var matchA = hA != null && Math.abs(h - hA) < 0.001;
      var matchB = hB != null && Math.abs(h - hB) < 0.001;
      if (matchA && matchB) tr.classList.add('is-both');
      else if (matchA) tr.classList.add('is-up');
      else if (matchB) tr.classList.add('is-down');
    });
    if ($('chip-a')) {
      $('chip-a').textContent = report && report.rodA
        ? 'UP → ' + TipDevCalc.fmt(report.rodA.rodHeightM, 3) + ' m · ' + report.rodA.specRow.label
        : 'UP → —';
    }
    if ($('chip-b')) {
      $('chip-b').textContent = report && report.rodB
        ? 'DOWN → ' + TipDevCalc.fmt(report.rodB.rodHeightM, 3) + ' m · ' + report.rodB.specRow.label
        : 'DOWN → —';
    }
  }

  function updateSpecChipsFromForm() {
    var opts = optsFromForm();
    var fake = TipDevCalc.buildReport([], {
      rodHeightA: opts.rodHeightA,
      rodUnitA: opts.rodUnitA,
      rodHeightB: opts.rodHeightB,
      rodUnitB: opts.rodUnitB,
      coordUnit: opts.coordUnit,
      useCsvRodHeight: false,
    });
    highlightSpecRows({
      rodA: {
        rodHeightM: TipDevCalc.toMeters(opts.rodHeightA, opts.rodUnitA) || 1.545,
        specRow: TipDevCalc.pickSpecRow(TipDevCalc.toMeters(opts.rodHeightA, opts.rodUnitA) || 1.545),
      },
      rodB: {
        rodHeightM: TipDevCalc.toMeters(opts.rodHeightB, opts.rodUnitB) || 0.145,
        specRow: TipDevCalc.pickSpecRow(TipDevCalc.toMeters(opts.rodHeightB, opts.rodUnitB) || 0.145),
      },
    });
    void fake;
  }

  function renderResults() {
    var report = state.report;
    if (!report) {
      $('results').classList.add('hidden');
      updateButtons();
      updateSpecChipsFromForm();
      return;
    }
    $('results').classList.remove('hidden');
    var b = report.bench;
    $('stat-bench').textContent = b ? b.name : 'Missing UP0 / DOWN0';
    function rodLine(rod, entered, unit) {
      if (!rod) return '—';
      return (
        String(entered) +
        ' ' +
        unit +
        ' (= ' +
        TipDevCalc.fmt(Number(rod.rodHeightM), 3) +
        ' m) → ' +
        rod.specRow.label
      );
    }
    $('stat-rod-a').textContent = rodLine(report.rodA, $('rod-height-a').value, $('rod-unit-a').value);
    $('stat-rod-b').textContent = rodLine(report.rodB, $('rod-height-b').value, $('rod-unit-b').value);
    if ($('title-up')) $('title-up').textContent = report.rodA ? report.rodA.specRow.label : '';
    if ($('title-down')) $('title-down').textContent = report.rodB ? report.rodB.specRow.label : '';
    highlightSpecRows(report);
    // tbody-down = Activity A (UP*), tbody-up = Activity B (DOWN*)
    fillActivityTable('tbody-down', report.tipDown);
    fillActivityTable('tbody-up', report.tipUp);
    fillCompare(report.compare);
    if (state.warnings.length) setAlert(state.warnings.join('\n'), !report.bench);
    else setAlert('');
    updateButtons();
  }

  function optsFromForm() {
    return {
      rodHeightA: $('rod-height-a').value,
      rodUnitA: $('rod-unit-a').value,
      rodHeightB: $('rod-height-b').value,
      rodUnitB: $('rod-unit-b').value,
      coordUnit: $('coord-unit').value,
      useCsvRodHeight: false,
    };
  }

  async function rebuild() {
    state.points = [];
    state.report = null;
    state.warnings = [];
    updateButtons();
    updateSpecChipsFromForm();
    if (!state.files.length) {
      $('results').classList.add('hidden');
      setAlert('');
      return;
    }
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
    var zone = $('dz-csv');
    var input = $('file-csv');
    zone.addEventListener('click', function (e) {
      if (e.target.tagName !== 'BUTTON') input.click();
    });
    zone.addEventListener('dragover', function (e) {
      e.preventDefault();
      zone.classList.add('is-drag');
    });
    zone.addEventListener('dragleave', function () {
      zone.classList.remove('is-drag');
    });
    zone.addEventListener('drop', function (e) {
      e.preventDefault();
      zone.classList.remove('is-drag');
      if (e.dataTransfer && e.dataTransfer.files) {
        addFiles(e.dataTransfer.files);
        renderFileList();
        updateButtons();
        setAlert('CSV loaded. Set UP / DOWN rod heights, then press Compute tip results.');
      }
    });
    input.addEventListener('change', function () {
      if (input.files && input.files.length) {
        addFiles(input.files);
        input.value = '';
        renderFileList();
        updateButtons();
        setAlert('CSV loaded. Set UP / DOWN rod heights, then press Compute tip results.');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    wireDropzone();
    // Rod / unit edits only refresh the tip-spec highlight — press Compute for results
    ['rod-height-a', 'rod-unit-a', 'rod-height-b', 'rod-unit-b', 'coord-unit'].forEach(function (id) {
      if (!$(id)) return;
      $(id).addEventListener('input', updateSpecChipsFromForm);
      $(id).addEventListener('change', updateSpecChipsFromForm);
    });
    if ($('btn-compute')) {
      $('btn-compute').addEventListener('click', function () {
        if (!state.files.length) {
          setAlert('Drop a tip-table CSV first, then press Compute.', true);
          return;
        }
        rebuild();
      });
    }
    $('btn-clear').addEventListener('click', function () {
      state.files = [];
      state.points = [];
      state.report = null;
      state.warnings = [];
      renderFileList();
      $('results').classList.add('hidden');
      setAlert('');
      updateButtons();
      updateSpecChipsFromForm();
    });
    $('btn-csv').addEventListener('click', function () {
      if (!state.report) return;
      var blob = new Blob([TipDevCalc.rowsToCsv(state.report)], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'st30-top-mount-exercise.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    });
    $('btn-pdf').addEventListener('click', function () {
      if (!state.report) return;
      TipDevPdf.open(state.report, {
        job: $('job-name').value.trim(),
        date: new Date().toLocaleString(),
      });
    });
    updateButtons();
    updateSpecChipsFromForm();
  });
})();
