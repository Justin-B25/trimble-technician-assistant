/**
 * Google Workspace backend — telemetry, feedback, optional Drive report archive.
 *
 * Deploy Apps Script from google-workspace/DEPLOY.md, then paste the web app URL below.
 * Until endpoint is set, telemetry is queued locally only (no-op send) and feedback uses mailto.
 */
window.WORKSPACE_CONFIG = {
  /** Web app URL — update after deploying google-workspace/Code.gs (see DEPLOY.md). */
  endpoint:
    'https://script.google.com/macros/s/AKfycbxUWZgf2uvicFpMUvoLBNvWMdqi2rjgPILBGzTJmIzCxjmKOoOR_Ix3Uxj030tDuFo8AQ/exec',
  appVersion: '2026.07.21',
  appName: 'Trimble Technician Assistant',
  recipientEmail: 'justin_bill@trimble.com',
  /** Public app URL — used in approval emails from Apps Script CONFIG.APP_URL */
  appUrl: 'https://Justin-B25.github.io/trimble-technician-assistant/',
  /** Approved access duration (days) — must match Code.gs ACCESS_GRANT_DAYS */
  accessGrantDays: 28,
  /** Sign-in code validity (minutes) — must match Code.gs ACCESS_CODE_MINUTES */
  accessCodeMinutes: 15,
  /** Set false to disable all background posts (local app still works). */
  telemetryEnabled: true,
  /** Show “Send copy to Trimble” on PDF export sections. */
  driveUploadEnabled: true,
  /** BETA tools — per-tool labels for access gate and admin emails */
  betaTools: {
    'gw-csv-formatter': {
      label: 'Groundworks CSV Formatter (BETA)',
      path: 'groundworks/csv-formatter/index.html',
    },
    'excavator-measure-up': {
      label: 'Excavator Measure-Up Calculator (BETA)',
      path: 'measure-up/excavator/index.html',
    },
  },
  /** Domains that skip manual approval — must match Code.gs AUTO_APPROVE_DOMAINS (subdomains included). */
  autoApproveDomains: ['trimble.com', 'trimblecorp.net'],
};

/** Shared auto-approve domain checks (hub, BETA gate, internal tools). */
window.WORKSPACE_ACCESS = (function () {
  'use strict';

  function normalizeEmail(raw) {
    return String(raw || '').trim().toLowerCase();
  }

  function getEmailDomain(email) {
    var parts = normalizeEmail(email).split('@');
    return parts.length === 2 ? parts[1] : '';
  }

  function getAutoApproveDomains() {
    var raw = (window.WORKSPACE_CONFIG && window.WORKSPACE_CONFIG.autoApproveDomains) || ['trimble.com'];
    if (Array.isArray(raw)) {
      return raw
        .map(function (part) {
          return String(part || '').trim().toLowerCase();
        })
        .filter(Boolean);
    }
    return String(raw)
      .split(',')
      .map(function (part) {
        return part.trim().toLowerCase();
      })
      .filter(Boolean);
  }

  function domainMatchesAutoApprove(domain, approvedDomain) {
    return domain === approvedDomain || domain.slice(-1 - approvedDomain.length) === '.' + approvedDomain;
  }

  function isAutoApproveEmail(email) {
    var domain = getEmailDomain(email);
    if (!domain) return false;
    var domains = getAutoApproveDomains();
    var i;
    for (i = 0; i < domains.length; i++) {
      if (domainMatchesAutoApprove(domain, domains[i])) return true;
    }
    return false;
  }

  return {
    getAutoApproveDomains: getAutoApproveDomains,
    isAutoApproveEmail: isAutoApproveEmail,
    /** @deprecated Use isAutoApproveEmail — kept for callers expecting trimble.com only */
    isTrimbleEmail: isAutoApproveEmail,
  };
})();

/** @deprecated Use WORKSPACE_CONFIG — kept for feedback.js compatibility */
window.FEEDBACK_CONFIG = {
  endpoint: window.WORKSPACE_CONFIG.endpoint,
  recipientEmail: window.WORKSPACE_CONFIG.recipientEmail,
  appName: window.WORKSPACE_CONFIG.appName,
};
