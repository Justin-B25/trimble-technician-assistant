/**
 * Pile QC Report — multi-file upload UI and report rendering.
 * Supports GNSS and UTS stakeout imports (selector), plus design and machine.
 */
(function () {
  var TABLE_PAGE = 400;
  var PDF_Z_MAX_PAGES = 100;
  var PDF_PILE_MAX = 250;

  var state = {
    designFiles: [],
    gnssFiles: [],
    utsFiles: [],
    machineFiles: [],
    design: null,
    gnss: null,
    uts: null,
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

  function selectedStakeoutKind() {
    var uts = $('kind-uts');
    return uts && uts.checked ? 'uts' : 'gnss';
  }

  function renderFileList(ulId, files, onRemove) {
    var ul = $(ulId);
    if (!ul) return;
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
    renderFileList('list-gnss', state.gnssFiles, function (i) {
      state.gnssFiles.splice(i, 1);
      refreshLists();
      scheduleRebuild();
    });
    renderFileList('list-uts', state.utsFiles, function (i) {
      state.utsFiles.splice(i, 1);
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
    if (!zone || !input) return;

    zone.addEventListener('click', function (e) {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.closest('label')) return;
      if (e.target.closest('.stakeout-kind')) return;
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
        ingestStakeoutOrKind(kind, e.dataTransfer.files);
      }
    });
    input.addEventListener('change', function () {
      if (input.files && input.files.length) {
        ingestStakeoutOrKind(kind, input.files);
        input.value = '';
      }
    });
  }

  function ingestStakeoutOrKind(kind, fileList) {
    if (kind === 'stakeout') {
      var sk = selectedStakeoutKind();
      addFiles(sk === 'uts' ? state.utsFiles : state.gnssFiles, fileList);
    } else {
      addFiles(state[kind + 'Files'], fileList);
    }
    refreshLists();
    scheduleRebuild();
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
    state.gnss = null;
    state.uts = null;
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

      if (state.gnssFiles.length) {
        state.gnss = await PileParsers.loadMeasuredFiles(state.gnssFiles);
        state.warnings = state.warnings.concat(state.gnss.warnings || []);
      }
      if (token !== state.rebuildToken) return;

      if (state.utsFiles.length) {
        state.uts = await PileParsers.loadMeasuredFiles(state.utsFiles);
        state.warnings = state.warnings.concat(state.uts.warnings || []);
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
    if (state.gnss && state.gnss.count) loadedTypes++;
    if (state.uts && state.uts.count) loadedTypes++;
    if (state.machine && state.machine.count) loadedTypes++;

    if (loadedTypes < 2) {
      alertEl.textContent =
        'Load at least two source types (design, GNSS stakeout, UTS stakeout, and/or machine). Report shows only pile IDs common to every loaded type.';
      alertEl.classList.toggle(
        'hidden',
        !(
          state.designFiles.length ||
          state.gnssFiles.length ||
          state.utsFiles.length ||
          state.machineFiles.length
        )
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
        gnss: state.gnss ? state.gnss.map : null,
        uts: state.uts ? state.uts.map : null,
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
        ', GNSS=' +
        report.counts.gnss +
        ', UTS=' +
        report.counts.uts +
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

  function fmtTriple(avg) {
    if (!avg) return '—';
    return PileQC.fmt(avg.dn) + ' / ' + PileQC.fmt(avg.de) + ' / ' + PileQC.fmt(avg.dz);
  }

  function renderReport(report) {
    var gd = report.avg.gnssVsDesign;
    var ud = report.avg.utsVsDesign;
    var kd = report.avg.machineVsDesign;
    var gm = report.avg.gnssVsMachine;
    var um = report.avg.utsVsMachine;

    $('stat-count').textContent = String(report.counts.common);
    $('stat-count-note').textContent =
      'D' +
      report.counts.design +
      ' / G' +
      report.counts.gnss +
      ' / U' +
      report.counts.uts +
      ' / K' +
      report.counts.machine;

    function showBlock(id, on) {
      var el = $(id);
      if (el) el.style.display = on ? '' : 'none';
    }

    showBlock('stat-gnss-block', report.hasGnss);
    showBlock('stat-uts-block', report.hasUts);
    showBlock('stat-mach-block', report.hasMachine);
    showBlock('stat-gnss-mach-block', report.hasGnss && report.hasMachine);
    showBlock('stat-uts-mach-block', report.hasUts && report.hasMachine);
    showBlock('median-gnss-wrap', report.hasGnss);
    showBlock('median-uts-wrap', report.hasUts);
    showBlock('median-mach-wrap', report.hasMachine);

    if ($('stat-gnss')) $('stat-gnss').textContent = fmtTriple(gd);
    if ($('stat-uts')) $('stat-uts').textContent = fmtTriple(ud);
    if ($('stat-mach')) $('stat-mach').textContent = fmtTriple(kd);
    if ($('stat-gnss-mach')) $('stat-gnss-mach').textContent = fmtTriple(gm);
    if ($('stat-uts-mach')) $('stat-uts-mach').textContent = fmtTriple(um);

    var med = report.medianZ || {};
    if ($('stat-median-gnss'))
      $('stat-median-gnss').textContent = med.gnssDz != null ? PileQC.fmt(med.gnssDz) : '—';
    if ($('stat-median-uts'))
      $('stat-median-uts').textContent = med.utsDz != null ? PileQC.fmt(med.utsDz) : '—';
    if ($('stat-median-machine'))
      $('stat-median-machine').textContent = med.machineDz != null ? PileQC.fmt(med.machineDz) : '—';

    var favor = '';
    if (gd)
      favor +=
        'GNSS vs design <span class="chip chip-info">' + gd.favor + '</span> ';
    if (ud)
      favor +=
        'UTS vs design <span class="chip chip-uts">' + ud.favor + '</span> ';
    if (kd)
      favor +=
        'Machine vs design <span class="chip chip-ok">' + kd.favor + '</span> ';
    if (gm)
      favor +=
        'GNSS vs machine <span class="chip chip-info">' + gm.favor + '</span> ';
    if (um)
      favor +=
        'UTS vs machine <span class="chip chip-uts">' + um.favor + '</span>';
    $('favor-text').innerHTML = favor || '—';

    PileCharts.drawBullseye($('canvas-bullseye'), report);
    redrawZChart();
    var zScroll = $('z-scroll');
    if (zScroll) zScroll.scrollLeft = 0;

    buildTableHead(report);
    state.tableShown = 0;
    renderTablePage(true);

    $('match-note').textContent =
      'Showing ' +
      report.counts.common +
      ' common ID(s) across: ' +
      report.sourcesUsed.join(', ') +
      '.';
  }

  function buildTableHead(report) {
    var thead = $('table-head');
    if (!thead) return;
    var cols = ['ID', 'Des N', 'Des E', 'Des Z'];
    if (report.hasGnss) cols.push('GNSS N', 'GNSS E', 'GNSS Z', 'ΔN g−d', 'ΔE g−d', 'ΔZ g−d', 'Horiz g');
    if (report.hasUts) cols.push('UTS N', 'UTS E', 'UTS Z', 'ΔN u−d', 'ΔE u−d', 'ΔZ u−d', 'Horiz u');
    if (report.hasMachine) cols.push('Mach N', 'Mach E', 'Mach Z', 'ΔN k−d', 'ΔE k−d', 'ΔZ k−d');
    if (report.hasGnss && report.hasMachine) cols.push('ΔN g−k', 'ΔE g−k', 'ΔZ g−k');
    if (report.hasUts && report.hasMachine) cols.push('ΔN u−k', 'ΔE u−k', 'ΔZ u−k');
    thead.innerHTML =
      '<tr>' +
      cols
        .map(function (c) {
          return '<th' + (c === 'ID' ? ' class="id"' : '') + '>' + c + '</th>';
        })
        .join('') +
      '</tr>';
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
      frag.appendChild(buildRow(rows[i], state.report));
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
        ' rows. g−d = GNSS − design · u−d = UTS − design · k−d = machine − design · g−k = GNSS − machine · u−k = UTS − machine. Units: ft.';
    }
    var wrap = $('table-more-wrap');
    if (wrap) wrap.style.display = state.tableShown < rows.length ? 'flex' : 'none';
  }

  function buildRow(r, report) {
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
    if (report.hasGnss) {
      tr.appendChild(cell(r.gnss && r.gnss.n));
      tr.appendChild(cell(r.gnss && r.gnss.e));
      tr.appendChild(cell(r.gnss && r.gnss.z));
      tr.appendChild(cell(r.gd && r.gd.dn));
      tr.appendChild(cell(r.gd && r.gd.de));
      tr.appendChild(cell(r.gd && r.gd.dz));
      tr.appendChild(cell(r.gd && r.gd.horiz));
    }
    if (report.hasUts) {
      tr.appendChild(cell(r.uts && r.uts.n));
      tr.appendChild(cell(r.uts && r.uts.e));
      tr.appendChild(cell(r.uts && r.uts.z));
      tr.appendChild(cell(r.ud && r.ud.dn));
      tr.appendChild(cell(r.ud && r.ud.de));
      tr.appendChild(cell(r.ud && r.ud.dz));
      tr.appendChild(cell(r.ud && r.ud.horiz));
    }
    if (report.hasMachine) {
      tr.appendChild(cell(r.machine && r.machine.n));
      tr.appendChild(cell(r.machine && r.machine.e));
      tr.appendChild(cell(r.machine && r.machine.z));
      tr.appendChild(cell(r.kd && r.kd.dn));
      tr.appendChild(cell(r.kd && r.kd.de));
      tr.appendChild(cell(r.kd && r.kd.dz));
    }
    if (report.hasGnss && report.hasMachine) {
      tr.appendChild(cell(r.gm && r.gm.dn));
      tr.appendChild(cell(r.gm && r.gm.de));
      tr.appendChild(cell(r.gm && r.gm.dz));
    }
    if (report.hasUts && report.hasMachine) {
      tr.appendChild(cell(r.um && r.um.dn));
      tr.appendChild(cell(r.um && r.um.de));
      tr.appendChild(cell(r.um && r.um.dz));
    }
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
    var src =
      hit.series === 'gnss' || hit.series === 'measured'
        ? r.gnss || r.measured
        : hit.series === 'uts'
          ? r.uts
          : hit.series === 'machine'
            ? r.machine
            : null;
    var des = r.design;
    var isGnss = hit.series === 'gnss' || hit.series === 'measured';
    var isUts = hit.series === 'uts';
    var seriesLabel = isGnss ? 'GNSS' : isUts ? 'UTS' : 'Machine';

    var metaHtml = '';
    if (isGnss && src && src.gnss) {
      var g = src.gnss;
      metaHtml =
        '<div><span class="lbl">Horiz precision</span><span class="val">' +
        (g.hPrec != null ? fmtPt(g.hPrec) + ' ft' : '—') +
        '</span></div>' +
        '<div><span class="lbl">Vert precision</span><span class="val">' +
        (g.vPrec != null ? fmtPt(g.vPrec) + ' ft' : '—') +
        '</span></div>' +
        '<div><span class="lbl">Precision type</span><span class="val">' +
        (g.precType || '—') +
        '</span></div>';
    }

    el.classList.remove('hidden');
    el.classList.toggle('series-machine', hit.series === 'machine');
    el.classList.toggle('series-uts', isUts);
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
      seriesLabel +
      ' Z</span><span class="val">' +
      fmtPt(src && src.z) +
      '</span></div>' +
      '<div><span class="lbl">Design N / E</span><span class="val">' +
      fmtPt(des && des.n) +
      ' / ' +
      fmtPt(des && des.e) +
      '</span></div>' +
      '<div><span class="lbl">' +
      seriesLabel +
      ' N / E</span><span class="val">' +
      fmtPt(src && src.n) +
      ' / ' +
      fmtPt(src && src.e) +
      '</span></div>' +
      metaHtml +
      '</div>' +
      '<p class="hint">Δ = ' +
      seriesLabel.toLowerCase() +
      ' − design. Positive ΔZ = above design. Click empty chart area to clear.</p>';
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
      gnssFiles: state.gnssFiles.map(function (f) {
        return f.name;
      }),
      utsFiles: state.utsFiles.map(function (f) {
        return f.name;
      }),
      measuredFiles: state.gnssFiles.map(function (f) {
        return f.name;
      }),
      machineFiles: state.machineFiles.map(function (f) {
        return f.name;
      }),
    };
  }

  function init() {
    wireDropzone('dz-design', 'file-design', 'design');
    wireDropzone('dz-stakeout', 'file-stakeout', 'stakeout');
    wireDropzone('dz-machine', 'file-machine', 'machine');

    $('btn-pdf').addEventListener('click', function () {
      if (!state.report) return;
      try {
        setBusy('Building landscape PDF…');
        var zPack = PileCharts.buildZPageImages(state.report, { maxPages: PDF_Z_MAX_PAGES });
        var pilePack = PileCharts.buildPilePageImages(state.report, { maxPiles: PDF_PILE_MAX });
        PilePdf.open(state.report, metaFromState(), {
          bullseye: PileCharts.toDataUrl($('canvas-bullseye')),
          zPages: zPack.pages,
          zMeta: zPack,
          pilePages: pilePack.pages,
          pileMeta: pilePack,
        });
        var alertEl = $('alert');
        if (alertEl) alertEl.classList.add('hidden');
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
      state.gnssFiles = [];
      state.utsFiles = [];
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
