/**
 * Battered Pile / Batter Calculator — drag-drop Siteworks CSV UI.
 */
(function () {
  var state = {
    files: [],
    points: [],
    report: null,
    warnings: [],
  };

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
      if (!/\.csv$/i.test(f.name) && f.type && f.type.indexOf('csv') < 0 && f.type !== 'text/plain') {
        // still allow if named oddly but user dropped it
      }
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
    var has = state.report && state.report.rows && state.report.rows.length;
    $('btn-csv').disabled = !has;
    $('btn-pdf').disabled = !has;
  }

  function renderPileCards(report) {
    var host = $('pile-cards');
    host.innerHTML = '';
    report.rows.forEach(function (r) {
      var card = document.createElement('div');
      card.className = 'pile-result-card' + (r.ok ? '' : ' pile-result-card--bad');

      var title = document.createElement('div');
      title.className = 'pile-result-card__title';
      title.textContent = 'Pile ' + r.pileId + (r.ok ? '' : ' — incomplete');
      card.appendChild(title);

      function row(label, value, highlight) {
        var line = document.createElement('div');
        line.className = 'pile-result-card__row' + (highlight ? ' pile-result-card__row--vec' : '');
        var lab = document.createElement('div');
        lab.className = 'pile-result-card__label';
        lab.textContent = label;
        var val = document.createElement('div');
        val.className = 'pile-result-card__value';
        val.textContent = value;
        line.appendChild(lab);
        line.appendChild(val);
        card.appendChild(line);
      }

      if (r.ok) {
        row('Bottom of pile center', BatterCalc.fmtCoord(r.bottom));
        row('Top of pile center', BatterCalc.fmtCoord(r.top));
        row('Vector bottom → top (measured)', BatterCalc.fmtVector(r), true);
        row(
          'Vector magnitudes',
          '|XY| ' +
            BatterCalc.fmt(r.dxy) +
            '   |3D| ' +
            BatterCalc.fmt(r.length3d) +
            '   Batter ' +
            BatterCalc.fmtBatter(r.batter) +
            '   ' +
            (r.favor || '')
        );
        row('Pile inclination (smart level check)', BatterCalc.fmtInclination(r), true);
        if (r.inclination && r.inclination.smartLevelNote) {
          row('How to check', r.inclination.smartLevelNote);
        }
      } else {
        row('Status', (r.warnings || ['Need B1–B3 and T1–T3']).join(' · '));
        if (r.bottom) row('Bottom center (partial)', BatterCalc.fmtCoord(r.bottom));
        if (r.top) row('Top center (partial)', BatterCalc.fmtCoord(r.top));
      }

      host.appendChild(card);
    });
  }

  function renderResults() {
    var wrap = $('results');
    var report = state.report;
    if (!report || !report.rows.length) {
      wrap.classList.add('hidden');
      updateButtons();
      return;
    }
    wrap.classList.remove('hidden');

    $('stat-piles').textContent = report.okCount + ' / ' + report.pileCount;
    $('stat-points').textContent = String(report.pointCount);
    $('stat-dn').textContent = BatterCalc.fmt(report.avg.dn);
    $('stat-de').textContent = BatterCalc.fmt(report.avg.de);
    $('stat-dxy').textContent = BatterCalc.fmt(report.avg.dxy);
    $('stat-dz').textContent = BatterCalc.fmt(report.avg.dz);
    $('stat-batter').textContent = BatterCalc.fmtBatter(report.avg.batter);

    renderPileCards(report);

    var tbody = $('table-body');
    tbody.innerHTML = '';
    report.rows.forEach(function (r) {
      var tr = document.createElement('tr');
      if (!r.ok) tr.className = 'row-bad';
      function td(text, cls) {
        var cell = document.createElement('td');
        if (cls) cell.className = cls;
        cell.textContent = text;
        tr.appendChild(cell);
      }
      td(r.pileId, 'id');
      td(BatterCalc.fmt(r.bottom && r.bottom.n));
      td(BatterCalc.fmt(r.bottom && r.bottom.e));
      td(BatterCalc.fmt(r.bottom && r.bottom.z));
      td(BatterCalc.fmt(r.top && r.top.n));
      td(BatterCalc.fmt(r.top && r.top.e));
      td(BatterCalc.fmt(r.top && r.top.z));
      td(BatterCalc.fmt(r.dn), 'delta');
      td(BatterCalc.fmt(r.de), 'delta');
      td(BatterCalc.fmt(r.dz), 'delta');
      td(BatterCalc.fmt(r.dxy));
      td(BatterCalc.fmt(r.length3d));
      td(r.angleDeg != null ? r.angleDeg.toFixed(2) + '°' : '—', 'delta');
      td(r.inclineFromHorizontalDeg != null ? r.inclineFromHorizontalDeg.toFixed(2) + '°' : '—', 'delta');
      td(BatterCalc.fmtBatter(r.batter));
      td(r.favor || '—');
      td(r.ok ? 'OK' : 'Incomplete', r.ok ? 'ok' : 'bad');
      tbody.appendChild(tr);

      if (r.warnings && r.warnings.length) {
        var wr = document.createElement('tr');
        wr.className = 'row-warn';
        var wc = document.createElement('td');
        wc.colSpan = 17;
        wc.textContent = r.warnings.join(' · ');
        wr.appendChild(wc);
        tbody.appendChild(wr);
      }
    });

    if (state.warnings.length) {
      setAlert(state.warnings.join('\n'), false);
    } else {
      setAlert('');
    }
    updateButtons();
  }

  async function rebuild() {
    state.points = [];
    state.report = null;
    state.warnings = [];
    updateButtons();
    if (!state.files.length) {
      $('results').classList.add('hidden');
      setAlert('');
      return;
    }
    try {
      setAlert('Reading CSV…');
      var loaded = await BatterParsers.loadCsvFiles(state.files);
      state.points = loaded.points;
      state.warnings = loaded.warnings || [];
      if (!state.points.length) {
        setAlert(
          'No points matched naming {PileID}T1–T3 / B1–B3. Example: 1001T1, 1001B2.\n' +
            (state.warnings.join('\n') || ''),
          true
        );
        $('results').classList.add('hidden');
        return;
      }
      state.report = BatterCalc.buildReport(state.points);
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
      if (e.target.tagName === 'BUTTON') return;
      input.click();
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
        rebuild();
      }
    });
    input.addEventListener('change', function () {
      if (input.files && input.files.length) {
        addFiles(input.files);
        input.value = '';
        renderFileList();
        rebuild();
      }
    });
  }

  function downloadCsv() {
    if (!state.report) return;
    var blob = new Blob([BatterCalc.rowsToCsv(state.report)], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'batter-pile-report.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportPdf() {
    if (!state.report) return;
    BatterPdf.open(state.report, {
      job: $('job-name').value.trim(),
      notes: $('job-notes').value.trim(),
      date: new Date().toLocaleString(),
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    wireDropzone();
    $('btn-clear').addEventListener('click', function () {
      state.files = [];
      state.points = [];
      state.report = null;
      state.warnings = [];
      renderFileList();
      $('results').classList.add('hidden');
      setAlert('');
      updateButtons();
    });
    $('btn-csv').addEventListener('click', downloadCsv);
    $('btn-pdf').addEventListener('click', exportPdf);
    updateButtons();
  });
})();
