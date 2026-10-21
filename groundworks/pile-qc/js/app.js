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
    /** Active rover mode from radios: gnss | uts | both — filters report series. */
    roverMode: 'gnss',
    design: null,
    gnss: null,
    uts: null,
    machine: null,
    report: null,
    warnings: [],
    zSelected: null,
    tableShown: 0,
    rebuildToken: 0,
    pileToPile: null,
    /** Map of pile ID string → true when excluded from all computations. */
    excludedIds: Object.create(null),
    /** Candidate IDs from last join (before exclude). */
    candidateIds: [],
    /** Field drive-log rows: { id, guidanceRemainingFt, machineDisplayedRaw, notes }. */
    driveRows: [],
    driveCompare: null,
  };

  /**
   * Test 1 Full Down Pressure — guidance rem (ft) vs machine-displayed rem (inches).
   * Pair with samples/test1-full-down-pressure/*.csv. Other tests: import their own drive-log CSV.
   */
  var DRIVE_LOG_SEED = [
    { id: '1161', guidanceRemainingFt: 0.2, machineDisplayedRaw: 0.04, notes: 'cut off elevation' },
    { id: '1160', guidanceRemainingFt: 0.24, machineDisplayedRaw: 0.1, notes: '' },
    { id: '1159', guidanceRemainingFt: 0.08, machineDisplayedRaw: 0.1, notes: 'Down 1000' },
    { id: '1158', guidanceRemainingFt: 0.2, machineDisplayedRaw: 0.09, notes: 'V1.02 Trimble 2.0' },
    { id: '1157', guidanceRemainingFt: 0.16, machineDisplayedRaw: 0.05, notes: '' },
    { id: '1156', guidanceRemainingFt: 0.08, machineDisplayedRaw: 0.07, notes: '' },
    { id: '1155', guidanceRemainingFt: 0.12, machineDisplayedRaw: 0.02, notes: 'Tall pile' },
    { id: '1154', guidanceRemainingFt: 0.2, machineDisplayedRaw: 0.09, notes: '' },
    { id: '1153', guidanceRemainingFt: 0.13, machineDisplayedRaw: 0.2, notes: 'Tall pile' },
    { id: '1152', guidanceRemainingFt: 0.1, machineDisplayedRaw: 0.2, notes: '' },
    { id: '1151', guidanceRemainingFt: 0.07, machineDisplayedRaw: 0.16, notes: 'Down 1800' },
    { id: '1150', guidanceRemainingFt: 0.06, machineDisplayedRaw: 0.16, notes: 'V1.02 Trimble 2.0' },
    { id: '1149', guidanceRemainingFt: 0.07, machineDisplayedRaw: 0.2, notes: 'Large Hammer Slowdown Zone' },
    { id: '1148', guidanceRemainingFt: 0.07, machineDisplayedRaw: 0.16, notes: '' },
    { id: '1147', guidanceRemainingFt: 0.08, machineDisplayedRaw: 0.2, notes: '' },
    { id: '1146', guidanceRemainingFt: 0.07, machineDisplayedRaw: 0.24, notes: '' },
    { id: '1141', guidanceRemainingFt: 0.05, machineDisplayedRaw: 0.2, notes: '' },
    { id: '1140', guidanceRemainingFt: 0.07, machineDisplayedRaw: 0.08, notes: '' },
    { id: '1139', guidanceRemainingFt: 0.06, machineDisplayedRaw: 0.16, notes: '' },
    { id: '1138', guidanceRemainingFt: 0.07, machineDisplayedRaw: 0.16, notes: '' },
    { id: '1137', guidanceRemainingFt: 0.08, machineDisplayedRaw: 0.24, notes: '' },
    { id: '1136', guidanceRemainingFt: 0.04, machineDisplayedRaw: 0.04, notes: 'Restarted hammer momentarily' },
    { id: '1135', guidanceRemainingFt: 0.1, machineDisplayedRaw: 0.2, notes: '' },
    { id: '1134', guidanceRemainingFt: 0.06, machineDisplayedRaw: 0.2, notes: '' },
    { id: '1133', guidanceRemainingFt: 0.08, machineDisplayedRaw: 0.2, notes: 'Slowed hammer' },
    { id: '1132', guidanceRemainingFt: 0.08, machineDisplayedRaw: 0.24, notes: '' },
    { id: '1131', guidanceRemainingFt: 0.07, machineDisplayedRaw: 0.04, notes: 'Hammer restarted' },
    { id: '1130', guidanceRemainingFt: 0.07, machineDisplayedRaw: null, notes: 'No machine-displayed reading' },
    { id: '1129', guidanceRemainingFt: 0.07, machineDisplayedRaw: 0.09, notes: 'Hammer restarted' },
    { id: '1128', guidanceRemainingFt: 0.05, machineDisplayedRaw: 0.2, notes: 'Hammer restarted' },
    { id: '1127', guidanceRemainingFt: 0.05, machineDisplayedRaw: 0.0, notes: 'Hammer restart' },
    { id: '1126', guidanceRemainingFt: 0.09, machineDisplayedRaw: 0.16, notes: '' },
  ];

  function excludedIdList() {
    return Object.keys(state.excludedIds).filter(function (id) {
      return state.excludedIds[id];
    });
  }

  function setExcluded(id, on) {
    id = String(id).trim();
    if (!id) return;
    if (on) state.excludedIds[id] = true;
    else delete state.excludedIds[id];
  }

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

  function selectedRoverMode() {
    var checked = document.querySelector('input[name="stakeout-kind"]:checked');
    var v = checked ? checked.value : 'gnss';
    if (v === 'uts' || v === 'both' || v === 'gnss') return v;
    return 'gnss';
  }

  function syncRoverModeFromUi() {
    state.roverMode = selectedRoverMode();
    var hint = $('stakeout-mode-hint');
    if (!hint) return;
    if (state.roverMode === 'gnss') {
      hint.textContent =
        'GNSS rover — imports tag as GNSS. Summary compares GNSS to design and machine.';
    } else if (state.roverMode === 'uts') {
      hint.textContent =
        'UTS — imports tag as UTS. Summary compares UTS to design and machine.';
    } else {
      hint.textContent =
        'Both — load a GNSS CSV and a UTS CSV. Summary shows each vs design and vs machine (Add GNSS / Add UTS, or Choose Files with …UTS… in the name).';
    }
  }

  /** Lists stay tagged; mode only controls which lists are loaded into the report. */

  function guessKindFromName(name) {
    var n = String(name || '').toUpperCase();
    if (/\bUTS\b/.test(n) || /_UTS/.test(n) || /UTS\.CSV$/.test(n) || /UTS/.test(n)) return 'uts';
    if (/\bGNSS\b/.test(n) || /GPS/.test(n) || /ROVER/.test(n)) return 'gnss';
    return null;
  }

  function renderFileList(ulId, files, onRemove, otherKind) {
    var ul = $(ulId);
    if (!ul) return;
    ul.innerHTML = '';
    files.forEach(function (f, idx) {
      var li = document.createElement('li');
      var span = document.createElement('span');
      span.textContent = f.name;
      var actions = document.createElement('span');
      actions.className = 'file-list-actions';
      if (otherKind) {
        var move = document.createElement('button');
        move.type = 'button';
        move.textContent = otherKind === 'uts' ? '→ UTS' : '→ GNSS';
        move.title = 'Move this file to the ' + otherKind.toUpperCase() + ' list';
        move.addEventListener('click', function (e) {
          e.stopPropagation();
          moveStakeoutFile(otherKind === 'uts' ? 'gnss' : 'uts', idx);
        });
        actions.appendChild(move);
      }
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Remove';
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        onRemove(idx);
      });
      actions.appendChild(btn);
      li.appendChild(span);
      li.appendChild(actions);
      ul.appendChild(li);
    });
  }

  function moveStakeoutFile(fromKind, idx) {
    var from = fromKind === 'uts' ? state.utsFiles : state.gnssFiles;
    var to = fromKind === 'uts' ? state.gnssFiles : state.utsFiles;
    if (idx < 0 || idx >= from.length) return;
    var f = from.splice(idx, 1)[0];
    addFiles(to, [f]);
    refreshLists();
    scheduleRebuild();
  }

  function refreshLists() {
    var allowMove = true;
    renderFileList('list-design', state.designFiles, function (i) {
      state.designFiles.splice(i, 1);
      refreshLists();
      scheduleRebuild();
    });
    renderFileList(
      'list-gnss',
      state.gnssFiles,
      function (i) {
        state.gnssFiles.splice(i, 1);
        refreshLists();
        scheduleRebuild();
      },
      allowMove ? 'uts' : null
    );
    renderFileList(
      'list-uts',
      state.utsFiles,
      function (i) {
        state.utsFiles.splice(i, 1);
        refreshLists();
        scheduleRebuild();
      },
      allowMove ? 'gnss' : null
    );
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
      if (e.target.closest('.stakeout-kind') || e.target.closest('.stakeout-add-row')) return;
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

  function ingestStakeoutFiles(fileList, forceKind) {
    Array.prototype.forEach.call(fileList, function (f) {
      var kind = forceKind;
      if (!kind) {
        var mode = selectedRoverMode();
        if (mode === 'uts') kind = 'uts';
        else if (mode === 'gnss') kind = 'gnss';
        else kind = guessKindFromName(f.name) || 'gnss';
      }
      if (kind === 'uts') addFiles(state.utsFiles, [f]);
      else addFiles(state.gnssFiles, [f]);
    });
    refreshLists();
    scheduleRebuild();
  }

  function ingestStakeoutOrKind(kind, fileList) {
    if (kind === 'stakeout') {
      ingestStakeoutFiles(fileList, null);
      return;
    }
    if (kind === 'stakeout-gnss') {
      ingestStakeoutFiles(fileList, 'gnss');
      return;
    }
    if (kind === 'stakeout-uts') {
      ingestStakeoutFiles(fileList, 'uts');
      return;
    }
    addFiles(state[kind + 'Files'], fileList);
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
      var needsXlsx = state.machineFiles.some(function (f) {
        return /\.xlsx?$/i.test(f.name);
      });
      if (needsXlsx && typeof XLSX === 'undefined') {
        throw new Error(
          'SheetJS library not loaded (needed for .xlsx). Use a Quality Metrics .csv or PileQual .xml instead, or open this page online once and reload.'
        );
      }

      setBusy('Reading files…');
      await yieldToUi();
      syncRoverModeFromUi();
      var mode = state.roverMode;

      if (state.designFiles.length) {
        state.design = await PileParsers.loadDesignFiles(state.designFiles);
        state.warnings = state.warnings.concat(state.design.warnings || []);
      }
      if (token !== state.rebuildToken) return;

      if (mode === 'both' || mode === 'gnss') {
        if (state.gnssFiles.length) {
          state.gnss = await PileParsers.loadMeasuredFiles(state.gnssFiles);
          state.warnings = state.warnings.concat(state.gnss.warnings || []);
        } else if (mode === 'gnss' && state.utsFiles.length) {
          state.warnings.push(
            'GNSS only mode: UTS files are listed but ignored — switch to Both or move them with → GNSS.'
          );
        }
      }
      if (token !== state.rebuildToken) return;

      if (mode === 'both' || mode === 'uts') {
        if (state.utsFiles.length) {
          state.uts = await PileParsers.loadMeasuredFiles(state.utsFiles);
          state.warnings = state.warnings.concat(state.uts.warnings || []);
        } else if (mode === 'uts' && state.gnssFiles.length) {
          state.warnings.push(
            'UTS only mode: GNSS files are listed but ignored — switch to Both or move them with → UTS.'
          );
        }
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
      var modeHint =
        state.roverMode === 'uts'
          ? ' Rover mode is UTS only — add a UTS stakeout (or switch mode), plus design and/or machine.'
          : state.roverMode === 'gnss'
            ? ' Rover mode is GNSS only — add a GNSS stakeout (or switch mode), plus design and/or machine.'
            : ' Add design and at least one rover (GNSS and/or UTS) or machine source.';
      alertEl.textContent =
        'Need at least two active source types for a report.' + modeHint;
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
      state.candidateIds = [];
      renderExcludeUi();
      updateButtons();
      return;
    }

    setBusy('Joining common pile IDs…');
    await yieldToUi();

    var report;
    try {
      report = PileQC.buildReport(
        {
          design: state.design ? state.design.map : null,
          gnss: state.gnss ? state.gnss.map : null,
          uts: state.uts ? state.uts.map : null,
          machine: state.machine ? state.machine.map : null,
        },
        { excludeIds: excludedIdList() }
      );
    } catch (err) {
      alertEl.textContent = 'Failed to build report: ' + (err && err.message ? err.message : err);
      alertEl.classList.remove('hidden');
      $('results').classList.add('hidden');
      updateButtons();
      return;
    }

    if (token !== state.rebuildToken) return;
    state.report = report;
    state.candidateIds = report.candidateIds || [];
    renderExcludeUi();

    if (!report.counts.common) {
      var exN = report.counts.excluded || 0;
      alertEl.textContent = exN
        ? 'All ' +
          exN +
          ' candidate pile(s) are excluded. Clear excludes or uncheck IDs to restore the sample.'
        : 'No common pile IDs across loaded sources. Design=' +
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

  function showBlock(id, on) {
    var el = $(id);
    if (el) el.style.display = on ? '' : 'none';
  }

  function setText(id, value) {
    var el = $(id);
    if (el) el.textContent = value == null || value === '' ? '—' : String(value);
  }

  function fillDeltaCard(prefix, avg, medianDz) {
    setText('stat-' + prefix + '-dn', avg ? PileQC.fmt(avg.dn) : '—');
    setText('stat-' + prefix + '-de', avg ? PileQC.fmt(avg.de) : '—');
    setText('stat-' + prefix + '-dz', avg ? PileQC.fmt(avg.dz) : '—');
    setText('stat-' + prefix + '-h', avg ? PileQC.fmt(avg.horiz) : '—');
    if (medianDz !== undefined) {
      setText(
        prefix === 'mach' ? 'stat-median-machine' : 'stat-median-' + prefix,
        medianDz != null ? PileQC.fmt(medianDz) : '—'
      );
    }
    var favorId =
      prefix === 'mach'
        ? 'favor-mach'
        : prefix === 'gnss-mach'
          ? 'favor-gnss-mach'
          : prefix === 'uts-mach'
            ? 'favor-uts-mach'
            : 'favor-' + prefix;
    setText(favorId, avg && avg.favor ? avg.favor : '—');
    var nId = 'n-' + prefix;
    var nEl = $(nId);
    if (nEl) {
      nEl.textContent =
        avg && avg.count != null ? 'n=' + avg.count : '';
    }
  }

  function renderSampleSizeBoard(report) {
    var sample = report.counts.sample != null ? report.counts.sample : report.counts.common;
    var designTotal = report.counts.design || 0;
    $('stat-count').textContent = String(sample);
    var pct =
      designTotal > 0 ? ((100 * sample) / designTotal).toFixed(0) : null;
    $('stat-count-note').textContent =
      (pct != null ? pct + '% of design · ' : '') +
      'piles with design + GNSS and/or UTS and/or machine' +
      (report.counts.excluded
        ? ' · ' + report.counts.excluded + ' excluded'
        : '');
    setText('stat-design-total', String(designTotal));
    var missing = Math.max(0, designTotal - sample);
    setText(
      'stat-design-note',
      missing
        ? missing + ' design ID(s) have no as-built in this load'
        : sample
          ? 'Every design ID has at least one as-built'
          : 'All IDs in design CSV(s)'
    );

    var lines = $('stat-series-lines');
    if (!lines) return;
    var parts = [];
    function line(label, n, fileN, cls) {
      if (n == null) return;
      parts.push(
        '<div class="sample-series-line ' +
          (cls || '') +
          '"><span>' +
          label +
          '</span><strong>n=' +
          n +
          '</strong>' +
          (fileN != null && fileN !== n
            ? '<em>of ' + fileN + ' in file</em>'
            : '') +
          '</div>'
      );
    }
    if (report.hasGnss)
      line('GNSS vs design', report.counts.gnssVsDesign, report.counts.gnss, 'is-gnss');
    if (report.hasUts)
      line('UTS vs design', report.counts.utsVsDesign, report.counts.uts, 'is-uts');
    if (report.hasMachine)
      line(
        'Machine vs design',
        report.counts.machineVsDesign,
        report.counts.machine,
        'is-mach'
      );
    if (report.hasGnss && report.hasMachine)
      line('GNSS vs machine', report.counts.gnssVsMachine, null, 'is-gnss');
    if (report.hasUts && report.hasMachine)
      line('UTS vs machine', report.counts.utsVsMachine, null, 'is-uts');
    lines.innerHTML = parts.join('') || '<div class="muted">No as-built series</div>';
  }

  function paintDeltaBars(prefix, avg, scaleMax) {
    ['dn', 'de', 'dz'].forEach(function (axis) {
      var el = $('bar-' + prefix + '-' + axis);
      if (!el) return;
      if (!avg || avg[axis] == null || !Number.isFinite(avg[axis]) || !scaleMax) {
        el.style.width = '0%';
        el.style.marginLeft = '50%';
        el.className = '';
        return;
      }
      var v = avg[axis];
      var pct = Math.min(50, (Math.abs(v) / scaleMax) * 50);
      el.style.width = pct + '%';
      if (v >= 0) {
        el.style.marginLeft = '50%';
        el.className = 'pos';
      } else {
        el.style.marginLeft = 50 - pct + '%';
        el.className = 'neg';
      }
    });
  }

  function renderReport(report) {
    var gd = report.avg.gnssVsDesign;
    var ud = report.avg.utsVsDesign;
    var kd = report.avg.machineVsDesign;
    var gm = report.avg.gnssVsMachine;
    var um = report.avg.utsVsMachine;
    var med = report.medianZ || {};

    renderSampleSizeBoard(report);

    showBlock('stat-gnss-block', !!(report.hasGnss && report.counts.gnssVsDesign));
    showBlock('stat-uts-block', !!(report.hasUts && report.counts.utsVsDesign));
    showBlock('stat-mach-block', !!(report.hasMachine && report.counts.machineVsDesign));
    showBlock(
      'stat-gnss-mach-block',
      !!(report.hasGnss && report.hasMachine && report.counts.gnssVsMachine)
    );
    showBlock(
      'stat-uts-mach-block',
      !!(report.hasUts && report.hasMachine && report.counts.utsVsMachine)
    );
    showBlock(
      'rover-mach-heading',
      (report.hasGnss || report.hasUts) && report.hasMachine
    );
    showBlock(
      'delta-vs-machine',
      (report.hasGnss || report.hasUts) && report.hasMachine
    );

    fillDeltaCard('gnss', gd, med.gnssDz);
    fillDeltaCard('uts', ud, med.utsDz);
    fillDeltaCard('mach', kd, med.machineDz);
    fillDeltaCard('gnss-mach', gm);
    fillDeltaCard('uts-mach', um);

    var scaleMax = 0.05;
    [gd, ud, kd].forEach(function (avg) {
      if (!avg) return;
      scaleMax = Math.max(scaleMax, Math.abs(avg.dn), Math.abs(avg.de), Math.abs(avg.dz));
    });
    if (report.hasGnss) paintDeltaBars('gnss', gd, scaleMax);
    if (report.hasUts) paintDeltaBars('uts', ud, scaleMax);
    if (report.hasMachine) paintDeltaBars('mach', kd, scaleMax);

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

    var modeLabel =
      state.roverMode === 'both'
        ? 'Both GNSS + UTS'
        : state.roverMode === 'uts'
          ? 'UTS only'
          : 'GNSS only';
    var joinHint =
      report.joinMode === 'design-union'
        ? 'design ∩ (rover ∪ machine)'
        : report.joinMode === 'intersection'
          ? 'intersection of loaded sources'
          : report.joinMode || 'join';
    var sample = report.counts.sample != null ? report.counts.sample : report.counts.common;
    var exclNote =
      report.counts.excluded > 0 ? ' · excluded ' + report.counts.excluded : '';
    $('match-note').textContent =
      'Rover mode: ' +
      modeLabel +
      '. Sample size ' +
      sample +
      ' (of ' +
      report.counts.design +
      ' design) via ' +
      joinHint +
      exclNote +
      ' · series n: GNSS ' +
      (report.counts.gnssVsDesign || 0) +
      ' · UTS ' +
      (report.counts.utsVsDesign || 0) +
      ' · Machine ' +
      (report.counts.machineVsDesign || 0) +
      '.';

    syncPileToPileSourceOptions();
    renderPileToPile();
    syncDriveTruthOptions();
    renderDriveScreenCompare();
  }

  function renderExcludeUi() {
    var list = excludedIdList().sort(function (a, b) {
      var na = Number(a);
      var nb = Number(b);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return String(a).localeCompare(String(b));
    });
    var summary = $('exclude-summary');
    if (summary) {
      summary.textContent = list.length
        ? list.length + ' pile(s) excluded from sample and computations.'
        : 'No piles excluded.';
    }
    var chips = $('exclude-chips');
    if (chips) {
      chips.innerHTML = '';
      list.forEach(function (id) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'exclude-chip';
        chip.setAttribute('data-id', id);
        chip.title = 'Remove exclude';
        chip.innerHTML = '<span>' + id + '</span><span class="exclude-chip-x" aria-hidden="true">×</span>';
        chips.appendChild(chip);
      });
    }
    var filterEl = $('exclude-filter');
    var filter = filterEl && filterEl.value ? filterEl.value.trim().toLowerCase() : '';
    var checklist = $('exclude-checklist');
    if (!checklist) return;
    var ids = state.candidateIds.slice();
    list.forEach(function (id) {
      if (ids.indexOf(id) < 0) ids.push(id);
    });
    ids.sort(function (a, b) {
      var na = Number(a);
      var nb = Number(b);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return String(a).localeCompare(String(b));
    });
    checklist.innerHTML = '';
    if (!ids.length) {
      checklist.innerHTML = '<p class="muted" style="margin:8px">Load design + as-built to list pile IDs.</p>';
      return;
    }
    var frag = document.createDocumentFragment();
    ids.forEach(function (id) {
      if (filter && String(id).toLowerCase().indexOf(filter) < 0) return;
      var label = document.createElement('label');
      label.className = 'exclude-check' + (state.excludedIds[id] ? ' is-excluded' : '');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !state.excludedIds[id];
      cb.setAttribute('data-id', id);
      label.appendChild(cb);
      label.appendChild(document.createTextNode(' ' + id));
      frag.appendChild(label);
    });
    checklist.appendChild(frag);
  }

  function applyExcludeIdsFromInput() {
    var input = $('exclude-input');
    if (!input) return;
    var raw = input.value || '';
    var parts = raw.split(/[,;\s]+/).map(function (s) {
      return s.trim();
    }).filter(Boolean);
    if (!parts.length) return;
    parts.forEach(function (id) {
      setExcluded(id, true);
    });
    input.value = '';
    renderExcludeUi();
    scheduleRebuild();
  }

  function readPileToPileSpec() {
    var el = $('ptp-spec');
    var v = el ? Number(el.value) : 0.02;
    if (!Number.isFinite(v) || v < 0) return 0.02;
    return v;
  }

  function syncPileToPileSourceOptions() {
    var sel = $('ptp-source');
    if (!sel) return;
    var prev = sel.value;
    var opts = [];
    if (state.gnss && state.gnss.count) opts.push({ value: 'gnss', label: 'GNSS as-built' });
    if (state.uts && state.uts.count) opts.push({ value: 'uts', label: 'UTS as-built' });
    sel.innerHTML = '';
    if (!opts.length) {
      var empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'Load GNSS or UTS stakeout';
      sel.appendChild(empty);
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    opts.forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      sel.appendChild(opt);
    });
    var prefer =
      opts.some(function (o) {
        return o.value === prev;
      })
        ? prev
        : opts[0].value;
    sel.value = prefer;
  }

  function renderPileToPile() {
    if (!$('ptp-section')) return;
    var sourceEl = $('ptp-source');
    var source = sourceEl && sourceEl.value ? sourceEl.value : '';
    var designMap = state.design && state.design.map;
    var asBuiltMap =
      source === 'uts'
        ? state.uts && state.uts.map
        : source === 'gnss'
          ? state.gnss && state.gnss.map
          : null;

    if (!source || !designMap || !asBuiltMap) {
      setText('ptp-pass', '—');
      setText('ptp-fail', '—');
      setText('ptp-max', '—');
      setText('ptp-mean', '—');
      setText('ptp-pass-note', '');
      setText('ptp-fail-note', '');
      setText('ptp-median-note', '');
      var verdictEmpty = $('ptp-verdict');
      if (verdictEmpty) {
        verdictEmpty.textContent =
          'PTP uses design Z vs GNSS or UTS as-built only (no machine). Load design + a stakeout.';
        verdictEmpty.className = 'ptp-verdict';
      }
      state.pileToPile = null;
      PileCharts.drawPileToPileZ($('canvas-ptp-plan'), $('canvas-ptp-bars'), null);
      var tb = $('ptp-table-body');
      if (tb) tb.innerHTML = '';
      return;
    }

    var ptp = PileQC.buildPileToPileZ({
      designMap: designMap,
      asBuiltMap: asBuiltMap,
      asBuiltSource: source,
      specFt: readPileToPileSpec(),
      excludeIds: excludedIdList(),
    });
    state.pileToPile = ptp;

    setText('ptp-pass', String(ptp.passCount));
    setText('ptp-fail', String(ptp.failCount));
    setText(
      'ptp-pass-note',
      ptp.count ? ptp.passCount + ' of ' + ptp.count + ' piles' : ''
    );
    setText(
      'ptp-fail-note',
      (ptp.pairFailCount
        ? ptp.pairFailCount + ' N–S pair(s) over spec'
        : ptp.count && !ptp.error
          ? 'All N–S pairs within spec'
          : '') +
        (ptp.rowCount ? ' · ' + ptp.rowCount + ' row(s)' : '') +
        (ptp.skippedGapPairs ? ' · ' + ptp.skippedGapPairs + ' gap skip(s)' : '')
    );
    setText('ptp-max', ptp.maxAbsDz != null ? PileQC.fmt(ptp.maxAbsDz) : '—');
    setText(
      'ptp-mean',
      ptp.meanAbsDz != null
        ? PileQC.fmt(ptp.meanAbsDz) + ' / ' + PileQC.fmt(ptp.medianAbsDz)
        : '—'
    );
    setText(
      'ptp-median-note',
      'Metric |(Z_ab−Z_des)_i − (Z_ab−Z_des)_j| · ' +
        source.toUpperCase() +
        ' · spec ' +
        PileQC.fmt(ptp.specFt) +
        ' ft'
    );

    var verdict = $('ptp-verdict');
    if (verdict) {
      if (ptp.error) {
        verdict.textContent = ptp.error;
        verdict.className = 'ptp-verdict';
      } else if (ptp.ok) {
        verdict.textContent =
          'N–S row residuals (design Z vs ' +
          source.toUpperCase() +
          ' as-built) are within ' +
          PileQC.fmt(ptp.specFt) +
          ' ft of each other.';
        verdict.className = 'ptp-verdict is-ok';
      } else {
        verdict.textContent =
          ptp.failCount +
          ' pile(s) / ' +
          ptp.pairFailCount +
          ' N–S pair(s) exceed ' +
          PileQC.fmt(ptp.specFt) +
          ' ft residual consistency (design vs ' +
          source.toUpperCase() +
          '; machine not used).';
        verdict.className = 'ptp-verdict is-fail';
      }
    }

    PileCharts.drawPileToPileZ($('canvas-ptp-plan'), $('canvas-ptp-bars'), ptp);

    var body = $('ptp-table-body');
    if (!body) return;
    body.innerHTML = '';
    var sorted = ptp.points.slice().sort(function (a, b) {
      return (b.absDz || 0) - (a.absDz || 0);
    });
    var frag = document.createDocumentFragment();
    var limit = Math.min(sorted.length, 200);
    for (var i = 0; i < limit; i++) {
      var p = sorted[i];
      var tr = document.createElement('tr');
      if (!p.pass) tr.className = 'ptp-row-fail';
      tr.innerHTML =
        '<td class="id">' +
        p.id +
        '</td><td>' +
        PileQC.fmt(p.zDesign) +
        '</td><td>' +
        PileQC.fmt(p.zAsBuilt) +
        '</td><td>' +
        PileQC.fmt(p.dzVsDesign) +
        '</td><td>' +
        (p.southId != null ? p.southId : '—') +
        '</td><td>' +
        (p.northId != null ? p.northId : '—') +
        '</td><td>' +
        (p.southDz != null ? PileQC.fmt(Math.abs(p.southDz)) : '—') +
        '</td><td>' +
        (p.northDz != null ? PileQC.fmt(Math.abs(p.northDz)) : '—') +
        '</td><td>' +
        (p.absDz != null ? PileQC.fmt(p.absDz) : '—') +
        '</td><td>' +
        (p.pass ? 'Pass' : 'Fail') +
        '</td>';
      frag.appendChild(tr);
    }
    body.appendChild(frag);
  }

  function syncDriveTruthOptions() {
    var sel = $('drive-truth-source');
    if (!sel) return;
    var prev = sel.value;
    var opts = [];
    if (state.uts && state.uts.count) opts.push({ value: 'uts', label: 'UTS as-built' });
    if (state.gnss && state.gnss.count) opts.push({ value: 'gnss', label: 'GNSS as-built' });
    sel.innerHTML = '';
    if (!opts.length) {
      var empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'Load GNSS or UTS stakeout';
      sel.appendChild(empty);
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    opts.forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      sel.appendChild(opt);
    });
    var prefer =
      opts.some(function (o) {
        return o.value === prev;
      })
        ? prev
        : opts[0].value;
    sel.value = prefer;
  }

  function readDriveMachineUnit() {
    var el = $('drive-machine-unit');
    return el && el.value === 'feet' ? 'feet' : 'inches';
  }

  function renderDriveScreenCompare() {
    if (!$('drive-screen-section')) return;
    var sourceEl = $('drive-truth-source');
    var source = sourceEl && sourceEl.value ? sourceEl.value : '';
    var designMap = state.design && state.design.map;
    var asBuiltMap =
      source === 'uts'
        ? state.uts && state.uts.map
        : source === 'gnss'
          ? state.gnss && state.gnss.map
          : null;

    if (!state.driveRows.length) {
      setText('drive-n', '—');
      setText('drive-wins', '—');
      setText('drive-err-gw', '—');
      setText('drive-err-machine', '—');
      setText('drive-n-note', 'Load seed or import CSV');
      setText('drive-ties-note', '');
      var vEmpty = $('drive-verdict');
      if (vEmpty) {
        vEmpty.textContent =
          'No drive-log rows yet. Import a drive-log CSV for this test, or load the Test 1 seed.';
        vEmpty.className = 'ptp-verdict';
      }
      state.driveCompare = null;
      var tb0 = $('drive-table-body');
      if (tb0) tb0.innerHTML = '';
      return;
    }

    if (!source || !designMap || !asBuiltMap) {
      setText('drive-n', String(state.driveRows.length));
      setText('drive-wins', '—');
      setText('drive-err-gw', '—');
      setText('drive-err-machine', '—');
      setText('drive-n-note', 'Need design + as-built for truth ΔZ');
      setText('drive-ties-note', '');
      var vNeed = $('drive-verdict');
      if (vNeed) {
        vNeed.textContent =
          'Drive log loaded (' +
          state.driveRows.length +
          ' rows). Load design and GNSS/UTS stakeout to score against as-built ΔZ.';
        vNeed.className = 'ptp-verdict';
      }
      state.driveCompare = null;
      renderDriveTableRows(
        state.driveRows.map(function (dr) {
          return {
            id: dr.id,
            guidanceRemainingFt: dr.guidanceRemainingFt != null ? dr.guidanceRemainingFt : dr.gwRemainingFt,
            gwRemainingFt: dr.guidanceRemainingFt != null ? dr.guidanceRemainingFt : dr.gwRemainingFt,
            machineDisplayedRaw: dr.machineDisplayedRaw,
            machineDisplayedFt: null,
            truthDz: null,
            errGw: null,
            errMachine: null,
            closer: null,
            notes: dr.notes || '',
          };
        })
      );
      return;
    }

    var cmp = PileQC.buildDriveScreenCompare({
      designMap: designMap,
      asBuiltMap: asBuiltMap,
      asBuiltSource: source,
      machineUnit: readDriveMachineUnit(),
      driveRows: state.driveRows,
      excludeIds: excludedIdList(),
    });
    state.driveCompare = cmp;

    setText('drive-n', String(cmp.withTruth));
    setText(
      'drive-n-note',
      cmp.count
        ? cmp.withTruth + ' of ' + cmp.count + ' log rows · ' + source.toUpperCase() + ' truth'
        : ''
    );
    var guidCloser = cmp.guidanceCloser != null ? cmp.guidanceCloser : cmp.gwCloser;
    setText(
      'drive-wins',
      cmp.withTruth ? guidCloser + ' / ' + cmp.machineCloser : '—'
    );
    setText(
      'drive-ties-note',
      cmp.ties ? cmp.ties + ' tie(s)' : cmp.withTruth ? 'Equal |err| ties: 0' : ''
    );
    var meanGuid =
      cmp.meanAbsErrGuidance != null ? cmp.meanAbsErrGuidance : cmp.meanAbsErrGw;
    setText('drive-err-gw', meanGuid != null ? PileQC.fmt(meanGuid) : '—');
    setText(
      'drive-err-machine',
      cmp.meanAbsErrMachine != null ? PileQC.fmt(cmp.meanAbsErrMachine) : '—'
    );

    var verdict = $('drive-verdict');
    if (verdict) {
      verdict.textContent = cmp.verdict || 'No piles with as-built truth matched the drive log.';
      verdict.className = 'ptp-verdict';
    }
    renderDriveTableRows(cmp.rows);
  }

  function renderDriveTableRows(rows) {
    var body = $('drive-table-body');
    if (!body) return;
    body.innerHTML = '';
    var frag = document.createDocumentFragment();
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var tr = document.createElement('tr');
      var rem =
        r.guidanceRemainingFt != null ? r.guidanceRemainingFt : r.gwRemainingFt;
      var errG = r.errGuidance != null ? r.errGuidance : r.errGw;
      var closerLabel =
        r.closer === 'guidance' || r.closer === 'groundworks'
          ? 'Guidance'
          : r.closer === 'machine'
            ? 'Machine'
            : r.closer === 'tie'
              ? 'Tie'
              : '—';
      tr.innerHTML =
        '<td class="id">' +
        r.id +
        '</td><td>' +
        (rem != null ? PileQC.fmt(rem) : '—') +
        '</td><td>' +
        (r.machineDisplayedRaw != null ? PileQC.fmt(r.machineDisplayedRaw) : '—') +
        '</td><td>' +
        (r.machineDisplayedFt != null ? PileQC.fmt(r.machineDisplayedFt) : '—') +
        '</td><td>' +
        (r.truthDz != null ? PileQC.fmt(r.truthDz) : '—') +
        '</td><td>' +
        (errG != null ? PileQC.fmt(errG) : '—') +
        '</td><td>' +
        (r.errMachine != null ? PileQC.fmt(r.errMachine) : '—') +
        '</td><td>' +
        closerLabel +
        '</td><td>' +
        (r.notes ? String(r.notes) : '') +
        '</td>';
      frag.appendChild(tr);
    }
    body.appendChild(frag);
  }

  function parseDriveLogCsv(text) {
    var lines = String(text || '')
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .map(function (l) {
        return l.trim();
      })
      .filter(Boolean);
    if (!lines.length) return [];
    var rows = [];
    var start = 0;
    var first = lines[0].toLowerCase();
    if (
      first.indexOf('pile') >= 0 ||
      first.indexOf('groundworks') >= 0 ||
      first.indexOf('guidance') >= 0 ||
      first.indexOf('machine') >= 0 ||
      first.indexOf('displayed') >= 0 ||
      first.indexOf('vermeer') >= 0
    ) {
      start = 1;
    }
    for (var i = start; i < lines.length; i++) {
      var parts = lines[i].split(',').map(function (p) {
        return p.trim().replace(/^"|"$/g, '');
      });
      if (!parts[0]) continue;
      var gw = parts[1] !== undefined && parts[1] !== '' ? Number(parts[1]) : null;
      var mach = parts[2] !== undefined && parts[2] !== '' ? Number(parts[2]) : null;
      rows.push({
        id: String(parts[0]).trim(),
        guidanceRemainingFt: Number.isFinite(gw) ? gw : null,
        gwRemainingFt: Number.isFinite(gw) ? gw : null,
        machineDisplayedRaw: Number.isFinite(mach) ? mach : null,
        notes: parts.slice(3).join(',').trim(),
      });
    }
    return rows;
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
    var mode = state.roverMode;
    var gnssNames =
      mode === 'uts'
        ? []
        : state.gnssFiles.map(function (f) {
            return f.name;
          });
    var utsNames =
      mode === 'gnss'
        ? []
        : state.utsFiles.map(function (f) {
            return f.name;
          });
    return {
      jobName: ($('job-name') && $('job-name').value.trim()) || '',
      notes: ($('job-notes') && $('job-notes').value.trim()) || '',
      roverMode: mode,
      designFiles: state.designFiles.map(function (f) {
        return f.name;
      }),
      gnssFiles: gnssNames,
      utsFiles: utsNames,
      measuredFiles: gnssNames.length ? gnssNames : utsNames,
      machineFiles: state.machineFiles.map(function (f) {
        return f.name;
      }),
    };
  }

  function init() {
    wireDropzone('dz-design', 'file-design', 'design');
    wireDropzone('dz-stakeout', 'file-stakeout', 'stakeout');
    wireDropzone('dz-machine', 'file-machine', 'machine');

    var gnssInput = $('file-stakeout-gnss');
    var utsInput = $('file-stakeout-uts');
    if (gnssInput) {
      gnssInput.addEventListener('change', function () {
        if (gnssInput.files && gnssInput.files.length) {
          ingestStakeoutFiles(gnssInput.files, 'gnss');
          gnssInput.value = '';
        }
      });
    }
    if (utsInput) {
      utsInput.addEventListener('change', function () {
        if (utsInput.files && utsInput.files.length) {
          ingestStakeoutFiles(utsInput.files, 'uts');
          utsInput.value = '';
        }
      });
    }
    var btnGnss = $('btn-add-gnss');
    var btnUts = $('btn-add-uts');
    if (btnGnss && gnssInput) {
      btnGnss.addEventListener('click', function (e) {
        e.stopPropagation();
        gnssInput.click();
      });
    }
    if (btnUts && utsInput) {
      btnUts.addEventListener('click', function (e) {
        e.stopPropagation();
        utsInput.click();
      });
    }

    document.querySelectorAll('input[name="stakeout-kind"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        syncRoverModeFromUi();
        refreshLists();
        scheduleRebuild();
      });
    });
    syncRoverModeFromUi();
    refreshLists();

    var ptpSpec = $('ptp-spec');
    var ptpSource = $('ptp-source');
    if (ptpSpec) {
      ptpSpec.addEventListener('change', renderPileToPile);
      ptpSpec.addEventListener('input', function () {
        clearTimeout(ptpSpec._t);
        ptpSpec._t = setTimeout(renderPileToPile, 200);
      });
    }
    if (ptpSource) {
      ptpSource.addEventListener('change', renderPileToPile);
    }

    var btnExcludeAdd = $('btn-exclude-add');
    if (btnExcludeAdd) {
      btnExcludeAdd.addEventListener('click', applyExcludeIdsFromInput);
    }
    var excludeInput = $('exclude-input');
    if (excludeInput) {
      excludeInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          applyExcludeIdsFromInput();
        }
      });
    }
    var btnExcludeClear = $('btn-exclude-clear');
    if (btnExcludeClear) {
      btnExcludeClear.addEventListener('click', function () {
        state.excludedIds = Object.create(null);
        renderExcludeUi();
        scheduleRebuild();
      });
    }
    var excludeFilter = $('exclude-filter');
    if (excludeFilter) {
      excludeFilter.addEventListener('input', function () {
        renderExcludeUi();
      });
    }
    var excludeChips = $('exclude-chips');
    if (excludeChips) {
      excludeChips.addEventListener('click', function (e) {
        var el = e.target;
        if (el && el.nodeType !== 1) el = el.parentElement;
        var btn = el && el.closest ? el.closest('.exclude-chip') : null;
        if (!btn) return;
        var id = btn.getAttribute('data-id');
        if (!id) return;
        setExcluded(id, false);
        renderExcludeUi();
        scheduleRebuild();
      });
    }
    var excludeChecklist = $('exclude-checklist');
    if (excludeChecklist) {
      excludeChecklist.addEventListener('change', function (e) {
        var t = e.target;
        if (!t || t.type !== 'checkbox') return;
        var id = t.getAttribute('data-id');
        if (!id) return;
        setExcluded(id, !t.checked);
        renderExcludeUi();
        scheduleRebuild();
      });
    }

    var driveTruth = $('drive-truth-source');
    if (driveTruth) {
      driveTruth.addEventListener('change', renderDriveScreenCompare);
    }
    var driveUnit = $('drive-machine-unit');
    if (driveUnit) {
      driveUnit.addEventListener('change', renderDriveScreenCompare);
    }
    var btnDriveSeed = $('btn-drive-seed');
    if (btnDriveSeed) {
      btnDriveSeed.addEventListener('click', function () {
        state.driveRows = DRIVE_LOG_SEED.map(function (r) {
          return {
            id: r.id,
            guidanceRemainingFt: r.guidanceRemainingFt,
            gwRemainingFt: r.guidanceRemainingFt,
            machineDisplayedRaw: r.machineDisplayedRaw,
            notes: r.notes || '',
          };
        });
        renderDriveScreenCompare();
      });
    }
    var btnDriveClear = $('btn-drive-clear');
    if (btnDriveClear) {
      btnDriveClear.addEventListener('click', function () {
        state.driveRows = [];
        state.driveCompare = null;
        renderDriveScreenCompare();
      });
    }
    var fileDrive = $('file-drive-log');
    if (fileDrive) {
      fileDrive.addEventListener('change', function () {
        var f = fileDrive.files && fileDrive.files[0];
        if (!f) return;
        var reader = new FileReader();
        reader.onload = function () {
          state.driveRows = parseDriveLogCsv(String(reader.result || ''));
          renderDriveScreenCompare();
          fileDrive.value = '';
        };
        reader.readAsText(f);
      });
    }

    renderExcludeUi();
    renderDriveScreenCompare();

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
          ptp: state.pileToPile,
          ptpPlan: PileCharts.toDataUrl($('canvas-ptp-plan')),
          ptpBars: PileCharts.toDataUrl($('canvas-ptp-bars')),
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
      state.candidateIds = [];
      refreshLists();
      renderExcludeUi();
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

  function startWhenBetaReady() {
    var betaToolId = document.body.getAttribute('data-beta-tool');
    if (!betaToolId) {
      init();
      return;
    }
    if (!document.body.classList.contains('beta-access-locked')) {
      init();
      return;
    }
    document.addEventListener('tta:beta-access-ready', init, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startWhenBetaReady);
  } else {
    startWhenBetaReady();
  }
})();
