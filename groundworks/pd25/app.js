var STORAGE_KEY = 'tta_pd25_measureup_progress_v1';
var DEALER_LOGO_KEY = 'tta_preinspection_dealer_logo_v1';
var DEALER_NAME_KEY = 'tta_preinspection_dealer_name_v1';

var state = {
  checked: {},
  expandedPhases: {},
  csvText: null,
  csvFileName: '',
  lastAnalysis: null,
};

var dealerLogo = null;

function copyResultValue(text, buttonEl) {
  function flashDone() {
    var prev = buttonEl.textContent;
    buttonEl.textContent = 'Copied';
    buttonEl.disabled = true;
    setTimeout(function () {
      buttonEl.textContent = prev;
      buttonEl.disabled = false;
    }, 1400);
  }
  function flashFail() {
    alert('Could not copy automatically. Select the value and copy manually.');
  }
  function fallbackExec() {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      if (document.execCommand('copy')) flashDone();
      else flashFail();
    } catch (err) {
      flashFail();
    }
    document.body.removeChild(ta);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(flashDone).catch(fallbackExec);
  } else {
    fallbackExec();
  }
}

function refreshViz(analysis) {
  if (typeof PD25Viz !== 'undefined' && analysis) {
    PD25Viz.updateFromAnalysis(analysis);
  }
}

function showExportSection(show) {
  var prompt = document.getElementById('exportPrompt');
  if (prompt) prompt.hidden = !show;
  if (!show) hideExportPanel();
  if (show && window.ReportUpload) window.ReportUpload.injectCheckboxes();
}

function hideExportPanel() {
  var section = document.getElementById('exportSection');
  var toggle = document.getElementById('exportReportToggle');
  if (section) section.hidden = true;
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

function toggleExportPanel() {
  var section = document.getElementById('exportSection');
  var toggle = document.getElementById('exportReportToggle');
  if (!section || !toggle) return;
  var open = section.hidden;
  section.hidden = !open;
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) {
    section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (window.ReportUpload) window.ReportUpload.injectCheckboxes();
  }
}

function showExportHints(message) {
  var box = document.getElementById('exportHintBox');
  if (!box) return;
  box.textContent = message || '';
  box.classList.toggle('hidden', !message);
}

function logCsvAnalyzed(analysis) {
  if (!window.WorkspaceApi || !analysis) return;
  if (analysis.status !== 'ok') {
    window.WorkspaceApi.logEvent('csv_analyzed:fail', {
      detail: 'pd25-calculator:' + (analysis.message || analysis.status),
    });
    return;
  }
  if (analysis.missing && analysis.missing.length) {
    analysis.missing.forEach(function (pt) {
      window.WorkspaceApi.logEvent('csv_analyzed:missing', { detail: pt });
    });
  } else {
    window.WorkspaceApi.logEvent('csv_analyzed:ok', { detail: 'pd25-calculator' });
  }
  if (analysis.warnings && analysis.warnings.length) {
    window.WorkspaceApi.logEvent('calc_warnings', {
      detail: analysis.warnings.join(' | '),
    });
  }
  var shotRod = document.getElementById('shotWithRodYes');
  window.WorkspaceApi.logEvent('calc_options', {
    detail:
      'rod:' +
      (shotRod && shotRod.checked ? 'yes' : 'no') +
      ';hc:' +
      (analysis.points && analysis.points.HC ? 'yes' : 'no') +
      ';mf:' +
      (analysis.points && analysis.points.MF ? 'yes' : 'no'),
  });
}

function buildPdfNotes(analysis) {
  var notes = [];
  notes.push({
    label: 'T1 / T2 / T3',
    value:
      'Finalize T2 and T3 on a plumb installed pile: zero guidance in one direction, rotate the machine 180°, set back on the pile, and verify. Use this check to resolve error in T1, T2, and T3. If residual error cannot be zeroed and values exceed 0.10 ft (30.48 mm), revisit Phase 1 calibrations and the full measure-up.',
  });
  if (analysis.rodCorrection && analysis.rodCorrection.rodSubtract > 0) {
    var rc = analysis.rodCorrection;
    notes.push({
      label: 'APC correction',
      value:
        rc.rodPostHeight +
        ' ' +
        rc.unitLabel +
        ' post + ' +
        rc.apcOffsetAdded +
        ' ' +
        rc.unitLabel +
        ' APC = ' +
        rc.rodSubtract +
        ' ' +
        rc.unitLabel +
        ' subtracted from MB/H',
    });
  }
  return notes;
}

function getExportPayload() {
  var analysis = state.lastAnalysis;
  if (!analysis || analysis.status !== 'ok') return null;
  var reportName = document.getElementById('reportName').value.trim();
  return {
    groundworks: analysis.groundworks,
    unitLabel: analysis.unitLabel,
    meta: {
      machineModel: document.getElementById('machineModel').value.trim(),
      serialNumber: document.getElementById('serialNumber').value.trim(),
      surveyFile: state.csvFileName || '—',
      surveyCoordinateUnits: analysis.coordUnits || analysis.units || '—',
    },
    dealerName: document.getElementById('dealerName').value.trim(),
    techName: document.getElementById('techName').value.trim(),
    dealerLogo: dealerLogo,
    reportName: reportName,
    reportTitle: reportName || 'PD25 Groundworks Measure-Up',
    generatedAt: new Date().toLocaleString(),
    notes: buildPdfNotes(analysis),
  };
}

function generateReport() {
  if (!state.lastAnalysis || state.lastAnalysis.status !== 'ok') return;
  try {
    var payload = getExportPayload();
    PD25Pdf.exportPdf(payload);
    showExportHints('In the print dialog, choose Save as PDF and pick a folder on this device.');
    if (window.ReportUpload) {
      window.ReportUpload.afterPdfExport({
        reportType: 'pd25-measure-up',
        html: PD25Pdf.buildHtml(payload),
        fileName: 'pd25-measure-up',
        dealerName: payload.dealerName,
        techName: payload.techName,
        machineModel: payload.meta.machineModel,
        serialNumber: payload.meta.serialNumber,
        reportName: payload.reportName,
      });
    }
  } catch (err) {
    alert(err.message || 'PDF export failed.');
  }
}

function uploadDealerLogo() {
  document.getElementById('dealerLogoInput').click();
}

function clearDealerLogo() {
  dealerLogo = null;
  try {
    localStorage.removeItem(DEALER_LOGO_KEY);
  } catch (err) {}
  renderDealerLogoPreview();
  document.getElementById('dealerLogoSavedNote').classList.add('hidden');
}

function renderDealerLogoPreview() {
  var box = document.getElementById('dealerLogoPreview');
  var clearBtn = document.getElementById('clearDealerLogoBtn');
  if (!box) return;
  if (dealerLogo) {
    box.className = 'dealer-logo-preview';
    box.innerHTML = '<img src="' + dealerLogo.dataUrl + '" alt="Dealer logo">';
    if (clearBtn) clearBtn.classList.remove('hidden');
  } else {
    box.className = 'dealer-logo-preview dealer-logo-preview--empty';
    box.textContent = 'No dealer logo';
    if (clearBtn) clearBtn.classList.add('hidden');
  }
}

function loadSavedDealerBranding() {
  try {
    var raw = localStorage.getItem(DEALER_LOGO_KEY);
    if (raw) dealerLogo = JSON.parse(raw);
    var name = localStorage.getItem(DEALER_NAME_KEY);
    var dealerField = document.getElementById('dealerName');
    if (name && dealerField && !dealerField.value) dealerField.value = name;
    if (dealerLogo) {
      document.getElementById('dealerLogoSavedNote').classList.remove('hidden');
    }
  } catch (err) {}
  renderDealerLogoPreview();
}

function handleDealerLogoFile(file) {
  if (!file || file.type.indexOf('image/') !== 0) return;
  var reader = new FileReader();
  reader.onload = function (e) {
    dealerLogo = { name: file.name, dataUrl: e.target.result };
    try {
      localStorage.setItem(DEALER_LOGO_KEY, JSON.stringify(dealerLogo));
      document.getElementById('dealerLogoSavedNote').classList.remove('hidden');
    } catch (err) {}
    renderDealerLogoPreview();
  };
  reader.readAsDataURL(file);
}

function bindPdfExport() {
  var generateBtn = document.getElementById('generatePdfBtn');
  if (generateBtn) generateBtn.addEventListener('click', generateReport);

  var exportToggle = document.getElementById('exportReportToggle');
  if (exportToggle) exportToggle.addEventListener('click', toggleExportPanel);

  var uploadBtn = document.getElementById('uploadDealerLogoBtn');
  if (uploadBtn) uploadBtn.addEventListener('click', uploadDealerLogo);

  var clearBtn = document.getElementById('clearDealerLogoBtn');
  if (clearBtn) clearBtn.addEventListener('click', clearDealerLogo);

  var logoInput = document.getElementById('dealerLogoInput');
  if (logoInput) {
    logoInput.addEventListener('change', function () {
      if (logoInput.files && logoInput.files[0]) handleDealerLogoFile(logoInput.files[0]);
      logoInput.value = '';
    });
  }

  var dealerName = document.getElementById('dealerName');
  if (dealerName) {
    dealerName.addEventListener('change', function () {
      try {
        var v = dealerName.value.trim();
        if (v) localStorage.setItem(DEALER_NAME_KEY, v);
        else localStorage.removeItem(DEALER_NAME_KEY);
      } catch (err) {}
    });
  }
}

function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function loadProgress() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state.checked = JSON.parse(raw) || {};
  } catch (e) {
    state.checked = {};
  }
  if (state.checked['p1-carriage-cal'] && !state.checked['p1-xy-slide-cal']) {
    state.checked['p1-xy-slide-cal'] = state.checked['p1-carriage-cal'];
    delete state.checked['p1-carriage-cal'];
    saveProgress();
  }
}

function saveProgress() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.checked));
  } catch (e) {}
}

function allStepsForPhase(phase) {
  return (phase.steps || []).filter(function (s) {
    return !s.optional;
  });
}

function isPhaseComplete(phase) {
  var required = allStepsForPhase(phase);
  if (!required.length) return true;
  return required.every(function (s) {
    return !!state.checked[s.id];
  });
}

function isCalculatorUnlocked() {
  var preCalc = PD25_GUIDE.phases.filter(function (p) {
    return !p.calculator && p.id !== 'phase-6';
  });
  return preCalc.every(function (p) {
    return isPhaseComplete(p);
  });
}

function guidePhases() {
  var phases = PD25_GUIDE.phases.filter(function (p) {
    return !p.calculator;
  });
  if (getPageMode() === 'targets') {
    return phases.filter(function (p) {
      return p.id === 'phase-2';
    });
  }
  return phases;
}

function ensureExpandedDefaults() {
  var phases = guidePhases();
  var hasExpanded = phases.some(function (p) {
    return !!state.expandedPhases[p.id];
  });
  if (hasExpanded) return;

  var target = phases.find(function (p) {
    return !isPhaseComplete(p);
  });
  if (!target) target = phases[0];
  if (target) state.expandedPhases[target.id] = true;
}

function updatePhaseBadge(phaseId) {
  var phase = guidePhases().find(function (p) {
    return p.id === phaseId;
  });
  if (!phase) return;

  var section = document.querySelector('[data-phase-id="' + phaseId + '"]');
  if (!section) return;

  var done = isPhaseComplete(phase);
  var badge = section.querySelector('.pd25-phase__badge');
  var wasDone = section.getAttribute('data-phase-done') === '1';
  if (done && !wasDone && window.WorkspaceApi) {
    window.WorkspaceApi.logEvent('guide_phase_complete', { detail: phaseId });
  }
  section.setAttribute('data-phase-done', done ? '1' : '0');
  if (badge) {
    badge.textContent = done ? 'Complete' : 'In progress';
    badge.classList.toggle('pd25-phase__badge--done', done);
  }
}

function updateWorkflowProgress() {
  var setupPhases = guidePhases();
  var doneCount = setupPhases.filter(function (p) {
    return isPhaseComplete(p);
  }).length;
  var el = document.getElementById('workflowProgress');
  if (!el) return;

  if (doneCount === setupPhases.length) {
    el.className = 'pd25-workflow-progress pd25-workflow-progress--done';
    el.textContent =
      'All workflow phases complete (' + doneCount + ' of ' + setupPhases.length + ').';
  } else if (isCalculatorUnlocked()) {
    el.className = 'pd25-workflow-progress pd25-workflow-progress--done';
    el.textContent =
      'Measure-up phases complete (' +
      doneCount +
      ' of ' +
      setupPhases.length +
      '). Finish remaining steps when ready.';
  } else {
    el.className = 'pd25-workflow-progress';
    el.textContent =
      'Recommended path: ' +
      doneCount +
      ' of ' +
      setupPhases.length +
      ' phases complete. Finish critical steps if you are new to PD25 or troubleshooting accuracy.';
  }
}

function renderTooling() {
  var ul = document.getElementById('toolingList');
  if (!ul) return;
  ul.innerHTML = PD25_GUIDE.requiredTooling.map(function (t) {
    return '<li>' + esc(t) + '</li>';
  }).join('');
}

function renderBodyCalibrationSigns() {
  var data = PD25_GUIDE.bodyCalibrationSigns;
  if (!data) return '';

  function ruleRow(rule) {
    var viewBtn = '';
    if (rule.example && rule.example.image) {
      viewBtn =
        '<button type="button" class="pd25-body-signs__view" ' +
        'data-body-example-image="' +
        esc(rule.example.image) +
        '" data-body-example-alt="' +
        esc(rule.example.imageAlt || rule.condition) +
        '" data-body-example-title="' +
        esc(rule.example.title || rule.condition) +
        '" data-body-example-caption="' +
        esc(rule.example.caption || '') +
        '"' +
        (rule.example.maxDisplayWidth
          ? ' data-body-example-max-width="' + esc(String(rule.example.maxDisplayWidth)) + '"'
          : '') +
        '>View example photo</button>';
    }
    return (
      '<div class="pd25-body-signs__rule">' +
      '<div class="pd25-body-signs__rule-main">' +
      '<span class="pd25-body-signs__condition">' +
      esc(rule.condition) +
      '</span>' +
      '<span class="pd25-body-signs__sign">' +
      esc(rule.sign) +
      '</span></div>' +
      viewBtn +
      '</div>'
    );
  }

  function block(section) {
    var rules = section.rules.map(ruleRow).join('');
    return (
      '<div class="pd25-body-signs__block">' +
      '<p class="pd25-body-signs__title">' +
      esc(section.title) +
      '</p>' +
      rules +
      '</div>'
    );
  }

  return (
    '<div class="pd25-body-signs" role="note">' +
    '<p class="pd25-body-signs__intro"><strong>' +
    esc(data.heading || 'Important — body calibration sign rules') +
    '</strong><br>' +
    esc(data.intro) +
    '</p>' +
    (data.signRulesLabel
      ? '<p class="pd25-body-signs__signs-label">' + esc(data.signRulesLabel) + '</p>'
      : '') +
    '<div class="pd25-body-signs__grid">' +
    block(data.pitch) +
    block(data.roll) +
    '</div>' +
    (data.offsetNote
      ? '<p class="pd25-body-signs__offset-note">' +
        (data.offsetNoteLabel ? '<strong>' + esc(data.offsetNoteLabel) + '</strong><br>' : '') +
        esc(data.offsetNote) +
        '</p>'
      : '') +
    '</div>'
  );
}

var imageLightbox = null;

function ensureImageLightbox() {
  if (imageLightbox) return imageLightbox;

  var modalEl = document.createElement('div');
  modalEl.className = 'pd25-target-modal pd25-image-lightbox';
  modalEl.hidden = true;
  modalEl.innerHTML =
    '<div class="pd25-target-modal__backdrop" data-close="1"></div>' +
    '<div class="pd25-target-modal__panel" role="dialog" aria-modal="true" aria-labelledby="pd25ImageLightboxTitle">' +
    '<button type="button" class="pd25-target-modal__close" data-close="1" aria-label="Close">&times;</button>' +
    '<h3 class="pd25-target-modal__title" id="pd25ImageLightboxTitle"></h3>' +
    '<div class="pd25-target-modal__viewport" tabindex="0">' +
    '<img class="pd25-target-modal__img" alt="" draggable="false" />' +
    '</div>' +
    '<p class="pd25-target-modal__zoom-hint">Pinch or scroll to zoom · drag to pan · double-tap to reset</p>' +
    '<p class="pd25-target-modal__caption"></p>' +
    '</div>';
  document.body.appendChild(modalEl);

  var viewport = modalEl.querySelector('.pd25-target-modal__viewport');
  var img = modalEl.querySelector('.pd25-target-modal__img');
  var titleEl = modalEl.querySelector('.pd25-target-modal__title');
  var captionEl = modalEl.querySelector('.pd25-target-modal__caption');

  var zoom = { scale: 1, x: 0, y: 0, min: 1, max: 6 };
  var pointers = Object.create(null);
  var pinchStartDist = 0;
  var pinchStartScale = 1;
  var panLast = null;
  var lastTap = 0;

  function applyZoom() {
    img.style.transform =
      'translate(' + zoom.x + 'px, ' + zoom.y + 'px) scale(' + zoom.scale + ')';
  }

  function resetZoom() {
    zoom.scale = 1;
    zoom.x = 0;
    zoom.y = 0;
    applyZoom();
  }

  function clampPan() {
    var rect = viewport.getBoundingClientRect();
    var maxX = (rect.width * (zoom.scale - 1)) / 2 + 40;
    var maxY = (rect.height * (zoom.scale - 1)) / 2 + 40;
    if (zoom.scale <= 1) {
      zoom.x = 0;
      zoom.y = 0;
      return;
    }
    if (zoom.x > maxX) zoom.x = maxX;
    if (zoom.x < -maxX) zoom.x = -maxX;
    if (zoom.y > maxY) zoom.y = maxY;
    if (zoom.y < -maxY) zoom.y = -maxY;
  }

  function closeModal() {
    modalEl.hidden = true;
    document.body.classList.remove('pd25-target-modal-open');
    resetZoom();
    img.removeAttribute('src');
    pointers = Object.create(null);
    panLast = null;
  }

  function pointerCount() {
    return Object.keys(pointers).length;
  }

  function distanceBetween(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function activePointers() {
    return Object.keys(pointers).map(function (id) {
      return pointers[id];
    });
  }

  viewport.addEventListener(
    'wheel',
    function (e) {
      e.preventDefault();
      var delta = e.deltaY > 0 ? -0.12 : 0.12;
      var next = Math.min(zoom.max, Math.max(zoom.min, zoom.scale + delta * zoom.scale));
      zoom.scale = next;
      clampPan();
      applyZoom();
    },
    { passive: false }
  );

  viewport.addEventListener('pointerdown', function (e) {
    viewport.setPointerCapture(e.pointerId);
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var pts = activePointers();
    if (pts.length === 2) {
      pinchStartDist = distanceBetween(pts[0], pts[1]);
      pinchStartScale = zoom.scale;
      panLast = null;
    } else if (pts.length === 1) {
      panLast = { x: e.clientX, y: e.clientY };
      var now = Date.now();
      if (now - lastTap < 300) {
        if (zoom.scale > 1.05) {
          resetZoom();
        } else {
          zoom.scale = 2.5;
          clampPan();
          applyZoom();
        }
        lastTap = 0;
      } else {
        lastTap = now;
      }
    }
  });

  viewport.addEventListener('pointermove', function (e) {
    if (!pointers[e.pointerId]) return;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var pts = activePointers();
    if (pts.length === 2 && pinchStartDist > 0) {
      var dist = distanceBetween(pts[0], pts[1]);
      zoom.scale = Math.min(
        zoom.max,
        Math.max(zoom.min, pinchStartScale * (dist / pinchStartDist))
      );
      clampPan();
      applyZoom();
    } else if (pts.length === 1 && panLast && zoom.scale > 1.01) {
      zoom.x += e.clientX - panLast.x;
      zoom.y += e.clientY - panLast.y;
      panLast = { x: e.clientX, y: e.clientY };
      clampPan();
      applyZoom();
    }
  });

  function endPointer(e) {
    delete pointers[e.pointerId];
    if (pointerCount() < 2) pinchStartDist = 0;
    if (pointerCount() === 1) {
      var remaining = activePointers()[0];
      panLast = remaining ? { x: remaining.x, y: remaining.y } : null;
    } else {
      panLast = null;
    }
  }

  viewport.addEventListener('pointerup', endPointer);
  viewport.addEventListener('pointercancel', endPointer);
  viewport.addEventListener('pointerleave', function (e) {
    if (pointers[e.pointerId]) endPointer(e);
  });

  modalEl.addEventListener('click', function (e) {
    if (e.target.getAttribute('data-close') === '1') closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modalEl.hidden) closeModal();
  });

  imageLightbox = {
    el: modalEl,
    title: titleEl,
    img: img,
    caption: captionEl,
    close: closeModal,
    resetZoom: resetZoom,
    applyZoom: applyZoom,
  };
  return imageLightbox;
}

function openImageLightbox(example) {
  var modal = ensureImageLightbox();
  modal.resetZoom();
  modal.title.textContent = example.title || '';
  modal.img.alt = example.alt || example.title || '';
  modal.caption.textContent = example.caption || '';
  if (example.maxDisplayWidth) {
    modal.img.style.maxWidth = example.maxDisplayWidth + 'px';
  } else {
    modal.img.style.maxWidth = '';
  }
  modal.img.onload = function () {
    modal.resetZoom();
  };
  modal.img.src = example.image;
  modal.el.hidden = false;
  document.body.classList.add('pd25-target-modal-open');
  try {
    modal.el.querySelector('.pd25-target-modal__viewport').focus();
  } catch (err) {
    /* ignore */
  }
}

/** @deprecated alias — body-sign examples use the shared lightbox */
function ensureBodySignExampleModal() {
  return ensureImageLightbox();
}

function openBodySignExampleModal(example) {
  openImageLightbox(example);
}

function figureCaptionNear(el) {
  var fig = el.closest('figure');
  if (!fig) return '';
  var cap = fig.querySelector('figcaption');
  return cap ? (cap.textContent || '').replace(/\s+/g, ' ').trim() : '';
}

function markExpandableImages(root) {
  root = root || document;
  var nodes = root.querySelectorAll(
    '.pd25-step__image, .pd25-measureup-tool__img, .pd25-dimensions__b5-image'
  );
  for (var i = 0; i < nodes.length; i++) {
    var img = nodes[i];
    img.classList.add('pd25-expandable-img');
    if (!img.hasAttribute('tabindex')) img.setAttribute('tabindex', '0');
    img.setAttribute('role', 'button');
    var baseAlt = img.getAttribute('alt') || 'Image';
    img.setAttribute('aria-label', baseAlt + ' — tap to enlarge');
    var fig = img.closest('figure');
    if (fig && !fig.querySelector('.pd25-expand-hint')) {
      var hint = document.createElement('span');
      hint.className = 'pd25-expand-hint';
      hint.setAttribute('aria-hidden', 'true');
      hint.textContent = 'Tap to enlarge';
      var cap = fig.querySelector('figcaption');
      if (cap) fig.insertBefore(hint, cap);
      else fig.appendChild(hint);
    }
  }
}

function initImageLightbox() {
  if (initImageLightbox._bound) return;
  initImageLightbox._bound = true;

  document.addEventListener(
    'click',
    function (e) {
      var btn = e.target.closest('.pd25-body-signs__view, .pd25-image-expand');
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        openImageLightbox({
          image: btn.getAttribute('data-body-example-image'),
          alt: btn.getAttribute('data-body-example-alt'),
          title: btn.getAttribute('data-body-example-title'),
          caption: btn.getAttribute('data-body-example-caption'),
          maxDisplayWidth: btn.getAttribute('data-body-example-max-width')
            ? Number(btn.getAttribute('data-body-example-max-width'))
            : 0,
        });
        return;
      }

      var img = e.target.closest('.pd25-expandable-img');
      if (!img) return;
      e.preventDefault();
      e.stopPropagation();
      var caption = figureCaptionNear(img);
      openImageLightbox({
        image: img.currentSrc || img.src,
        alt: img.getAttribute('alt') || '',
        title: img.getAttribute('alt') || 'Photo',
        caption: caption,
      });
    },
    true
  );

  document.addEventListener(
    'mousedown',
    function (e) {
      if (e.target.closest('.pd25-expandable-img, .pd25-image-expand, .pd25-body-signs__view')) {
        e.stopPropagation();
      }
    },
    true
  );

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var img = e.target.closest('.pd25-expandable-img');
    if (!img) return;
    e.preventDefault();
    openImageLightbox({
      image: img.currentSrc || img.src,
      alt: img.getAttribute('alt') || '',
      title: img.getAttribute('alt') || 'Photo',
      caption: figureCaptionNear(img),
    });
  });
}

function initBodySignExampleModal() {
  initImageLightbox();
}

function renderGroundworksDimensions(options) {
  options = options || {};
  var data = typeof PD25_GROUNDWORKS_DIMENSIONS !== 'undefined' ? PD25_GROUNDWORKS_DIMENSIONS : null;
  if (!data) return '';

  function formatDim(value) {
    if (value == null || value === '') return '—';
    var n = Number(value);
    if (isNaN(n)) return '—';
    var s = n.toFixed(4);
    if (s.indexOf('.') !== -1) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }

  function entryLabel(entry) {
    if (entry === 'measure') return 'Measure';
    if (entry === 'default') return 'Use default';
    if (entry === 'na') return 'N/A';
    return entry;
  }

  function copyButton(value, label) {
    if (value == null || value === '') return '';
    var str = formatDim(value);
    return (
      '<button type="button" class="copy-res-btn" data-copy="' +
      encodeURIComponent(str) +
      '" aria-label="Copy ' +
      esc(label) +
      '">Copy</button>'
    );
  }

  function valueRow(unit, value, label, emphasize, approximate) {
    if (value == null || value === '') return '';
    var str = formatDim(value);
    var prefix = approximate ? '~' : '';
    return (
      '<div class="pd25-dim-card__value">' +
      '<span class="pd25-dim-card__unit">' +
      esc(unit) +
      '</span>' +
      '<span class="pd25-mono pd25-dim-card__amount' +
      (emphasize ? ' pd25-dim-value--critical' : '') +
      '">' +
      prefix +
      esc(str) +
      '</span>' +
      copyButton(value, label) +
      '</div>'
    );
  }

  function renderDimCard(row) {
    var cardClass =
      'pd25-dim-card' +
      (row.emphasize ? ' pd25-dim-card--critical' : '') +
      (row.entry === 'na' ? ' pd25-dim-card--na' : '');
    var html =
      '<article class="' +
      cardClass +
      '">' +
      '<div class="pd25-dim-card__head">' +
      '<strong class="pd25-dim-card__id">' +
      esc(row.id) +
      '</strong>' +
      '<span class="pd25-dim-entry pd25-dim-entry--' +
      esc(row.entry) +
      '">' +
      esc(entryLabel(row.entry)) +
      '</span>' +
      '</div>' +
      '<p class="pd25-dim-card__name">' +
      esc(row.name) +
      '</p>';

    if (row.notes) {
      html += '<p class="pd25-dim-card__note">' + esc(row.notes) + '</p>';
    }

    if (row.entry === 'na') {
      html += '<p class="pd25-dim-card__source">Not used on PD25</p>';
    } else if (row.entry === 'measure') {
      if (row.typicalFt != null) {
        html +=
          '<div class="pd25-dim-card__values">' +
          valueRow('ft', row.typicalFt, row.id + ' typical ft', false, true) +
          valueRow('m', row.typicalM, row.id + ' typical m', false, true) +
          '</div>';
      } else {
        html += '<p class="pd25-dim-card__source">From survey / calculator</p>';
      }
    } else {
      html +=
        '<div class="pd25-dim-card__values">' +
        valueRow('ft', row.defaultFt, row.id + ' ft', row.emphasize, false) +
        valueRow('m', row.defaultM, row.id + ' m', row.emphasize, false) +
        '</div>';
    }

    html += '</article>';
    return html;
  }

  var html =
    '<div class="pd25-dimensions">' +
    '<p class="note pd25-dimensions__intro">' +
    esc(data.intro) +
    '</p>';

  if (data.b5Callout) {
    html +=
      '<div class="pd25-dimensions__b5-callout" role="note">' +
      '<strong>Critical — B5</strong><br>' +
      esc(data.b5Callout);
    if (!options.omitImages && data.b5Image) {
      html +=
        '<figure class="pd25-dimensions__b5-figure">' +
        '<img class="pd25-dimensions__b5-image pd25-expandable-img" src="' +
        esc(data.b5Image) +
        '" alt="' +
        esc(data.b5ImageAlt || 'B5 measure-up location on PD25') +
        '" loading="lazy" tabindex="0" role="button" aria-label="' +
        esc((data.b5ImageAlt || 'B5') + ' — tap to enlarge') +
        '" />' +
        '<span class="pd25-expand-hint" aria-hidden="true">Tap to enlarge</span>' +
        '<figcaption class="pd25-dimensions__b5-caption">' +
        esc(data.b5ImageCaption || 'B5 — center of Y pivot pin to X tilt pin') +
        '</figcaption>' +
        '</figure>';
    }
    if (!options.omitImages && data.mtImage) {
      html +=
        '<figure class="pd25-dimensions__b5-figure">' +
        '<img class="pd25-dimensions__b5-image pd25-expandable-img" src="' +
        esc(data.mtImage) +
        '" alt="' +
        esc(data.mtImageAlt || 'PD25 Mast Tilt (MT) measurement target') +
        '" loading="lazy" tabindex="0" role="button" aria-label="' +
        esc((data.mtImageAlt || 'MT') + ' — tap to enlarge') +
        '" />' +
        '<span class="pd25-expand-hint" aria-hidden="true">Tap to enlarge</span>' +
        '<figcaption class="pd25-dimensions__b5-caption">' +
        esc(data.mtImageCaption || 'Where to shoot MT') +
        '</figcaption>' +
        '</figure>';
    }
    if (options.omitImages) {
      html +=
        '<p class="note" style="margin:10px 0 0;">Target placement photos: see the ' +
        '<a href="targets.html">target placement help</a>.</p>';
    }
    html += '</div>';
  }

  data.sections.forEach(function (section) {
    html +=
      '<section class="pd25-dim-group" id="pd25-dim-' +
      esc(section.id) +
      '">' +
      '<h3 class="pd25-dim-group__title">' +
      esc(section.title) +
      '<span class="pd25-dimensions__count">' +
      section.rows.length +
      ' params</span></h3>';
    if (section.subtitle) {
      html += '<p class="pd25-dimensions__subtitle">' + esc(section.subtitle) + '</p>';
    }
    html += '<div class="pd25-dim-cards">';
    section.rows.forEach(function (row) {
      html += renderDimCard(row);
    });
    html += '</div>';
    if (section.footnote) {
      html += '<p class="note pd25-dimensions__footnote">' + esc(section.footnote) + '</p>';
    }
    html += '</section>';
  });

  html += '</div>';
  return html;
}

function mountGroundworksDimensions(targetId, options) {
  var el = document.getElementById(targetId);
  if (!el) return;
  el.innerHTML = renderGroundworksDimensions(options);
  markExpandableImages(el);
}

function renderPhases() {
  var root = document.getElementById('phaseList');
  root.innerHTML = '';
  ensureExpandedDefaults();

  guidePhases().forEach(function (phase) {
    var done = isPhaseComplete(phase);
    var section = document.createElement('section');
    section.className = 'pd25-phase';
    section.setAttribute('data-phase-id', phase.id);

    var head = document.createElement('div');
    head.className = 'pd25-phase__head' + (phase.critical ? ' pd25-phase__head--critical' : '');
    var phaseTitle = phase.title;
    var phaseSummary = phase.summary;
    if (getPageMode() === 'targets' && phase.id === 'phase-2') {
      phaseTitle = 'Where to place & shoot targets';
      phaseSummary = 'Reference position, then ML · MR · MT · MB · H · HC (and optional MF). Tap photos to enlarge.';
    }
    head.innerHTML =
      '<div><div class="pd25-phase__title">' +
      esc(phaseTitle) +
      '</div><div class="pd25-phase__summary">' +
      esc(phaseSummary) +
      '</div></div>' +
      '<span class="pd25-phase__badge' +
      (done ? ' pd25-phase__badge--done' : '') +
      '">' +
      (done ? 'Complete' : 'In progress') +
      '</span>';

    var body = document.createElement('div');
    body.className = 'pd25-phase__body';
    body.hidden = !state.expandedPhases[phase.id];

    if (phase.showBodyCalibrationSigns) {
      var callout = document.createElement('div');
      callout.innerHTML = renderBodyCalibrationSigns();
      body.appendChild(callout);
    }

    phase.steps.forEach(function (step) {
      var row = document.createElement('label');
      row.className = 'pd25-step' + (step.optional ? ' pd25-step--optional' : '');
      var imageHtml = '';
      var imageViewBtn = '';
      if (step.image && step.imageModal) {
        imageViewBtn =
          '<button type="button" class="pd25-step__view-image pd25-image-expand" ' +
          'data-body-example-image="' +
          esc(step.image) +
          '" data-body-example-alt="' +
          esc(step.imageAlt || step.title) +
          '" data-body-example-title="' +
          esc(step.imageModalTitle || step.title) +
          '" data-body-example-caption="' +
          esc(step.imageModalCaption || '') +
          '">View diagnostics example</button>';
      }
      if (step.image) {
        imageHtml =
          '<figure class="pd25-step__figure">' +
          '<img class="pd25-step__image pd25-expandable-img" src="' +
          esc(step.image) +
          '" alt="' +
          esc(step.imageAlt || step.title) +
          '" loading="lazy" tabindex="0" role="button" aria-label="' +
          esc((step.imageAlt || step.title) + ' — tap to enlarge') +
          '" />' +
          '<span class="pd25-expand-hint" aria-hidden="true">Tap to enlarge</span>' +
          (step.imageCaption
            ? '<figcaption class="pd25-step__caption">' + esc(step.imageCaption) + '</figcaption>'
            : '') +
          '</figure>';
      }
      var noteHtml = step.note
        ? '<div class="pd25-step__note' +
          (step.noteWarning ? ' pd25-step__note--warning' : '') +
          '" role="note">' +
          (step.noteWarning ? '<strong>Warning — </strong>' : '') +
          esc(step.note) +
          '</div>'
        : '';
      row.innerHTML =
        '<input type="checkbox" data-step="' +
        esc(step.id) +
        '" ' +
        (state.checked[step.id] ? 'checked' : '') +
        ' />' +
        '<span class="pd25-step__inner">' +
        '<span class="pd25-step__text">' +
        '<div class="pd25-step__title">' +
        esc(step.title) +
        '</div><div class="pd25-step__body">' +
        esc(step.body) +
        '</div>' +
        noteHtml +
        imageViewBtn +
        '</span>' +
        imageHtml +
        '</span>';
      body.appendChild(row);
    });

    if (phase.calculator) {
      var dimWrap = document.createElement('details');
      dimWrap.className = 'pd25-dimensions-panel pd25-phase__dimensions';
      dimWrap.innerHTML =
        '<summary class="pd25-dimensions-panel__summary">Groundworks dimensions reference</summary>' +
        '<div class="pd25-dimensions-panel__body">' +
        renderGroundworksDimensions() +
        '</div>';
      body.appendChild(dimWrap);
      var calcLink = document.createElement('p');
      calcLink.className = 'note pd25-page-crosslink';
      calcLink.innerHTML =
        'Open the <a href="calculator.html">measure-up calculator</a> to upload your CSV and generate G/T values from survey.';
      body.appendChild(calcLink);
    }

    head.addEventListener('click', function () {
      var willExpand = body.hidden;
      body.hidden = !willExpand;
      state.expandedPhases[phase.id] = willExpand;
    });

    body.addEventListener('change', function (e) {
      if (e.target.type !== 'checkbox') return;
      state.checked[e.target.getAttribute('data-step')] = e.target.checked;
      saveProgress();
      updatePhaseBadge(phase.id);
      updateWorkflowProgress();
    });

    section.appendChild(head);
    section.appendChild(body);
    root.appendChild(section);
  });

  markExpandableImages(root);
  updateWorkflowProgress();
  openPhaseFromHash();
}

function openPhaseFromHash() {
  var hash = (location.hash || '').replace(/^#/, '');
  if (!hash) return;
  var section = document.querySelector('[data-phase-id="' + hash + '"]');
  if (!section) return;
  var body = section.querySelector('.pd25-phase__body');
  if (body) body.hidden = false;
  state.expandedPhases[hash] = true;
  saveProgress();
  try {
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    section.scrollIntoView(true);
  }
}

function switchTab(panelId) {
  document.querySelectorAll('.pd25-tab').forEach(function (btn) {
    var active = btn.getAttribute('data-panel') === panelId;
    btn.classList.toggle('active', active);
  });
  document.querySelectorAll('.pd25-panel').forEach(function (panel) {
    panel.hidden = panel.id !== panelId;
  });
}

function bindTabs() {
  document.querySelectorAll('.pd25-tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      switchTab(btn.getAttribute('data-panel'));
    });
  });
}

function isB5MeasureMode() {
  var el = document.getElementById('b5MethodMeasure');
  return !!(el && el.checked);
}

function renderPointBadges(points, missing) {
  var box = document.getElementById('pointCheckList');
  if (!box) return;
  box.innerHTML = '';
  var measureB5 = isB5MeasureMode();
  PD25_GUIDE.surveyPoints.forEach(function (sp) {
    var badge = document.createElement('span');
    badge.className = 'pt-badge';
    var found = points && points[sp.id];
    // MT is preferred for measure mode but never blocks Calculate — calc falls back to OEM without MT.
    var required = !!sp.required;
    if (found) {
      badge.classList.add('found');
      badge.textContent = sp.id + ' ✓';
    } else if (required) {
      badge.classList.add('missing');
      badge.textContent = sp.id + ' ✗';
    } else if (measureB5 && sp.b5MeasureRequired) {
      badge.classList.add('optional');
      badge.textContent = sp.id + ' (needed for measured B5)';
    } else {
      badge.classList.add('optional');
      badge.textContent = sp.id + ' (opt)';
    }
    box.appendChild(badge);
  });
  var analyzeBtn = document.getElementById('analyzeBtn');
  if (analyzeBtn) {
    analyzeBtn.disabled = !state.csvText || (missing && missing.length > 0);
  }
}

function getSurveyOptions() {
  var shotWithRod = document.getElementById('shotWithRodYes').checked;
  var rodEntered = document.getElementById('rodInSwYes').checked;
  var rodHeightEl = document.getElementById('rodHeight');
  var xPinEl = document.getElementById('xPinHorizontalOffset');
  return {
    shotWithRod: shotWithRod,
    rodEnteredInSiteworks: !shotWithRod || rodEntered,
    rodHeight: rodHeightEl ? rodHeightEl.value : '',
    hcFaceOffset: document.getElementById('hcFaceOffset')
      ? document.getElementById('hcFaceOffset').value
      : '0',
    csvFormat: document.getElementById('csvFormat')
      ? document.getElementById('csvFormat').value
      : 'PNEZ',
    b5Method: isB5MeasureMode() ? 'measure' : 'default',
    xPinHorizontalOffset: xPinEl ? xPinEl.value : '0',
  };
}

function syncHcUi(hasHc) {
  var section = document.getElementById('hcOffsetSection');
  if (section) section.hidden = !hasHc;
  updateHcOffsetHint();
}

function updateHcOffsetHint() {
  var hint = document.getElementById('hcOffsetHint');
  if (!hint) return;
  var units = document.getElementById('units').value;
  if (units === 'METRIC') {
    hint.innerHTML =
      '<strong>Positive (+)</strong> — shot is on the face, <em>ahead</em> of hammer center (farther from ML/MR). Example: face shot 160&nbsp;mm toward ML/MR → enter <strong>+0.160&nbsp;m</strong>.<br />' +
      '<strong>Zero (0)</strong> — shot is at hammer center.<br />' +
      '<strong>Negative (−)</strong> — shot is between hammer center and ML/MR.';
  } else {
    hint.innerHTML =
      '<strong>Positive (+)</strong> — shot is on the face, <em>ahead</em> of hammer center (farther from ML/MR). Example: face shot ~6.3&nbsp;in toward ML/MR → enter <strong>+0.525&nbsp;ft</strong> (160&nbsp;mm).<br />' +
      '<strong>Zero (0)</strong> — shot is at hammer center.<br />' +
      '<strong>Negative (−)</strong> — shot is between hammer center and ML/MR.';
  }
}

function updateRodHeightDefault() {
  var units = document.getElementById('units').value;
  var def = PD25Calc.defaultRodPostHeight(units);
  var input = document.getElementById('rodHeight');
  if (input && (!input.value || input.dataset.auto === '1')) {
    input.value = def;
    input.dataset.auto = '1';
  }
  var hint = document.getElementById('rodHeightHint');
  var apc = PD25Calc.apcOffsetZephyr3(units);
  var unit = units === 'METRIC' ? 'm' : 'ft';
  if (hint) {
    hint.innerHTML =
      'Enter <strong>post height only</strong> — not APC. The calculator adds <strong>' +
      (units === 'METRIC' ? '4&nbsp;mm' : formatRodHint(apc, unit) + ' APC offset') +
      '</strong> (Zephyr 3 Rugged target center → APC) behind the scenes. P/N 105568 default: <strong>' +
      def +
      '&nbsp;' +
      unit +
      '</strong>.';
  }
}

function formatRodHint(apcFt, unit) {
  return apcFt + '&nbsp;' + unit;
}

function syncB5Ui() {
  var measure = isB5MeasureMode();
  var section = document.getElementById('b5MeasureSection');
  if (section) section.hidden = !measure;
  updateXPinOffsetHint();
  if (state.csvText) {
    try {
      var analysis = runAnalysis();
      if (analysis) {
        renderPointBadges(analysis.points, analysis.missing || []);
        if (!document.getElementById('calcResults').hidden) {
          renderCalcResults(analysis);
        }
      }
    } catch (e) {}
  } else {
    renderPointBadges({}, []);
  }
}

function updateXPinOffsetHint() {
  var hint = document.getElementById('xPinOffsetHint');
  if (!hint) return;
  var units = document.getElementById('units').value;
  if (units === 'METRIC') {
    hint.innerHTML =
      'Positive when ML is left and MR is right (offset to the right of the ML→MR line). Example: <strong>0.086&nbsp;m</strong>. ' +
      'Enter <strong>0</strong> if ML/MR are already on the X-pin centerline.';
  } else {
    hint.innerHTML =
      'Positive when ML is left and MR is right (offset to the right of the ML→MR line). Example: <strong>0.282&nbsp;ft</strong> (~0.086&nbsp;m). ' +
      'Enter <strong>0</strong> if ML/MR are already on the X-pin centerline.';
  }
}

function bindB5Ui() {
  ['b5MethodDefault', 'b5MethodMeasure'].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', syncB5Ui);
  });
  var xPin = document.getElementById('xPinHorizontalOffset');
  if (xPin) {
    xPin.addEventListener('input', function () {
      if (state.csvText && !document.getElementById('calcResults').hidden && isB5MeasureMode()) {
        try {
          renderCalcResults(runAnalysis());
        } catch (e) {}
      }
    });
  }
  syncB5Ui();
}

function syncRodUi() {
  var shotWithRod = document.getElementById('shotWithRodYes').checked;
  var rodSection = document.getElementById('rodHeightSection');
  var rodField = document.getElementById('rodHeightField');
  var rodInSwNo = document.getElementById('rodInSwNo').checked;

  if (rodSection) rodSection.hidden = !shotWithRod;
  if (rodField) rodField.hidden = !shotWithRod || !rodInSwNo;
  updateRodHeightDefault();
}

function runAnalysis() {
  if (!state.csvText) return null;
  return PD25Calc.analyzeCsv(
    state.csvText,
    document.getElementById('units').value,
    getSurveyOptions()
  );
}

function bindRodUi() {
  ['shotWithRodYes', 'shotWithRodNo', 'rodInSwYes', 'rodInSwNo'].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', function () {
      syncRodUi();
      if (state.csvText && !document.getElementById('calcResults').hidden) {
        try {
          renderCalcResults(runAnalysis());
        } catch (e) {}
      }
    });
  });

  var rodHeight = document.getElementById('rodHeight');
  if (rodHeight) {
    rodHeight.addEventListener('input', function () {
      rodHeight.dataset.auto = '0';
      if (state.csvText && !document.getElementById('calcResults').hidden) {
        try {
          renderCalcResults(runAnalysis());
        } catch (e) {}
      }
    });
  }

  syncRodUi();
}

function bindHcUi() {
  var hcOffset = document.getElementById('hcFaceOffset');
  if (!hcOffset) return;
  hcOffset.addEventListener('input', function () {
    if (state.csvText && !document.getElementById('calcResults').hidden) {
      try {
        renderCalcResults(runAnalysis());
      } catch (e) {}
    }
  });
}

function renderCalcResults(analysis) {
  var box = document.getElementById('calcResults');
  if (analysis.status !== 'ok') {
    state.lastAnalysis = analysis;
    showExportSection(false);
    showExportHints('');
    logCsvAnalyzed(analysis);
    box.hidden = false;
    box.innerHTML = '<strong>Survey status:</strong> ' + esc(analysis.message);
    return;
  }

  state.lastAnalysis = analysis;
  showExportSection(true);
  logCsvAnalyzed(analysis);

  var u = analysis.unitLabel;
  var html = '';

  if (analysis.warnings && analysis.warnings.length) {
    html +=
      '<div class="pd25-calc-hint" style="margin-bottom:14px;">' +
      analysis.warnings.map(esc).join('<br>') +
      '</div>';
  }

  var GROUNDWORKS_ORDER = ['G6', 'G5', 'G2', 'G1', 'G7', 'B5', 'T1', 'T5'];

  html += '<h3 class="pd25-results__h">Groundworks measure-up values</h3>';
  html += '<div class="pd25-dim-cards pd25-result-cards">';
  GROUNDWORKS_ORDER.forEach(function (key) {
    var row = analysis.groundworks[key];
    if (!row) return;
    var valueStr = Number(row.value).toFixed(3);
    var isMeasuredB5 = key === 'B5' && analysis.b5Method === 'measure';
    html +=
      '<article class="pd25-dim-card pd25-result-card' +
      (key === 'B5' ? ' pd25-dim-card--critical' : '') +
      '">' +
      '<div class="pd25-dim-card__head">' +
      '<strong class="pd25-dim-card__id">' +
      esc(key) +
      (isMeasuredB5
        ? ' <span class="pd25-beta-badge" title="Measured B5 is BETA — verify before relying on guidance">BETA</span>'
        : '') +
      '</strong>' +
      '<span class="pd25-dim-entry pd25-dim-entry--measure">Result</span>' +
      '</div>' +
      '<p class="pd25-dim-card__name">' +
      esc(row.label) +
      (isMeasuredB5 ? ' <span class="pd25-beta-inline">(measured — verify vs OEM)</span>' : '') +
      '</p>' +
      '<div class="pd25-dim-card__values">' +
      '<div class="pd25-dim-card__value">' +
      '<span class="pd25-dim-card__unit">' +
      esc(u) +
      '</span>' +
      '<span class="pd25-mono pd25-dim-card__amount pd25-results__value">' +
      esc(valueStr) +
      '</span>' +
      '<button type="button" class="copy-res-btn" data-copy="' +
      encodeURIComponent(valueStr) +
      '" aria-label="Copy ' +
      esc(key) +
      '">Copy</button>' +
      '</div></div></article>';
  });
  html += '</div>';

  if (analysis.rodCorrection && analysis.rodCorrection.rodSubtract > 0) {
    var rc = analysis.rodCorrection;
    html +=
      '<p class="note"><strong>APC correction applied:</strong> ' +
      rc.rodPostHeight +
      ' ' +
      esc(rc.unitLabel) +
      ' post height + ' +
      rc.apcOffsetAdded +
      ' ' +
      esc(rc.unitLabel) +
      ' APC offset = ' +
      rc.rodSubtract +
      ' ' +
      esc(rc.unitLabel) +
      ' subtracted from MB and H elevations.</p>';
  }

  box.hidden = false;
  box.innerHTML = html;
}

function revalidateCsvIfLoaded() {
  if (!state.csvText) return;
  try {
    var analysis = runAnalysis();
    renderPointBadges(analysis.points, analysis.missing);
    syncHcUi(!!(analysis.points && analysis.points.HC));
    refreshViz(analysis);
    if (!document.getElementById('calcResults').hidden && analysis.status === 'ok') {
      renderCalcResults(analysis);
    }
  } catch (err) {
    alert(err.message || String(err));
  }
}

function bindCsv() {
  var input = document.getElementById('csvFile');
  var zone = document.getElementById('dropZone');
  var analyzeBtn = document.getElementById('analyzeBtn');
  if (!input || !zone || !analyzeBtn) return;

  function handleFile(file) {
    if (!file) return;
    state.csvFileName = file.name;
    if (window.WorkspaceApi) {
      window.WorkspaceApi.logEvent('csv_uploaded', { detail: file.name });
    }
    showExportSection(false);
    showExportHints('');
    zone.querySelector('.drop-zone__prompt').innerHTML = '✅ <b>' + esc(file.name) + '</b>';
    var reader = new FileReader();
    reader.onload = function (e) {
      state.csvText = e.target.result;
      try {
        var analysis = runAnalysis();
        renderPointBadges(analysis.points, analysis.missing);
        syncHcUi(!!(analysis.points && analysis.points.HC));
        refreshViz(analysis);
        document.getElementById('calcResults').hidden = true;
      } catch (err) {
        alert(err.message || String(err));
      }
    };
    reader.readAsText(file);
  }

  zone.addEventListener('click', function () {
    input.click();
  });
  input.addEventListener('change', function () {
    if (input.files[0]) handleFile(input.files[0]);
  });
  zone.addEventListener('dragover', function (e) {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', function () {
    zone.classList.remove('dragover');
  });
  zone.addEventListener('drop', function (e) {
    e.preventDefault();
    zone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });

  analyzeBtn.addEventListener('click', function () {
    if (!state.csvText) return;
    var analysis = runAnalysis();
    if (window.WorkspaceApi) {
      window.WorkspaceApi.logCalcRun(
        analysis.status === 'ok' ? 'ok' : 'fail',
        analysis.status !== 'ok' ? analysis.message || analysis.status : ''
      );
    }
    renderCalcResults(analysis);
    refreshViz(analysis);
  });

  var unitsEl = document.getElementById('units');
  if (unitsEl) {
    unitsEl.addEventListener('change', function () {
      updateRodHeightDefault();
      updateHcOffsetHint();
      updateXPinOffsetHint();
      revalidateCsvIfLoaded();
    });
  }

  var csvFormatEl = document.getElementById('csvFormat');
  if (csvFormatEl) {
    csvFormatEl.addEventListener('change', revalidateCsvIfLoaded);
  }
}

function bindCopyResults() {
  if (bindCopyResults._bound) return;
  bindCopyResults._bound = true;
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.copy-res-btn');
    if (!btn) return;
    var enc = btn.getAttribute('data-copy');
    if (!enc) return;
    e.preventDefault();
    copyResultValue(decodeURIComponent(enc), btn);
  });
}

function getPageMode() {
  return document.body.getAttribute('data-pd25-page') || 'combined';
}

function initGuide() {
  var banner = document.getElementById('accuracyBanner');
  if (banner) banner.textContent = PD25_GUIDE.accuracyBanner;
  loadProgress();
  renderTooling();
  renderPhases();
  initImageLightbox();
  window.addEventListener('hashchange', openPhaseFromHash);
}

function initTargets() {
  loadProgress();
  state.expandedPhases['phase-2'] = true;
  renderPhases();
  initImageLightbox();
}

function initCalculator() {
  mountGroundworksDimensions('groundworksDimensions', { omitImages: true });
  bindCsv();
  bindRodUi();
  bindHcUi();
  bindB5Ui();
  bindPdfExport();
  loadSavedDealerBranding();
  updateHcOffsetHint();
  initImageLightbox();
  markExpandableImages(document);
}

function init() {
  var page = getPageMode();
  bindCopyResults();
  if (page === 'targets') {
    initTargets();
    return;
  }
  if (page === 'guide' || page === 'combined') {
    initGuide();
    if (page === 'combined') bindTabs();
  }
  if (page === 'calculator' || page === 'combined') {
    initCalculator();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
