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

  function vsAdvertised(r) {
    if (r.isOrigin) return { text: 'origin', cls: '' };
    if (!r.check) return { text: '—', cls: '' };
    var check = r.check;
    var bits = [];
    var cls = 'ok';
    if (check.passXY) {
      bits.push('XY ' + check.horizMm.toFixed(1) + ' ≤ ' + check.specXY.toFixed(1));
    } else {
      bits.push('XY ' + check.horizMm.toFixed(1) + ' > ' + check.specXY.toFixed(1));
      cls = 'bad';
    }
    if (check.passZ) {
      bits.push('Z ' + check.zMm.toFixed(1) + ' ≤ ' + check.specZ.toFixed(1));
    } else {
      bits.push('Z ' + check.zMm.toFixed(1) + ' > ' + check.specZ.toFixed(1));
      cls = 'bad';
    }
    return { text: bits.join(' · '), cls: cls };
  }

  function fmtDeg(n) {
    if (n == null || !Number.isFinite(n)) return '—';
    return n.toFixed(1) + '°';
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
      var vs = vsAdvertised(r);
      var leanTxt = fmtDeg(r.imuLean);
      if (r.leanFromName && r.imuLean != null) leanTxt = fmtDeg(r.imuLean) + ' (named)';
      else if (r.inverted && r.imuLean != null) leanTxt += ' (inv)';
      td(r.tiltLabel);
      td(leanTxt);
      td(r.pointName);
      td(TipDevCalc.fmtMm(horiz), r.check ? (r.check.passXY || r.isOrigin ? 'ok' : 'bad') : 'delta');
      td(r.check ? r.check.specXY.toFixed(1) : '—');
      td(TipDevCalc.fmtMm(absZ), r.check ? (r.check.passZ || r.isOrigin ? 'ok' : 'bad') : '');
      td(r.check ? r.check.specZ.toFixed(1) : '—');
      td(vs.text, vs.cls);
      tbody.appendChild(tr);
    });
  }

  function meterHtml(actual, spec, label) {
    if (actual == null || spec == null) return '';
    var max = Math.max(actual, spec, 1);
    var ok = actual <= spec + 1e-9;
    return (
      '<div class="vs-meter">' +
      '<div class="vs-meter__lab">' +
      label +
      '</div>' +
      '<div class="vs-meter__track">' +
      '<div class="vs-meter__spec" style="width:' +
      ((spec / max) * 100).toFixed(1) +
      '%"></div>' +
      '<div class="vs-meter__act ' +
      (ok ? 'is-ok' : 'is-over') +
      '" style="width:' +
      ((actual / max) * 100).toFixed(1) +
      '%"></div>' +
      '</div>' +
      '<div class="vs-meter__nums">' +
      actual.toFixed(1) +
      ' / ' +
      spec.toFixed(1) +
      ' mm</div></div>'
    );
  }

  function renderVsVisual(report) {
    var host = $('vs-visual');
    if (!host) return;
    function panel(title, rows) {
      var shots = (rows || []).filter(function (r) {
        return r.shot && !r.isOrigin;
      });
      if (!shots.length) return '';
      var body = shots
        .map(function (r) {
          var check = r.check;
          var imu = r.imuLean != null ? r.imuLean.toFixed(1) + '°' : 'named ' + r.tilt + '°';
          var pitch = r.pitchDeg != null ? r.pitchDeg.toFixed(1) + '°' : '—';
          var roll = r.rollDeg != null ? r.rollDeg.toFixed(1) + '°' : '—';
          return (
            '<div class="vs-shot">' +
            '<div class="vs-shot__head">' +
            '<strong>' +
            r.pointName +
            '</strong> · named ' +
            r.tilt +
            '° · IMU ' +
            imu +
            (r.inverted ? ' inverted' : '') +
            '</div>' +
            '<div class="vs-shot__meta">Pitch ' +
            pitch +
            ' · Roll ' +
            roll +
            '</div>' +
            (check ? meterHtml(check.horizMm, check.specXY, 'XY') : '') +
            (check ? meterHtml(check.zMm, check.specZ, 'Z') : '') +
            '</div>'
          );
        })
        .join('');
      return '<div class="vs-panel"><h3>' + title + '</h3>' + body + '</div>';
    }
    host.innerHTML = panel('UP vs UP0', report.tipDown) + panel('DOWN vs DOWN0', report.tipUp);
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
    var grid = $('formula-grid');
    if (grid) {
      var hA = report && report.rodA && report.rodA.specRow ? report.rodA.specRow.heightM : null;
      var hB = report && report.rodB && report.rodB.specRow ? report.rodB.specRow.heightM : null;
      Array.prototype.forEach.call(grid.querySelectorAll('.formula-card'), function (el) {
        var h = Number(el.getAttribute('data-height'));
        el.classList.remove('is-up', 'is-down', 'is-both');
        var matchA = hA != null && Math.abs(h - hA) < 0.001;
        var matchB = hB != null && Math.abs(h - hB) < 0.001;
        if (matchA && matchB) el.classList.add('is-both');
        else if (matchA) el.classList.add('is-up');
        else if (matchB) el.classList.add('is-down');
      });
    }
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
    renderWorkedExamples(report);
  }

  function barHtml(budget, axis) {
    if (!budget) return '';
    var ts = budget.tsMm;
    var c = axis === 'z' ? budget.zConst : budget.xyConst;
    var t = axis === 'z' ? budget.zTilt : budget.xyTilt;
    var total = axis === 'z' ? budget.specZ : budget.specXY;
    var max = Math.max(total, 1);
    function w(v) {
      return ((v / max) * 100).toFixed(1) + '%';
    }
    return (
      '<div class="spec-bar" title="' +
      (axis === 'z' ? budget.formulaZ : budget.formulaXY) +
      '">' +
      (ts > 0 ? '<span class="seg seg-ts" style="width:' + w(ts) + '">TS ' + ts.toFixed(1) + '</span>' : '') +
      '<span class="seg seg-const" style="width:' + w(c) + '">' + c + ' mm</span>' +
      '<span class="seg seg-tilt" style="width:' + w(t) + '">' + t.toFixed(1) + ' mm tilt</span>' +
      '<span class="seg-total">' +
      total.toFixed(1) +
      ' mm</span></div>'
    );
  }

  function workedPanel(title, rod, cls) {
    if (!rod || !rod.specRow) return '';
    var ts = Number($('ts-mm') && $('ts-mm').value) || 0;
    var rows = [5, 15, 30]
      .map(function (tilt) {
        var b = TipDevCalc.specBudget(rod.specRow, tilt, ts);
        return (
          '<div class="worked-tilt">' +
          '<div class="worked-tilt__label">' +
          tilt +
          '°</div>' +
          '<div class="worked-tilt__bars">' +
          '<div class="worked-axis">XY ' +
          barHtml(b, 'xy') +
          '</div>' +
          '<div class="worked-axis">Z ' +
          barHtml(b, 'z') +
          '</div>' +
          '</div></div>'
        );
      })
      .join('');
    var ex = TipDevCalc.specBudget(rod.specRow, 15, ts);
    return (
      '<div class="worked-panel ' +
      cls +
      '"><h3>' +
      title +
      ' · ' +
      rod.specRow.label +
      '</h3>' +
      '<p class="worked-ex">Example at 15° XY: ' +
      ex.formulaXY +
      ' = <strong>' +
      ex.specXY.toFixed(1) +
      ' mm</strong></p>' +
      rows +
      '</div>'
    );
  }

  function renderWorkedExamples(report) {
    var host = $('spec-worked');
    if (!host) return;
    var rodA = report && report.rodA;
    var rodB = report && report.rodB;
    host.innerHTML = workedPanel('UP shots', rodA, 'worked-up') + workedPanel('DOWN shots', rodB, 'worked-down');
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
    renderVsVisual(report);
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
      tsMm: $('ts-mm') ? $('ts-mm').value : 0,
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
      console.error('Tip compute failed', err);
      setAlert(
        'Compute failed: ' + (err && err.message ? err.message : String(err)),
        true
      );
      $('results').classList.add('hidden');
      updateButtons();
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
        rebuild();
      }
    });
    input.addEventListener('change', function () {
      if (input.files && input.files.length) {
        addFiles(input.files);
        input.value = '';
        renderFileList();
        updateButtons();
        rebuild();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    wireDropzone();
    // Rod / unit edits only refresh the tip-spec highlight — press Compute for results
    ['rod-height-a', 'rod-unit-a', 'rod-height-b', 'rod-unit-b', 'coord-unit', 'ts-mm'].forEach(function (id) {
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
        job: '',
        date: new Date().toLocaleString(),
      });
    });
    updateButtons();
    updateSpecChipsFromForm();
  });
})();
