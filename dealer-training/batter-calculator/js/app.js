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

  function readDesign() {
    return {
      n: $('design-n') ? $('design-n').value : '',
      e: $('design-e') ? $('design-e').value : '',
      z: $('design-z') ? $('design-z').value : '',
      inclinationFromVerticalDeg: $('design-incl') ? $('design-incl').value : '',
    };
  }

  function drawCrosshair(dN, dE, caption) {
    var wrap = document.createElement('div');
    wrap.className = 'crosshair';
    var size = 240;
    var pad = 32;
    var inner = size - pad * 2;
    var has = dN != null && dE != null && Number.isFinite(dN) && Number.isFinite(dE);
    var mag = has ? Math.max(Math.abs(dN), Math.abs(dE), 0.02) : 1;
    mag *= 1.25;
    var cx = size / 2;
    var cy = size / 2;
    function xOf(e) {
      return cx + (e / mag) * (inner / 2);
    }
    function yOf(n) {
      return cy - (n / mag) * (inner / 2);
    }
    var px = has ? xOf(dE) : cx;
    var py = has ? yOf(dN) : cy;
    var tick = mag;
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
    svg.setAttribute('class', 'crosshair-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute(
      'aria-label',
      has
        ? 'North-east crosshair. ΔN ' + dN.toFixed(3) + ', ΔE ' + dE.toFixed(3)
        : 'North-east crosshair. Enter design coordinates.'
    );

    function line(x1, y1, x2, y2, cls) {
      var el = document.createElementNS(svgNS, 'line');
      el.setAttribute('x1', x1);
      el.setAttribute('y1', y1);
      el.setAttribute('x2', x2);
      el.setAttribute('y2', y2);
      el.setAttribute('class', cls);
      svg.appendChild(el);
    }
    function txt(x, y, text, anchor) {
      var el = document.createElementNS(svgNS, 'text');
      el.setAttribute('x', x);
      el.setAttribute('y', y);
      el.setAttribute('text-anchor', anchor || 'middle');
      el.setAttribute('class', 'crosshair-label');
      el.textContent = text;
      svg.appendChild(el);
    }

    line(pad, cy, size - pad, cy, 'crosshair-axis');
    line(cx, pad, cx, size - pad, 'crosshair-axis');
    txt(size - 10, cy - 6, 'E', 'end');
    txt(10, cy - 6, 'W', 'start');
    txt(cx, 16, 'N');
    txt(cx, size - 8, 'S');
    txt(cx + 8, pad + 12, '+' + BatterCalc.fmt(tick), 'start');

    var origin = document.createElementNS(svgNS, 'circle');
    origin.setAttribute('cx', cx);
    origin.setAttribute('cy', cy);
    origin.setAttribute('r', 4);
    origin.setAttribute('class', 'crosshair-origin');
    svg.appendChild(origin);

    if (has) {
      var arm = document.createElementNS(svgNS, 'line');
      arm.setAttribute('x1', cx);
      arm.setAttribute('y1', cy);
      arm.setAttribute('x2', px);
      arm.setAttribute('y2', py);
      arm.setAttribute('class', 'crosshair-arm');
      svg.appendChild(arm);
      var dot = document.createElementNS(svgNS, 'circle');
      dot.setAttribute('cx', px);
      dot.setAttribute('cy', py);
      dot.setAttribute('r', 7);
      dot.setAttribute('class', 'crosshair-meas');
      svg.appendChild(dot);
    }

    wrap.appendChild(svg);
    var cap = document.createElement('div');
    cap.className = 'crosshair-caption';
    cap.textContent = caption || (has ? BatterCalc.fmtDeviation({ hasXy: true, dN: dN, dE: dE, planMiss: Math.sqrt(dN * dN + dE * dE) }) : 'Enter design Y/N and X/E');
    wrap.appendChild(cap);
    return wrap;
  }

  function renderPileCards(report) {
    var host = $('pile-cards');
    host.innerHTML = '';
    report.rows.forEach(function (r) {
      var card = document.createElement('div');
      card.className = 'pile-result-card' + (r.ok ? '' : ' pile-result-card--bad');

      var title = document.createElement('div');
      title.className = 'pile-result-card__title';
      title.textContent = (r.pileId === '1' ? 'Sono tube (single pile)' : 'Pile ' + r.pileId) + (r.ok ? '' : ' — incomplete');
      card.appendChild(title);

      var rowHost = card;
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
        rowHost.appendChild(line);
      }

      if (r.ok) {
        var vs = r.vsDesign || {};
        var measuredCut = (r.measuredPosition && r.measuredPosition.cutoff) || r.top;
        var compareCut = r.cutoff || measuredCut;
        var nums = document.createElement('div');
        nums.className = 'pile-result-card__nums';
        rowHost = nums;
        row(
          'Measured pile position (top / cut-off)',
          measuredCut
            ? 'Y/N ' +
              BatterCalc.fmt(measuredCut.n) +
              '   X/E ' +
              BatterCalc.fmt(measuredCut.e) +
              '   Z ' +
              BatterCalc.fmt(measuredCut.z)
            : '—',
          true
        );
        row('Bottom of pile center', BatterCalc.fmtCoord(r.bottom));
        row('Top of pile center', BatterCalc.fmtCoord(r.top));
        row('Batter angle (inclination)', BatterCalc.fmtInclination(r), true);
        row(
          'Azimuth (lean direction)',
          BatterCalc.fmtAzimuth(r.azimuthDeg) + (r.favor ? '  ·  ' + r.favor : ''),
          true
        );
        row('Lean from plumb (ΔN, ΔE)', BatterCalc.fmtVector(r), true);
        if (r.csvMeta) {
          var metaBits = [];
          if (r.csvMeta.targetHeightAbs != null) {
            metaBits.push('Target Ht |h| ' + BatterCalc.fmt(r.csvMeta.targetHeightAbs));
          }
          if (r.csvMeta.tiltAngleDeg != null) metaBits.push('Tilt° ' + r.csvMeta.tiltAngleDeg.toFixed(2));
          if (r.csvMeta.pitchDeg != null) metaBits.push('Pitch ' + r.csvMeta.pitchDeg.toFixed(2) + '°');
          if (r.csvMeta.rollDeg != null) metaBits.push('Roll ' + r.csvMeta.rollDeg.toFixed(2) + '°');
          if (r.csvMeta.autoPoleHeight) metaBits.push('Auto pole ' + r.csvMeta.autoPoleHeight);
          if (metaBits.length) row('From CSV (median of rim shots)', metaBits.join('  ·  '));
        }
        if (vs.hasXy || vs.hasZ || vs.hasIncl) {
          if (vs.hasXy) {
            row(
              'Design cut-off (X, Y, Z)',
              'Y/N ' +
                BatterCalc.fmt(vs.design.n) +
                '   X/E ' +
                BatterCalc.fmt(vs.design.e) +
                (vs.design.z != null ? '   Z ' + BatterCalc.fmt(vs.design.z) : '')
            );
            if (compareCut && vs.hasZ) {
              row(
                'Measured at design Z',
                'Y/N ' + BatterCalc.fmt(compareCut.n) + '   X/E ' + BatterCalc.fmt(compareCut.e) + '   Z ' + BatterCalc.fmt(compareCut.z)
              );
            }
            row('Deviation (ΔX, ΔY)', BatterCalc.fmtDeviation(vs), true);
          }
          if (vs.hasZ) row('ΔZ cut / fill vs design', BatterCalc.fmtCutFill(vs), true);
          if (vs.hasIncl) {
            row(
              'Inclination vs design',
              'Measured ' +
                BatterCalc.fmt(r.angleDeg, 2) +
                '°  ·  design ' +
                BatterCalc.fmt(vs.design.inclinationFromVerticalDeg, 2) +
                '°  ·  Δ ' +
                BatterCalc.fmt(vs.dInclinationDeg, 2) +
                '°'
            );
          }
        }
        if (r.inclination && r.inclination.smartLevelNote) {
          row('Smart level check', r.inclination.smartLevelNote);
        }
        var plotDn = vs.hasXy ? vs.dN : r.dn;
        var plotDe = vs.hasXy ? vs.dE : r.de;
        var plotCap = vs.hasXy
          ? 'Measured cut-off vs design  ·  origin = design'
          : 'Measured lean from plumb (ΔN / ΔE) — design coords optional';
        var body = document.createElement('div');
        body.className = 'pile-result-card__body';
        body.appendChild(nums);
        body.appendChild(drawCrosshair(plotDn, plotDe, plotCap));
        card.appendChild(body);
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
      td(r.azimuthDeg != null ? r.azimuthDeg.toFixed(1) + '°' : '—', 'delta');
      td(BatterCalc.fmt(r.cutoff && r.cutoff.n));
      td(BatterCalc.fmt(r.cutoff && r.cutoff.e));
      td(r.vsDesign && r.vsDesign.dN != null ? BatterCalc.fmt(r.vsDesign.dN) : '—', 'delta');
      td(r.vsDesign && r.vsDesign.dE != null ? BatterCalc.fmt(r.vsDesign.dE) : '—', 'delta');
      td(
        r.vsDesign && r.vsDesign.dZ != null
          ? BatterCalc.fmt(r.vsDesign.dZ) + (r.vsDesign.cutFill ? ' ' + r.vsDesign.cutFill : '')
          : '—',
        'delta'
      );
      td(
        r.vsDesign && r.vsDesign.dInclinationDeg != null ? BatterCalc.fmt(r.vsDesign.dInclinationDeg, 2) + '°' : '—',
        'delta'
      );
      td(r.favor || '—');
      td(r.ok ? 'OK' : 'Incomplete', r.ok ? 'ok' : 'bad');
      tbody.appendChild(tr);

      if (r.warnings && r.warnings.length) {
        var wr = document.createElement('tr');
        wr.className = 'row-warn';
        var wc = document.createElement('td');
        wc.colSpan = 22;
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
          'No points matched naming B1–B3 / T1–T3. Example: B1, B2, B3, T1, T2, T3.\n' +
            (state.warnings.join('\n') || ''),
          true
        );
        $('results').classList.add('hidden');
        return;
      }
      state.report = BatterCalc.buildReport(state.points, readDesign());
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
      design: readDesign(),
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
    ['design-n', 'design-e', 'design-z', 'design-incl'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener('input', function () {
        if (state.points && state.points.length) {
          state.report = BatterCalc.buildReport(state.points, readDesign());
          renderResults();
        }
      });
    });
    updateButtons();
  });
})();
