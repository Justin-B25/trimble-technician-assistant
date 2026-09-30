/**
 * Trimble Technician Assistant — Google Workspace client (telemetry, feedback, report upload).
 * Uses hidden iframe form POST (same pattern as feedback) to avoid CORS on Apps Script.
 */
(function () {
  'use strict';

  var DEALER_NAME_KEYS = [
    'tta_preinspection_dealer_name_v1',
  ];
  var SUBMIT_FRAME_NAME = 'ttaWorkspaceSubmitFrame';
  var submitFrame;

  function cfg(key, fallback) {
    var c = window.WORKSPACE_CONFIG || {};
    return c[key] != null && c[key] !== '' ? c[key] : fallback;
  }

  function isEnabled() {
    return cfg('telemetryEnabled', true) !== false && !!cfg('endpoint', '');
  }

  function isSubAppPath(path) {
    return (
      path.indexOf('/groundworks/') !== -1 ||
      path.indexOf('/measure-up/') !== -1 ||
      path.indexOf('/pre-inspection/') !== -1 ||
      path.indexOf('/install-deliverable/') !== -1 ||
      path.indexOf('/excavator/') !== -1 ||
      path.indexOf('/trimble-internal/') !== -1
    );
  }

  function detectTool() {
    var path = (window.location.pathname || '').toLowerCase().replace(/\\/g, '/');
    if (path.indexOf('/groundworks/csv-formatter') !== -1) return 'gw-csv-formatter';
    if (path.indexOf('/trimble-internal/groundworks/csv-formatter') !== -1) return 'gw-csv-formatter';
    if (path.indexOf('/groundworks/pile-qc') !== -1) return 'gw-pile-qc';
    if (path.indexOf('/trimble-internal/groundworks/pile-qc') !== -1) return 'gw-pile-qc';
    if (path.indexOf('/trimble-internal/bench-crane/') !== -1) return 'bench-crane';
    if (path.indexOf('/trimble-internal/index.html') !== -1 || /\/trimble-internal\/?$/.test(path)) {
      return 'internal-hub';
    }
    if (path.indexOf('/groundworks/pd25/calculator') !== -1) return 'pd25-calculator';
    if (path.indexOf('/groundworks/pd25/guide') !== -1) return 'pd25-guide';
    if (path.indexOf('/groundworks/pd25/') !== -1) return 'pd25-hub';
    if (path.indexOf('/groundworks/index.html') !== -1) return 'groundworks-hub';
    if (/\/groundworks\/?$/.test(path)) return 'groundworks-hub';
    if (path.indexOf('/measure-up/ctl/') !== -1) return 'ctl-calculator';
    if (path.indexOf('/measure-up/excavator/') !== -1) return 'excavator-measure-up';
    if (path.indexOf('/measure-up/') !== -1) return 'measure-up-hub';
    if (path.indexOf('/pre-inspection/') !== -1) return 'pre-inspection';
    if (path.indexOf('/install-deliverable/') !== -1) return 'install-deliverable';
    if (path.indexOf('/excavator/') !== -1) return 'excavator';

    if (!isSubAppPath(path)) {
      if (/\/index\.html$/i.test(path)) return 'hub';
      var segs = path.split('/').filter(Boolean);
      var last = segs[segs.length - 1] || '';
      if (!last || path.endsWith('/') || last.indexOf('.') === -1) return 'hub';
    }
    return 'unknown';
  }

  function deviceType() {
    var ua = navigator.userAgent || '';
    if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) return 'tablet';
    if (/Mobile|iPhone|Android/i.test(ua)) return 'mobile';
    return 'desktop';
  }

  function readStorage(key) {
    try {
      return localStorage.getItem(key) || '';
    } catch (e) {
      return '';
    }
  }

  function getDealerName() {
    var i;
    for (i = 0; i < DEALER_NAME_KEYS.length; i++) {
      var v = readStorage(DEALER_NAME_KEYS[i]).trim();
      if (v) return v;
    }
    var dealerField = document.getElementById('dealerName') || document.getElementById('dealer-name');
    if (dealerField && dealerField.value) return dealerField.value.trim();
    return '';
  }

  function getOptionalEmail() {
    if (window.AppAccess && typeof window.AppAccess.getEmail === 'function') {
      var appEmail = window.AppAccess.getEmail();
      if (appEmail) return appEmail;
    }
    if (window.TmcAccess && typeof window.TmcAccess.getStoredEmail === 'function') {
      return window.TmcAccess.getStoredEmail() || '';
    }
    var emailField = document.getElementById('feedbackEmail');
    if (emailField && emailField.value) return emailField.value.trim();
    return '';
  }

  function baseContext() {
    return {
      tool: detectTool(),
      page: window.location.href,
      appVersion: cfg('appVersion', ''),
      dealer: getDealerName(),
      email: getOptionalEmail(),
      userAgent: navigator.userAgent,
      deviceType: deviceType(),
      timestamp: new Date().toISOString(),
    };
  }

  function ensureSubmitFrame() {
    if (submitFrame && submitFrame.parentNode) return submitFrame;
    submitFrame = document.createElement('iframe');
    submitFrame.name = SUBMIT_FRAME_NAME;
    submitFrame.id = SUBMIT_FRAME_NAME;
    submitFrame.hidden = true;
    submitFrame.setAttribute('aria-hidden', 'true');
    submitFrame.setAttribute('tabindex', '-1');
    document.body.appendChild(submitFrame);
    return submitFrame;
  }

  function postPayload(payload) {
    if (!isEnabled()) return Promise.resolve({ ok: false, skipped: true });
    ensureSubmitFrame();
    return new Promise(function (resolve) {
      var form = document.createElement('form');
      form.method = 'POST';
      form.action = cfg('endpoint', '');
      form.target = SUBMIT_FRAME_NAME;
      form.acceptCharset = 'UTF-8';
      form.style.display = 'none';
      var input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'payload';
      input.value = JSON.stringify(payload);
      form.appendChild(input);
      document.body.appendChild(form);
      form.submit();
      setTimeout(function () {
        form.remove();
        resolve({ ok: true, unverified: true });
      }, 1200);
    });
  }

  function jsonpErrorResult(fallbackMessage, err) {
    if (err && err.message === 'Access check timed out') {
      return { ok: false, error: 'The access service timed out. Try again in a moment.' };
    }
    if (err && err.message === 'Access check failed') {
      return { ok: false, error: 'Could not reach the access service. Check your connection and try again.' };
    }
    return { ok: false, error: fallbackMessage };
  }

  function jsonpGet(params) {
    if (!isEnabled()) return Promise.resolve({ ok: false, skipped: true });
    return new Promise(function (resolve, reject) {
      var callbackName =
        'ttaJsonp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
      var query = Object.keys(params || {}).map(function (key) {
        return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
      });
      query.push('callback=' + encodeURIComponent(callbackName));
      var script = document.createElement('script');
      var timeout = setTimeout(function () {
        cleanup();
        reject(new Error('Access check timed out'));
      }, 15000);

      function cleanup() {
        clearTimeout(timeout);
        delete window[callbackName];
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[callbackName] = function (data) {
        cleanup();
        resolve(data || { ok: false });
      };
      script.onerror = function () {
        cleanup();
        reject(new Error('Access check failed'));
      };
      script.src = cfg('endpoint', '') + '?' + query.join('&');
      document.head.appendChild(script);
    });
  }

  function requestAccess(email) {
    return startAccess(email);
  }

  function startAccess(email) {
    var ctx = baseContext();
    return jsonpGet({
      action: 'access_start',
      email: email,
      tool: ctx.tool,
      page: ctx.page,
      appVersion: ctx.appVersion,
      userAgent: ctx.userAgent,
      deviceType: ctx.deviceType,
    }).catch(function (err) {
      return jsonpErrorResult('Could not start access request.', err);
    });
  }

  function verifyAccessCode(email, code) {
    return jsonpGet({
      action: 'access_verify',
      email: email,
      code: code,
    }).catch(function (err) {
      return jsonpErrorResult('Could not verify sign-in code.', err);
    });
  }

  function resendAccessCode(email) {
    return jsonpGet({
      action: 'access_resend_code',
      email: email,
    }).catch(function (err) {
      return jsonpErrorResult('Could not resend sign-in code.', err);
    });
  }

  function checkAccess(email, options) {
    options = options || {};
    var params = { action: 'access_check', email: email };
    if (options.revalidate) params.revalidate = '1';
    return jsonpGet(params).catch(function (err) {
      return jsonpErrorResult('Could not verify access status.', err);
    });
  }

  function startBetaAccess(toolId, email) {
    var ctx = baseContext();
    return jsonpGet({
      action: 'beta_access_start',
      toolId: toolId,
      email: email,
      tool: ctx.tool,
      page: ctx.page,
      appVersion: ctx.appVersion,
      userAgent: ctx.userAgent,
      deviceType: ctx.deviceType,
    }).catch(function (err) {
      return jsonpErrorResult('Could not start BETA access request.', err);
    });
  }

  function checkBetaAccess(toolId, email, options) {
    options = options || {};
    var params = { action: 'beta_access_check', toolId: toolId, email: email };
    if (options.revalidate) params.revalidate = '1';
    return jsonpGet(params).catch(function (err) {
      return jsonpErrorResult('Could not verify BETA access status.', err);
    });
  }

  function logEvent(event, props) {
    props = props || {};
    var payload = Object.assign({ action: 'event', event: event }, baseContext(), props);
    if (props.detail != null && typeof props.detail !== 'string') {
      payload.detail = JSON.stringify(props.detail);
    }
    return postPayload(payload);
  }

  function submitFeedback(data) {
    var payload = Object.assign({ action: 'feedback' }, baseContext(), data || {});
    return postPayload(payload);
  }

  function uploadReport(options) {
    options = options || {};
    var payload = Object.assign(
      {
        action: 'upload',
        reportType: options.reportType || 'report',
        fileName: options.fileName || 'report',
        mimeType: options.mimeType || 'text/html',
        fileBase64: options.fileBase64 || '',
        technician: options.technician || options.techName || '',
        machineModel: options.machineModel || '',
        serialNumber: options.serialNumber || '',
        reportName: options.reportName || '',
      },
      baseContext()
    );
    if (options.dealer || options.dealerName) {
      payload.dealer = options.dealer || options.dealerName;
    }
    return postPayload(payload);
  }

  function utf8ToBase64(str) {
    try {
      return btoa(unescape(encodeURIComponent(str)));
    } catch (e) {
      return btoa(str);
    }
  }

  function logCalcRun(outcome, extra) {
    var detail = outcome || 'ok';
    if (extra) detail += ':' + String(extra).slice(0, 120);
    return logEvent('calc_run', { detail: detail });
  }

  function initPageTelemetry() {
    if (window.AppAccess && typeof window.AppAccess.isAuthorized === 'function' && !window.AppAccess.isAuthorized()) {
      return;
    }
    if (
      document.body &&
      document.body.getAttribute('data-beta-tool') &&
      document.body.classList.contains('beta-access-locked')
    ) {
      return;
    }
    var tool = detectTool();
    if (tool === 'hub') {
      logEvent('hub_open');
    } else if (tool !== 'unknown') {
      logEvent('tool_open', { detail: tool });
    }
  }

  window.WorkspaceApi = {
    logEvent: logEvent,
    logCalcRun: logCalcRun,
    submitFeedback: submitFeedback,
    uploadReport: uploadReport,
    utf8ToBase64: utf8ToBase64,
    detectTool: detectTool,
    baseContext: baseContext,
    isEnabled: isEnabled,
    initPageTelemetry: initPageTelemetry,
    requestAccess: requestAccess,
    startAccess: startAccess,
    verifyAccessCode: verifyAccessCode,
    resendAccessCode: resendAccessCode,
    checkAccess: checkAccess,
    startBetaAccess: startBetaAccess,
    checkBetaAccess: checkBetaAccess,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      if (!window.AppAccess) initPageTelemetry();
    });
  } else if (!window.AppAccess) {
    initPageTelemetry();
  }
})();
