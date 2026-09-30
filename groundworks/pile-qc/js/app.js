/**
 * Pile QC Report — multi-file upload UI and report rendering.
 * Handles large pile counts via virtualized Z chart + paginated table.
 */
(function () {
  var TABLE_PAGE = 400;
  var PDF_Z_MAX_PAGES = 100; // 1000 piles of Z charts in PDF

  var state = {
    designFiles: [],
    measuredFiles: [],
    machineFiles: [],
    design: null,
    measured: null,
    machine: null,
    report: null,
    warnings: [],
    zSelected: null,
    tableShown: 0,
    rebuildToken: 0,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function fileKey(f) {
    return f.name + '::' + f.size + '::' + f.lastModified;
  }

  function addFiles(list, fileList) {
    var existing = {};
    list.forEach(function (f) {
      existing[fileKey(f)] = true;
    });
    Array.prototype.forEach.call(fileList, function (f) {
      if (!existing[fileKey(f)]) list.push(f);
    });
  }

  function renderFileList(ulId, files, onRemove) {
    var ul = $(ulId);
    ul.innerHTML = '';
    files.forEach(function (f, idx) {
      var li = document.createElement('li');
      var span = document.createElement('span');
      span.textContent = f.name;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Remove';
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        onRemove(idx);
      });
      li.appendChild(span);
      li.appendChild(btn);
      ul.appendChild(li);
    });
  }

  function refreshLists() {
    renderFileList('list-design', state.designFiles, function (i) {
      state.designFiles.splice(i, 1);
      refreshLists();
      scheduleRebuild();
    });
    renderFileList('list-measured', state.measuredFiles, function (i) {
      state.measuredFiles.splice(i, 1);
      refreshLists();
      scheduleRebuild();
    });
    renderFileList('list-machine', state.machineFiles, function (i) {
      state.machineFiles.splice(i, 1);
      refreshLists();
      scheduleRebuild();
    });
  }

  function wireDropzone(zoneId, inputId, kind) {
    var zone = $(zoneId);
    var input = $(inputId);

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
        addFiles(state[kind + 'Files'], e.dataTransfer.files);
        refreshLists();
        scheduleRebuild();
      }
    });
    input.addEventListener('change', function () {
      if (input.files && input.files.length) {
        addFiles(state[kind + 'Files'], input.files);
        input.value = '';
        refreshLists();
        scheduleRebuild();
      }
    });
  }

  var rebuildTimer = null;
  function scheduleRebuild() {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(rebuild, 120);
  }

  function setBusy(msg) {
    var alertEl = $('alert');
    if (!msg) return;
    alertEl.textContent = msg;
    alertEl.classList.remove('hidden');
  }

  async function rebuild() {
    var alertEl = $('alert');
    var token = ++state.rebuildToken;
    state.warnings = [];
    state.design = null;
    state.measured = null;
    state.machine = null;
    state.report = null;
    state.zSelected = null;
    state.tableShown = 0;
    showZPointDetail(null);
    updateButtons();

    try {
      if (state.machineFiles.length && typeof XLSX === 'undefined') {
        throw new Error(
          'SheetJS library not loaded. Open this HTML while online once (or use a browser that can reach the CDN), then reload.'
        );
      }

      setBusy('Reading files…');
      await yieldToUi();

      if (state.designFiles.length) {
        state.design = await PileParsers.loadDesignFiles(state.designFiles);
        state.warnings = state.warnings.concat(state.design.warnings || []);
      }
      if (token !== state.rebuildToken) return;

      if (state.measuredFiles.length) {
        state.measured = await PileParsers.loadMeasuredFiles(state.measuredFiles);
        state.warnings = state.warnings.concat(state.measured.warnings || []);
      }
      if (token !== state.rebuildToken) return;

      if (state.machineFiles.length) {
        setBusy('Parsing machine quality reports (' + state.machineFiles.length + ')…');
        await yieldToUi();
        state.machine = await PileParsers.loadMachineFiles(state.machineFiles);
        state.warnings = state.warnings.concat(state.machine.warnings || []);
      }
      if (token !== state.rebuildToken) return;
    } catch (err) {
      alertEl.textContent = String(err && err.message ? err.message : err);
      alertEl.classList.remove('hidden');
      $('results').classList.add('hidden');
      updateButtons();
      return;
    }

    var loadedTypes = 0;
    if (state.design && state.design.count) loadedTypes++;
    if (state.measured && state.measured.count) loadedTypes++;
    if (state.machine && state.machine.count) loadedTypes++;

    if (loadedTypes < 2) {
      alertEl.textContent =
        'Load at least two source types (design, measured, and/or machine). Report shows only pile IDs common to every loaded type.';
      alertEl.classList.toggle(
        'hidden',
        !(state.designFiles.length || state.measuredFiles.length || state.machineFiles.length)
      );
      $('results').classList.add('hidden');
      updateButtons();
      return;
    }

    setBusy('Joining common pile IDs…');
    await yieldToUi();

    var report;
    try {
      report = PileQC.buildReport({
        design: state.design ? state.design.map : null,
        measured: state.measured ? state.measured.map : null,
        machine: state.machine ? state.machine.map : null,
      });
    } catch (err) {
      alertEl.textContent = 'Failed to build report: ' + (err && err.message ? err.message : err);
      alertEl.classList.remove('hidden');
      $('results').classList.add('hidden');
      updateButtons();
      return;
    }

    if (token !== state.rebuildToken) return;
    state.report = report;

    if (!report.counts.common) {
      alertEl.textContent =
        'No common pile IDs across loaded sources. Design=' +
        report.counts.design +
        ', Measured=' +
        report.counts.measured +
        ', Machine=' +
        report.counts.machine +
        '.';
      alertEl.classList.remove('hidden');
      $('results').classList.add('hidden');
      updateButtons();
      return;
    }

    var warnText = '';
    if (state.warnings.length) {
      warnText = state.warnings.slice(0, 6).join(' · ');
      if (state.warnings.length > 6) warnText += ' · +' + (state.warnings.length - 6) + ' more';
    }

    try {
      setBusy('Rendering charts and table (' + report.counts.common + ' piles)…');
      await yieldToUi();
      renderReport(report);
      $('results').classList.remove('hidden');
      if (warnText) {
        alertEl.textContent = warnText;
        alertEl.classList.remove('hidden');
      } else {
        alertEl.classList.add('hidden');
      }
    } catch (err) {
      alertEl.textContent = 'Render failed: ' + (err && err.message ? err.message : err);
      alertEl.classList.remove('hidden');
      console.error(err);
    }
    updateButtons();
  }

  function yieldToUi() {
    return new Promise(function (resolve) {
      setTimeout(resolve, 0);
    });
  }

  function setStat(id, value, note) {
    var el = $(id);
    if (el) el.textContent = value;
    var noteEl = $(id + '-note');
    if (noteEl) noteEl.textContent = note || '';
  }

  function renderReport(report) {
    var md = report.avg.measuredVsDesign;
    var kd = report.avg.machineVsDesign;

    setStat(
      'stat-count',
      String(report.counts.common),
      'of D' + report.counts.design + ' / M' + report.counts.measured + ' / K' + report.counts.machine
    );
    setStat('stat-dn', md ? PileQC.fmt(md.dn) : kd ? PileQC.fmt(kd.dn) : '—', md ? 'meas − design' : 'mach − design');
    setStat('stat-de', md ? PileQC.fmt(md.de) : kd ? PileQC.fmt(kd.de) : '—', md ? 'meas − design' : 'mach − design');
    setStat('stat-dz', md ? PileQC.fmt(md.dz) : kd ? PileQC.fmt(kd.dz) : '—', md ? 'meas − design' : 'mach − design');

    var med = report.medianZ || {};
    var roverEl = $('stat-median-rover');
    var machEl = $('stat-median-machine');
    if (roverEl) roverEl.textContent = med.roverDz != null ? PileQC.fmt(med.roverDz) : '—';
    if (machEl) machEl.textContent = med.machineDz != null ? PileQC.fmt(med.machineDz) : '—';

    var favor = '';
    if (md) favor += 'Measured favors <span class="chip chip-info">' + md.favor + '</span> ';
    if (kd) favor += 'Machine favors <span class="chip chip-ok">' + kd.favor + '</span>';
    $('favor-text').innerHTML = favor || '—';

    PileCharts.drawBullseye($('canvas-bullseye'), report);
    redrawZChart();
    var zScroll = $('z-scroll');
    if (zScroll) zScroll.scrollLeft = 0;

    state.tableShown = 0;
    renderTablePage(true);

    $('match-note').textContent =
      'Showing ' +
      report.counts.common +
      ' common ID(s) across: ' +
      report.sourcesUsed.join(', ') +
      '.';
  }

  function renderTablePage(reset) {
    if (!state.report) return;
    var tbody = $('table-body');
    if (reset) tbody.innerHTML = '';

    var rows = state.report.rows;
    var start = state.tableShown;
    var end = Math.min(rows.length, start + TABLE_PAGE);
    var frag = document.createDocumentFragment();

    for (var i = start; i < end; i++) {
      frag.appendChild(buildRow(rows[i]));
    }
    tbody.appendChild(frag);
    state.tableShown = end;

    var note = $('table-note');
    if (note) {
      note.textContent =
        'Showing ' +
        state.tableShown +
        ' of ' +
        rows.length +
        ' rows. m−d = measured − design · k−d = machine − design · k−m = machine − measured. Units: ft.';
    }
    var wrap = $('table-more-wrap');
    if (wrap) wrap.style.display = state.tableShown < rows.length ? 'flex' : 'none';
  }

  function buildRow(r) {
    var tr = document.createElement('tr');
    function cell(v, cls) {
      var td = document.createElement('td');
      if (cls) td.className = cls;
      td.textContent = v == null || v === '' ? '—' : typeof v === 'number' ? PileQC.fmt(v) : String(v);
      return td;
    }
    tr.appendChild(cell(r.id, 'id'));
    tr.appendChild(cell(r.design && r.design.n));
    tr.appendChild(cell(r.design && r.design.e));
    tr.appendChild(cell(r.design && r.design.z));
    tr.appendChild(cell(r.measured && r.measured.n));
    tr.appendChild(cell(r.measured && r.measured.e));
    tr.appendChild(cell(r.measured && r.measured.z));
    tr.appendChild(cell(r.machine && r.machine.n));
    tr.appendChild(cell(r.machine && r.machine.e));
    tr.appendChild(cell(r.machine && r.machine.z));
    tr.appendChild(cell(r.md && r.md.dn));
    tr.appendChild(cell(r.md && r.md.de));
    tr.appendChild(cell(r.md && r.md.dz));
    tr.appendChild(cell(r.md && r.md.horiz));
    tr.appendChild(cell(r.kd && r.kd.dn));
    tr.appendChild(cell(r.kd && r.kd.de));
    tr.appendChild(cell(r.kd && r.kd.dz));
    tr.appendChild(cell(r.km && r.km.dn));
    tr.appendChild(cell(r.km && r.km.de));
    tr.appendChild(cell(r.km && r.km.dz));
    return tr;
  }

  function redrawZChart() {
    if (!state.report) return;
    var scrollEl = $('z-scroll');
    var canvas = $('canvas-z');
    var spacer = $('z-spacer');
    if (!scrollEl || !canvas) return;
    PileCharts.bindZViewport(scrollEl, canvas, spacer, state.report, {
      height: 420,
      pxPerPile: PileCharts.Z_PX_PER_PILE,
      selected: state.zSelected
        ? { id: state.zSelected.id, series: state.zSelected.series }
        : null,
    });
  }

  function fmtPt(n) {
    return PileQC.fmt(n, 3);
  }

  function showZPointDetail(hit) {
    var el = $('z-point-detail');
    if (!el) return;
    if (!hit) {
      el.classList.add('hidden');
      el.innerHTML = '';
      return;
    }
    var r = hit.row;
    var p = hit.plotted;
    var src = hit.series === 'measured' ? r.measured : hit.series === 'machine' ? r.machine : null;
    var des = r.design;
    var isMeas = hit.series === 'measured';

    var gnssHtml = '';
    if (isMeas && src && src.gnss) {
      var g = src.gnss;
      gnssHtml =
        '<div><span class="lbl">Horiz precision</span><span class="val">' +
        (g.hPrec != null ? fmtPt(g.hPrec) + ' ft' : '—') +
        '</span></div>' +
        '<div><span class="lbl">Vert precision</span><span class="val">' +
        (g.vPrec != null ? fmtPt(g.vPrec) + ' ft' : '—') +
        '</span></div>' +
        '<div><span class="lbl">Precision type</span><span class="val">' +
        (g.precType || '—') +
        '</span></div>' +
        '<div><span class="lbl">PDOP</span><span class="val">' +
        (g.pdop != null ? fmtPt(g.pdop) : '—') +
        '</span></div>' +
        '<div><span class="lbl">HDOP</span><span class="val">' +
        (g.hdop != null ? fmtPt(g.hdop) : '—') +
        '</span></div>' +
        '<div><span class="lbl">VDOP</span><span class="val">' +
        (g.vdop != null ? fmtPt(g.vdop) : '—') +
        '</span></div>' +
        (g.tilt != null
          ? '<div><span class="lbl">Tilt angle</span><span class="val">' + fmtPt(g.tilt) + '°</span></div>'
          : '');
    }

    el.classList.remove('hidden');
    el.classList.toggle('series-machine', hit.series === 'machine');
    el.innerHTML =
      '<h4>Pile ' +
      hit.id +
      ' · ' +
      hit.label +
      '</h4>' +
      '<div class="z-detail-grid">' +
      '<div><span class="lbl">Plotted ΔZ</span><span class="val">' +
      fmtPt(p.dz) +
      ' ft</span></div>' +
      '<div><span class="lbl">ΔN</span><span class="val">' +
      fmtPt(p.dn) +
      ' ft</span></div>' +
      '<div><span class="lbl">ΔE</span><span class="val">' +
      fmtPt(p.de) +
      ' ft</span></div>' +
      '<div><span class="lbl">Horiz</span><span class="val">' +
      fmtPt(p.horiz) +
      ' ft</span></div>' +
      '<div><span class="lbl">Design Z</span><span class="val">' +
      fmtPt(des && des.z) +
      '</span></div>' +
      '<div><span class="lbl">' +
      (isMeas ? 'Measured Z' : 'Machine Z') +
      '</span><span class="val">' +
      fmtPt(src && src.z) +
      '</span></div>' +
      '<div><span class="lbl">Design N / E</span><span class="val">' +
      fmtPt(des && des.n) +
      ' / ' +
      fmtPt(des && des.e) +
      '</span></div>' +
      '<div><span class="lbl">' +
      (isMeas ? 'Measured' : 'Machine') +
      ' N / E</span><span class="val">' +
      fmtPt(src && src.n) +
      ' / ' +
      fmtPt(src && src.e) +
      '</span></div>' +
      gnssHtml +
      '</div>' +
      '<p class="hint">Δ = ' +
      (isMeas ? 'measured − design' : 'machine − design') +
      '. Positive ΔZ = above design.' +
      (isMeas ? ' GNSS values are from the rover stakeout shot.' : '') +
      ' Click empty chart area to clear.</p>';
  }

  function wireZInteractions() {
    var zc = $('canvas-z');
    var scrollEl = $('z-scroll');
    if (!zc || zc._zWired) return;
    zc._zWired = true;

    if (scrollEl && !scrollEl._zScrollWired) {
      scrollEl._zScrollWired = true;
      var ticking = false;
      scrollEl.addEventListener('scroll', function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
          ticking = false;
          if (scrollEl._zPaint) scrollEl._zPaint();
        });
      });
      window.addEventListener('resize', function () {
        if (scrollEl._zPaint) scrollEl._zPaint();
      });
    }

    zc.addEventListener('mousemove', function (e) {
      if (!state.report) return;
      var hit = PileCharts.hitTestZ(zc, e.clientX, e.clientY);
      zc.style.cursor = hit ? 'pointer' : 'default';
    });

    zc.addEventListener('click', function (e) {
      if (!state.report) return;
      var hit = PileCharts.hitTestZ(zc, e.clientX, e.clientY);
      if (!hit) {
        state.zSelected = null;
        showZPointDetail(null);
        redrawZChart();
        return;
      }
      state.zSelected = { id: hit.id, series: hit.series };
      showZPointDetail(hit);
      redrawZChart();
    });
  }

  function updateButtons() {
    var ok = !!(state.report && state.report.counts.common);
    var pdf = $('btn-pdf');
    var csv = $('btn-csv');
    if (pdf) pdf.disabled = !ok;
    if (csv) csv.disabled = !ok;
  }

  function metaFromState() {
    return {
      jobName: ($('job-name') && $('job-name').value.trim()) || '',
      notes: ($('job-notes') && $('job-notes').value.trim()) || '',
      designFiles: state.designFiles.map(function (f) {
        return f.name;
      }),
      measuredFiles: state.measuredFiles.map(function (f) {
        return f.name;
      }),
      machineFiles: state.machineFiles.map(function (f) {
        return f.name;
      }),
    };
  }

  function init() {
    wireDropzone('dz-design', 'file-design', 'design');
    wireDropzone('dz-measured', 'file-measured', 'measured');
    wireDropzone('dz-machine', 'file-machine', 'machine');

    $('btn-pdf').addEventListener('click', function () {
      if (!state.report) return;
      try {
        var zPack = PileCharts.buildZPageImages(state.report, { maxPages: PDF_Z_MAX_PAGES });
        PilePdf.open(state.report, metaFromState(), {
          bullseye: PileCharts.toDataUrl($('canvas-bullseye')),
          zPages: zPack.pages,
          zMeta: zPack,
        });
      } catch (err) {
        alert('PDF export failed: ' + (err && err.message ? err.message : err));
        console.error(err);
      }
    });

    $('btn-csv').addEventListener('click', function () {
      if (!state.report) return;
      var blob = new Blob([PileQC.rowsToCsv(state.report)], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'pile-qc-common-ids.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    });

    $('btn-clear').addEventListener('click', function () {
      state.designFiles = [];
      state.measuredFiles = [];
      state.machineFiles = [];
      refreshLists();
      scheduleRebuild();
    });

    var more = $('btn-table-more');
    if (more) {
      more.addEventListener('click', function () {
        renderTablePage(false);
      });
    }

    refreshLists();
    updateButtons();
    wireZInteractions();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
