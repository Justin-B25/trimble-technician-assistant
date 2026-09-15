/**
 * Trimble Technician Assistant — Google Workspace backend
 *
 * Copy this entire file into a Google Apps Script project bound to a Google Sheet
 * (Extensions → Apps Script), or a standalone script with SPREADSHEET_ID set below.
 *
 * See DEPLOY.md for setup steps.
 * Groundworks CSV export is local-only in the app — no csv_email server handlers.
 */

var CONFIG = {
  /** Technician Assistant — Analytics */
  SPREADSHEET_ID: '1io6EBhpC1LKELjhjLOtH9w6jn9ZMiwx7sEcosr3Snm4',
  /** Technician Assistant — Report Archive */
  DRIVE_FOLDER_ID: '1oZK53RQj23uuQ9naORlZiCiwTBiL63Fw',
  RECIPIENT_EMAIL: 'justin_bill@trimble.com',
  /** Public app URL — used in approval emails */
  APP_URL: 'https://Justin-B25.github.io/trimble-technician-assistant/',
  /** Days before approved users must request access again */
  ACCESS_GRANT_DAYS: 28,
  /** Comma-separated domains that auto-approve (no manual review) */
  AUTO_APPROVE_DOMAINS: 'trimble.com,trimblecorp.net',
  /** One-time sign-in code lifetime (minutes) */
  ACCESS_CODE_MINUTES: 15,
};

function parsePayload(e) {
  if (e.parameter && e.parameter.payload) {
    return JSON.parse(e.parameter.payload);
  }
  if (e.postData && e.postData.contents) {
    return JSON.parse(e.postData.contents);
  }
  return e.parameter || {};
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function getSpreadsheet() {
  if (!CONFIG.SPREADSHEET_ID || CONFIG.SPREADSHEET_ID.indexOf('PASTE_') === 0) {
    throw new Error('Set CONFIG.SPREADSHEET_ID in Apps Script.');
  }
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

var SHEET_HEADERS = {
  Events: [
    'timestamp',
    'event',
    'tool',
    'page',
    'appVersion',
    'dealer',
    'email',
    'detail',
    'userAgent',
    'deviceType',
  ],
  Feedback: [
    'timestamp',
    'type',
    'topic',
    'name',
    'email',
    'tool',
    'page',
    'message',
    'appVersion',
    'userAgent',
    'deviceType',
  ],
  Uploads: [
    'timestamp',
    'reportType',
    'fileName',
    'dealer',
    'technician',
    'machineModel',
    'serialNumber',
    'reportName',
    'tool',
    'page',
    'appVersion',
    'driveFileId',
    'driveFileUrl',
  ],
  AccessRequests: [
    'timestamp',
    'email',
    'status',
    'token',
    'requestedAt',
    'resolvedAt',
    'resolvedBy',
    'userAgent',
    'deviceType',
    'page',
  ],
  ApprovedUsers: [
    'email',
    'grantedAt',
    'expiresAt',
    'grantType',
    'approvedBy',
    'lastCheckAt',
    'revokeToken',
    'Revoke',
  ],
  AccessCodes: ['email', 'code', 'expiresAt', 'createdAt'],
  BetaAccessRequests: [
    'timestamp',
    'toolId',
    'email',
    'status',
    'token',
    'requestedAt',
    'resolvedAt',
    'resolvedBy',
    'page',
  ],
  BetaApprovedUsers: ['toolId', 'email', 'grantedAt', 'expiresAt', 'grantType', 'approvedBy', 'lastCheckAt'],
};

function ensureSheet(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }
  return sheet;
}

function clearSheetBanding(sheet) {
  var bandings = sheet.getBandings();
  var i;
  for (i = 0; i < bandings.length; i++) {
    bandings[i].remove();
  }
}

function formatSheetHeaderOnly(sheet, colCount) {
  if (!sheet || !colCount || colCount < 1) return;
  sheet
    .getRange(1, 1, 1, colCount)
    .setBackground('#005f9e')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setFontSize(10)
    .setVerticalAlignment('middle');
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 32);
}

function formatDataSheet(sheet, colCount) {
  if (!sheet) {
    throw new Error('formatDataSheet requires a sheet. Run setupSheets instead of formatDataSheet.');
  }
  if (!colCount || colCount < 1) {
    throw new Error('formatDataSheet requires a column count.');
  }
  var header = sheet.getRange(1, 1, 1, colCount);
  header
    .setBackground('#005f9e')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setFontSize(10)
    .setVerticalAlignment('middle');
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, colCount).setWrap(false);
  sheet.setRowHeight(1, 32);

  var widths = {
    1: 165,
    2: 140,
    3: 120,
    4: 220,
    5: 95,
    6: 110,
    7: 180,
    8: 200,
    9: 280,
    10: 90,
    11: 90,
    12: 200,
    13: 220,
  };
  var c;
  for (c = 1; c <= colCount; c++) {
    sheet.setColumnWidth(c, widths[c] || 120);
  }

  if (sheet.getLastRow() > 1) {
    clearSheetBanding(sheet);
    var bandNumRows = Math.min(sheet.getLastRow(), 5000) - 1;
    if (bandNumRows > 0) {
      sheet
        .getRange(2, 1, bandNumRows, colCount)
        .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY);
    }
  }
}

function setupReadmeSheet(ss) {
  var name = 'README';
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name, 0);
  } else {
    sheet.clear();
  }

  sheet.getRange('A1').setValue('Technician Assistant — Analytics').setFontSize(16).setFontWeight('bold');
  sheet.getRange('A2').setValue('Usage events, feedback, and optional report uploads from the field app.');
  sheet.getRange('A4').setValue('Tabs').setFontWeight('bold').setFontColor('#005f9e');
  sheet.getRange('A5:D5').setValues([
    ['Tab', 'Purpose', 'Key columns', 'Looker Studio tip'],
  ]);
  sheet.getRange('A6:D11').setValues([
    ['Events', 'Adoption & funnel', 'event, tool, deviceType', 'Chart event counts by week'],
    ['Feedback', 'Friction & bugs', 'type, topic, page, message', 'Filter by tool and type'],
    ['Uploads', 'Opt-in reports', 'reportType, dealer, driveFileUrl', 'Count exports by dealer'],
    ['AccessRequests', 'App access queue', 'email, status, token', 'Filter status = pending'],
    ['ApprovedUsers', 'Active access grants', 'email, expiresAt, grantType', 'Filter expiresAt > today'],
    ['AccessCodes', 'Email sign-in codes', 'email, code, expiresAt', 'Short-lived verification'],
  ]);

  sheet.getRange('A13').setValue('Common events').setFontWeight('bold').setFontColor('#005f9e');
  sheet.getRange('A14:B35').setValues([
    ['hub_open', 'User opened the hub'],
    ['category_open', 'User opened a hub category'],
    ['tool_open', 'User opened a tool page'],
    ['access_requested', 'User requested app access (non-Trimble email)'],
    ['access_granted', 'Access approved (auto @trimble.com or manual grant)'],
    ['access_denied', 'Access request denied'],
    ['access_verified', 'User verified email with sign-in code'],
    ['access_revoked', 'Admin revoked an active access grant'],
    ['calc_run', 'User ran CTL or PD25 measure-up calculator'],
    ['csv_download', 'GW CSV formatter downloaded export locally'],
    ['csv_save_as', 'GW CSV formatter saved export to chosen folder'],
    ['csv_uploaded', 'Survey CSV uploaded'],
    ['csv_analyzed:ok', 'Calculator succeeded'],
    ['csv_analyzed:fail', 'Calculator failed (see detail column)'],
    ['csv_analyzed:missing', 'Required survey point missing from CSV'],
    ['calc_warnings', 'PD25 calculator warnings after run'],
    ['calc_options', 'PD25 calculator options snapshot'],
    ['pdf_exported', 'User generated a PDF'],
    ['pdf_export_with_dealer', 'PDF export included dealer name on upload'],
    ['guide_phase_complete', 'PD25 workflow phase finished'],
    ['guide_section_view', 'Bench crane segment opened'],
    ['guide_section_complete', 'Bench crane segment marked complete'],
    ['prestart_complete', 'Excavator prestart checklist finished'],
    ['symptom_analyzed', 'Excavator symptom search run'],
  ]);

  sheet.getRange('A1:D35').setWrap(true).setVerticalAlignment('top');
  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 200);
  sheet.setColumnWidth(3, 220);
  sheet.setColumnWidth(4, 240);
  sheet.getRange('A5:D5')
    .setBackground('#005f9e')
    .setFontColor('#ffffff')
    .setFontWeight('bold');
  clearSheetBanding(sheet);
  try {
    sheet.getRange('A6:D11').applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY);
  } catch (bandErr) {
    Logger.log('setupReadmeSheet: skipped row banding — ' + bandErr);
  }
  sheet.setFrozenRows(5);
}

function removeDefaultSheet(ss) {
  var sheet = ss.getSheetByName('Sheet1');
  if (sheet && ss.getSheets().length > 1) {
    ss.deleteSheet(sheet);
  }
}

function reorderSheets(ss, namesInOrder) {
  // Move from last to first so indices stay stable.
  var i;
  for (i = namesInOrder.length - 1; i >= 0; i--) {
    var sheet = ss.getSheetByName(namesInOrder[i]);
    if (sheet) {
      ss.setActiveSheet(sheet);
      ss.moveActiveSheet(1);
    }
  }
}

function appendEvent(data) {
  var ss = getSpreadsheet();
  var headers = SHEET_HEADERS.Events;
  var sheet = ensureSheet(ss, 'Events', headers);
  sheet.appendRow([
    data.timestamp || new Date().toISOString(),
    data.event || '',
    data.tool || '',
    data.page || '',
    data.appVersion || '',
    data.dealer || '',
    data.email || '',
    data.detail || '',
    data.userAgent || '',
    data.deviceType || '',
  ]);
}

function appendFeedback(data) {
  var ss = getSpreadsheet();
  var headers = SHEET_HEADERS.Feedback;
  var sheet = ensureSheet(ss, 'Feedback', headers);
  sheet.appendRow([
    data.timestamp || new Date().toISOString(),
    data.type || '',
    data.topic || '',
    data.name || '',
    data.email || '',
    data.tool || '',
    data.page || '',
    data.message || '',
    data.appVersion || '',
    data.userAgent || '',
    data.deviceType || '',
  ]);
}

function appendUpload(data, fileId, fileUrl) {
  var ss = getSpreadsheet();
  var headers = SHEET_HEADERS.Uploads;
  var sheet = ensureSheet(ss, 'Uploads', headers);
  sheet.appendRow([
    data.timestamp || new Date().toISOString(),
    data.reportType || '',
    data.fileName || '',
    data.dealer || '',
    data.technician || '',
    data.machineModel || '',
    data.serialNumber || '',
    data.reportName || '',
    data.tool || '',
    data.page || '',
    data.appVersion || '',
    fileId || '',
    fileUrl || '',
  ]);
}

function sendFeedbackEmail(data) {
  var recipient = CONFIG.RECIPIENT_EMAIL;
  var subject =
    '[Tech Assistant] ' +
    (data.type || 'Feedback') +
    (data.topic ? ' — ' + data.topic : '');
  var body =
    'Type: ' +
    (data.type || '') +
    '\nTool: ' +
    (data.tool || '') +
    '\nApp version: ' +
    (data.appVersion || '') +
    '\nFrom: ' +
    (data.name || 'Anonymous') +
    (data.email ? ' <' + data.email + '>' : '') +
    '\nPage: ' +
    (data.page || '') +
    '\nDevice: ' +
    (data.deviceType || '') +
    ' / ' +
    (data.userAgent || '') +
    '\n\n' +
    (data.message || '');
  var options = {};
  if (data.email) options.replyTo = data.email;
  MailApp.sendEmail(recipient, subject, body, options);
}

function saveReportToDrive(data) {
  if (!CONFIG.DRIVE_FOLDER_ID || CONFIG.DRIVE_FOLDER_ID.indexOf('PASTE_') === 0) {
    throw new Error('Set CONFIG.DRIVE_FOLDER_ID in Apps Script.');
  }
  if (!data.fileBase64) {
    throw new Error('Missing fileBase64.');
  }
  var folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  var mime = data.mimeType || 'text/html';
  var ext = mime.indexOf('html') >= 0 ? '.html' : '';
  var baseName = (data.fileName || 'report').replace(/[\\/:*?"<>|]+/g, '_');
  var name = baseName.indexOf('.') === -1 ? baseName + ext : baseName;
  var bytes = Utilities.base64Decode(data.fileBase64);
  var blob = Utilities.newBlob(bytes, mime, name);
  var file = folder.createFile(blob);
  return { id: file.getId(), url: file.getUrl() };
}

function normalizeAccessEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

function isValidAccessEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getAccessEmailDomain(email) {
  var parts = normalizeAccessEmail(email).split('@');
  return parts.length === 2 ? parts[1] : '';
}

function getAutoApproveDomains() {
  return String(CONFIG.AUTO_APPROVE_DOMAINS || 'trimble.com')
    .split(',')
    .map(function (part) {
      return part.trim().toLowerCase();
    })
    .filter(Boolean);
}

function isAutoApproveEmail(email) {
  var domain = getAccessEmailDomain(email);
  if (!domain) return false;
  var domains = getAutoApproveDomains();
  var i;
  for (i = 0; i < domains.length; i++) {
    var approved = domains[i];
    if (domain === approved || domain.slice(-1 - approved.length) === '.' + approved) {
      return true;
    }
  }
  return false;
}

function getAccessGrantDays() {
  var days = Number(CONFIG.ACCESS_GRANT_DAYS);
  return days > 0 ? days : 28;
}

function getAccessGrantMs() {
  return getAccessGrantDays() * 24 * 60 * 60 * 1000;
}

function getWebAppUrl() {
  try {
    return ScriptApp.getService().getUrl();
  } catch (err) {
    return '';
  }
}

function buildAccessRevokeUrl(email, token) {
  return (
    getWebAppUrl() +
    '?action=access_revoke&email=' +
    encodeURIComponent(email) +
    '&token=' +
    encodeURIComponent(token)
  );
}

function setRevokeLinkForRow(sheet, row, email, token) {
  if (!sheet || !row || row < 2) return;
  var url = buildAccessRevokeUrl(email, token);
  sheet.getRange(row, 8).setFormula('=HYPERLINK("' + url + '","Revoke access")');
}

function refreshApprovedUserRevokeLinks() {
  var ss = getSpreadsheet();
  var sheet = ensureSheet(ss, 'ApprovedUsers', SHEET_HEADERS.ApprovedUsers);
  var values = sheet.getDataRange().getValues();
  var i;
  var updated = 0;
  for (i = 1; i < values.length; i++) {
    var email = normalizeAccessEmail(values[i][0]);
    if (!email) continue;
    var token = String(values[i][6] || '');
    if (!token) {
      token = Utilities.getUuid();
      sheet.getRange(i + 1, 7).setValue(token);
    }
    setRevokeLinkForRow(sheet, i + 1, email, token);
    updated++;
  }
  return updated;
}

function revokeApprovedAccess(email, revokedBy) {
  var normalized = normalizeAccessEmail(email);
  if (!isValidAccessEmail(normalized)) return false;
  clearAccessCodesForEmail(normalized);
  var ss = getSpreadsheet();
  var sheet = ensureSheet(ss, 'ApprovedUsers', SHEET_HEADERS.ApprovedUsers);
  var existing = findApprovedUserRow(sheet, normalized);
  if (!existing) return false;
  sheet.deleteRow(existing.row);
  logAccessEvent('access_revoked', normalized, revokedBy || 'admin', { tool: 'hub', page: getAppUrl() });
  return true;
}

function handleAccessRevoke(params) {
  var email = normalizeAccessEmail(params.email);
  var token = String(params.token || '');
  if (!isValidAccessEmail(email) || !token) {
    return htmlAccessPage('Revoke failed', 'Missing email or token.', false);
  }
  var ss = getSpreadsheet();
  var sheet = ensureSheet(ss, 'ApprovedUsers', SHEET_HEADERS.ApprovedUsers);
  var existing = findApprovedUserRow(sheet, email);
  if (!existing || String(existing.values[6] || '') !== token) {
    return htmlAccessPage('Revoke failed', 'This revoke link is invalid or already used.', false);
  }
  revokeApprovedAccess(email, CONFIG.RECIPIENT_EMAIL);
  return htmlAccessPage(
    'Access revoked',
    'Removed app access for <strong>' + email + '</strong>. They will need approval again to sign in.',
    true
  );
}

function revokeSelectedApprovedUser() {
  var ui = SpreadsheetApp.getUi();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if (!sheet || sheet.getName() !== 'ApprovedUsers') {
    ui.alert('Open the ApprovedUsers tab and select the user row to revoke.');
    return;
  }
  var row = sheet.getActiveRange() ? sheet.getActiveRange().getRow() : 0;
  if (row < 2) {
    ui.alert('Select a user row on ApprovedUsers (not the header).');
    return;
  }
  var email = normalizeAccessEmail(sheet.getRange(row, 1).getValue());
  if (!isValidAccessEmail(email)) {
    ui.alert('Could not read an email address from the selected row.');
    return;
  }
  var response = ui.alert(
    'Revoke access for ' + email + '?',
    'They will be locked out on their next app check and must request access again.',
    ui.ButtonSet.YES_NO
  );
  if (response !== ui.Button.YES) return;
  if (!revokeApprovedAccess(email, Session.getActiveUser().getEmail())) {
    ui.alert('No active grant found for ' + email + '.');
    return;
  }
  ui.alert('Revoked access for ' + email + '.');
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Tech Assistant')
    .addItem('Revoke selected user', 'revokeSelectedApprovedUser')
    .addItem('Refresh revoke links', 'refreshApprovedUserRevokeLinks')
    .addToUi();
}

function getAppUrl() {
  var url = String(CONFIG.APP_URL || '').trim();
  if (!url) return getWebAppUrl();
  return url.charAt(url.length - 1) === '/' ? url : url + '/';
}

function accessIsoDate(ms) {
  return new Date(ms).toISOString();
}

function findApprovedUserRow(sheet, email) {
  var normalized = normalizeAccessEmail(email);
  var values = sheet.getDataRange().getValues();
  var i;
  for (i = 1; i < values.length; i++) {
    if (normalizeAccessEmail(values[i][0]) === normalized) {
      return { row: i + 1, values: values[i] };
    }
  }
  return null;
}

function findLatestAccessRequestRow(sheet, email) {
  var normalized = normalizeAccessEmail(email);
  var values = sheet.getDataRange().getValues();
  var i;
  var latest = null;
  for (i = 1; i < values.length; i++) {
    if (normalizeAccessEmail(values[i][1]) === normalized) {
      latest = { row: i + 1, values: values[i] };
    }
  }
  return latest;
}

function upsertApprovedUser(email, grantType, approvedBy) {
  var ss = getSpreadsheet();
  var sheet = ensureSheet(ss, 'ApprovedUsers', SHEET_HEADERS.ApprovedUsers);
  var now = Date.now();
  var expiresAt = now + getAccessGrantMs();
  var existing = findApprovedUserRow(sheet, email);
  var revokeToken = existing && existing.values[6] ? String(existing.values[6]) : Utilities.getUuid();
  var rowValues = [
    normalizeAccessEmail(email),
    accessIsoDate(now),
    accessIsoDate(expiresAt),
    grantType || 'manual',
    approvedBy || '',
    accessIsoDate(now),
    revokeToken,
    '',
  ];
  var targetRow;
  if (existing) {
    targetRow = existing.row;
    sheet.getRange(existing.row, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
    targetRow = sheet.getLastRow();
  }
  setRevokeLinkForRow(sheet, targetRow, normalizeAccessEmail(email), revokeToken);
  return {
    email: normalizeAccessEmail(email),
    status: 'approved',
    grantType: grantType || 'manual',
    grantedAt: accessIsoDate(now),
    expiresAt: accessIsoDate(expiresAt),
  };
}

function readApprovedAccess(email) {
  var ss = getSpreadsheet();
  var sheet = ensureSheet(ss, 'ApprovedUsers', SHEET_HEADERS.ApprovedUsers);
  var existing = findApprovedUserRow(sheet, email);
  if (!existing) return null;
  var expiresAt = new Date(existing.values[2]).getTime();
  if (!expiresAt || isNaN(expiresAt)) return null;
  if (Date.now() > expiresAt) {
    return {
      email: normalizeAccessEmail(email),
      status: 'expired',
      expiresAt: accessIsoDate(expiresAt),
      grantType: existing.values[3] || '',
    };
  }
  sheet.getRange(existing.row, 6).setValue(accessIsoDate(Date.now()));
  return {
    email: normalizeAccessEmail(email),
    status: 'approved',
    expiresAt: accessIsoDate(expiresAt),
    grantedAt: existing.values[1] || '',
    grantType: existing.values[3] || '',
  };
}

function createPendingAccessRequest(data) {
  var ss = getSpreadsheet();
  var sheet = ensureSheet(ss, 'AccessRequests', SHEET_HEADERS.AccessRequests);
  var email = normalizeAccessEmail(data.email);
  var latest = findLatestAccessRequestRow(sheet, email);
  if (latest && String(latest.values[2] || '').toLowerCase() === 'pending') {
    return {
      email: email,
      status: 'pending',
      token: latest.values[3] || '',
      duplicate: true,
    };
  }
  var token = Utilities.getUuid();
  var nowIso = accessIsoDate(Date.now());
  sheet.appendRow([
    nowIso,
    email,
    'pending',
    token,
    nowIso,
    '',
    '',
    data.userAgent || '',
    data.deviceType || '',
    data.page || '',
  ]);
  return {
    email: email,
    status: 'pending',
    token: token,
    duplicate: false,
  };
}

function resolveAccessRequest(email, status, resolvedBy, token) {
  var ss = getSpreadsheet();
  var sheet = ensureSheet(ss, 'AccessRequests', SHEET_HEADERS.AccessRequests);
  var latest = findLatestAccessRequestRow(sheet, email);
  if (!latest) return false;
  if (token && String(latest.values[3]) !== String(token)) return false;
  if (String(latest.values[2] || '').toLowerCase() !== 'pending') return false;
  sheet.getRange(latest.row, 3).setValue(status);
  sheet.getRange(latest.row, 6).setValue(accessIsoDate(Date.now()));
  sheet.getRange(latest.row, 7).setValue(resolvedBy || '');
  return true;
}

function sendAccessAdminEmail(email, token) {
  var recipient = CONFIG.RECIPIENT_EMAIL;
  var webAppUrl = getWebAppUrl();
  var approveUrl =
    webAppUrl +
    '?action=access_approve&email=' +
    encodeURIComponent(email) +
    '&token=' +
    encodeURIComponent(token);
  var denyUrl =
    webAppUrl +
    '?action=access_deny&email=' +
    encodeURIComponent(email) +
    '&token=' +
    encodeURIComponent(token);
  var subject = '[Tech Assistant] Access request — ' + email;
  var plain =
    email +
    ' is requesting access to the Technician Assistant.\n\n' +
    'Grant: ' +
    approveUrl +
    '\nDeny: ' +
    denyUrl;
  var html =
    '<p><strong>' +
    email +
    '</strong> is requesting access to the Technician Assistant.</p>' +
    '<p style="margin:24px 0;">' +
    '<a href="' +
    approveUrl +
    '" style="display:inline-block;padding:12px 20px;margin-right:12px;background:#005f9e;color:#fff;text-decoration:none;border-radius:6px;font-weight:700;">Grant permission</a>' +
    '<a href="' +
    denyUrl +
    '" style="display:inline-block;padding:12px 20px;background:#fff;color:#b42318;text-decoration:none;border-radius:6px;border:1px solid #d0d5dd;font-weight:700;">Deny</a>' +
    '</p>' +
    '<p style="color:#666;font-size:13px;">Approved users receive app access for ' +
    getAccessGrantDays() +
    ' days.</p>';
  MailApp.sendEmail({
    to: recipient,
    subject: subject,
    body: plain,
    htmlBody: html,
    replyTo: email,
  });
}

function sendAccessApprovedUserEmail(email, expiresAt, signInCode) {
  var appUrl = getAppUrl();
  var minutes = Math.round(getAccessCodeTtlMs() / 60000);
  var subject = 'Technician Assistant — access approved';
  var plain =
    'Your access to the Trimble Technician Assistant has been approved for ' +
    getAccessGrantDays() +
    ' days.\n\n' +
    'Open the app: ' +
    appUrl +
    '\n\n' +
    'Your sign-in code is: ' +
    signInCode +
    '\n\n' +
    'Enter your email address (' +
    email +
    ') and this code in the app to verify your inbox. The code expires in ' +
    minutes +
    ' minutes.\n\n' +
    'Access expires: ' +
    expiresAt;
  var html =
    '<p>Your access to the <strong>Trimble Technician Assistant</strong> has been approved for <strong>' +
    getAccessGrantDays() +
    ' days</strong>.</p>' +
    '<p style="margin:24px 0;"><a href="' +
    appUrl +
    '" style="display:inline-block;padding:12px 20px;background:#005f9e;color:#fff;text-decoration:none;border-radius:6px;font-weight:700;">Open Technician Assistant</a></p>' +
    '<p>Your sign-in code is:</p>' +
    '<p style="font-size:30px;font-weight:700;letter-spacing:6px;margin:18px 0;color:#005f9e;">' +
    signInCode +
    '</p>' +
    '<p>Enter your email address (<strong>' +
    email +
    '</strong>) and this code in the app. It expires in <strong>' +
    minutes +
    ' minutes</strong>.</p>' +
    '<p style="color:#666;font-size:13px;">Access expires: ' +
    expiresAt +
    '</p>';
  MailApp.sendEmail({
    to: email,
    subject: subject,
    body: plain,
    htmlBody: html,
    name: 'Technician Assistant',
  });
}

function sendAccessDeniedUserEmail(email) {
  var subject = 'Technician Assistant — access request update';
  var body =
    'Your request to use the Trimble Technician Assistant was not approved at this time.\n\n' +
    'If you believe this is an error, contact your Trimble representative.';
  MailApp.sendEmail(email, subject, body);
}

function logAccessEvent(event, email, detail, data) {
  appendEvent({
    timestamp: new Date().toISOString(),
    event: event,
    tool: (data && data.tool) || 'hub',
    page: (data && data.page) || '',
    appVersion: (data && data.appVersion) || '',
    dealer: (data && data.dealer) || '',
    email: email || '',
    detail: detail || '',
    userAgent: (data && data.userAgent) || '',
    deviceType: (data && data.deviceType) || '',
  });
}

function getAccessCodeTtlMs() {
  var minutes = Number(CONFIG.ACCESS_CODE_MINUTES);
  if (!minutes || isNaN(minutes) || minutes < 5) minutes = 15;
  return minutes * 60 * 1000;
}

function generateAccessCode() {
  var code = '';
  for (var i = 0; i < 6; i++) {
    code += String(Math.floor(Math.random() * 10));
  }
  return code;
}

function findAccessCodeRows(sheet, email) {
  var normalized = normalizeAccessEmail(email);
  var values = sheet.getDataRange().getValues();
  var rows = [];
  var i;
  for (i = 1; i < values.length; i++) {
    if (normalizeAccessEmail(values[i][0]) === normalized) {
      rows.push({ row: i + 1, values: values[i] });
    }
  }
  return rows;
}

function clearAccessCodesForEmail(email) {
  var ss = getSpreadsheet();
  var sheet = ensureSheet(ss, 'AccessCodes', SHEET_HEADERS.AccessCodes);
  var rows = findAccessCodeRows(sheet, email);
  for (var i = rows.length - 1; i >= 0; i--) {
    sheet.deleteRow(rows[i].row);
  }
}

function getValidAccessCode(email) {
  var ss = getSpreadsheet();
  var sheet = ensureSheet(ss, 'AccessCodes', SHEET_HEADERS.AccessCodes);
  var rows = findAccessCodeRows(sheet, email);
  if (!rows.length) return null;
  var latest = rows[rows.length - 1];
  var expiresAt = new Date(latest.values[2]).getTime();
  if (!expiresAt || Date.now() > expiresAt) return null;
  return { code: String(latest.values[1] || ''), expiresAt: latest.values[2] };
}

function issueAccessCode(email, options) {
  options = options || {};
  var ss = getSpreadsheet();
  var sheet = ensureSheet(ss, 'AccessCodes', SHEET_HEADERS.AccessCodes);
  var normalized = normalizeAccessEmail(email);
  var rows = findAccessCodeRows(sheet, normalized);
  if (rows.length && !options.forceNew) {
    var createdAt = new Date(rows[rows.length - 1].values[3]).getTime();
    if (createdAt && Date.now() - createdAt < 60000) {
      return {
        sent: false,
        code: String(rows[rows.length - 1].values[1] || ''),
        throttled: true,
        reused: true,
      };
    }
  }
  clearAccessCodesForEmail(normalized);
  var code = generateAccessCode();
  var now = Date.now();
  var expiresAt = accessIsoDate(now + getAccessCodeTtlMs());
  sheet.appendRow([normalized, code, expiresAt, accessIsoDate(now)]);
  if (!options.skipEmail) {
    sendAccessCodeEmail(normalized, code);
  }
  return { sent: !options.skipEmail, code: code, throttled: false, reused: false };
}

function ensureAccessCode(email, options) {
  options = options || {};
  var normalized = normalizeAccessEmail(email);
  if (!options.forceNew) {
    var active = getValidAccessCode(normalized);
    if (active) {
      return { sent: false, code: active.code, throttled: false, reused: true };
    }
  }
  return issueAccessCode(normalized, options);
}

function sendAccessCodeEmail(email, code) {
  var minutes = Math.round(getAccessCodeTtlMs() / 60000);
  var subject = 'Technician Assistant — your sign-in code';
  var plain =
    'Your Technician Assistant sign-in code is: ' +
    code +
    '\n\nEnter this code in the app to verify your email address. The code expires in ' +
    minutes +
    ' minutes.\n\nIf you did not request this, you can ignore this email.';
  var html =
    '<p>Your <strong>Technician Assistant</strong> sign-in code is:</p>' +
    '<p style="font-size:30px;font-weight:700;letter-spacing:6px;margin:18px 0;color:#005f9e;">' +
    code +
    '</p>' +
    '<p>Enter this code in the app to verify your email address. It expires in <strong>' +
    minutes +
    ' minutes</strong>.</p>' +
    '<p style="color:#666;font-size:13px;">If you did not request this, you can ignore this email.</p>';
  MailApp.sendEmail({
    to: email,
    subject: subject,
    body: plain,
    htmlBody: html,
    name: 'Technician Assistant',
  });
}

function verifyAccessCode(email, code) {
  var normalized = normalizeAccessEmail(email);
  var submitted = String(code || '').trim();
  if (!/^\d{6}$/.test(submitted)) return false;
  var ss = getSpreadsheet();
  var sheet = ensureSheet(ss, 'AccessCodes', SHEET_HEADERS.AccessCodes);
  var rows = findAccessCodeRows(sheet, normalized);
  if (!rows.length) return false;
  var latest = rows[rows.length - 1];
  var storedCode = String(latest.values[1] || '');
  var expiresAt = new Date(latest.values[2]).getTime();
  if (!expiresAt || Date.now() > expiresAt) {
    clearAccessCodesForEmail(normalized);
    return false;
  }
  if (storedCode !== submitted) return false;
  clearAccessCodesForEmail(normalized);
  return true;
}

function handleAccessVerify(params) {
  var email = normalizeAccessEmail(params.email);
  var code = String(params.code || '').trim();
  if (!isValidAccessEmail(email)) {
    return { ok: false, error: 'Invalid email address.' };
  }
  if (!verifyAccessCode(email, code)) {
    return { ok: false, error: 'Invalid or expired code. Request a new code and try again.' };
  }
  var approved = readApprovedAccess(email);
  if (!approved || approved.status !== 'approved') {
    return { ok: false, error: 'Access is not active for this email.' };
  }
  logAccessEvent('access_verified', email, 'code', params);
  return {
    ok: true,
    status: 'approved',
    email: email,
    expiresAt: approved.expiresAt,
    grantType: approved.grantType,
  };
}

function handleAccessResendCode(params) {
  var email = normalizeAccessEmail(params.email);
  if (!isValidAccessEmail(email)) {
    return { ok: false, error: 'Invalid email address.' };
  }
  var approved = readApprovedAccess(email);
  if (!approved || approved.status !== 'approved') {
    return { ok: false, error: 'No active access grant for this email.' };
  }
  var issued = ensureAccessCode(email, { forceNew: true });
  return {
    ok: true,
    status: 'verify_code',
    email: email,
    resent: !!issued.sent,
    throttled: !!issued.throttled,
  };
}

function buildAccessCheckResult(email, options) {
  options = options || {};
  var revalidate = options.revalidate === true || String(options.revalidate || '') === '1';
  var normalized = normalizeAccessEmail(email);
  if (!isValidAccessEmail(normalized)) {
    return { ok: false, status: 'invalid', email: normalized };
  }
  var approved = readApprovedAccess(normalized);
  if (approved && approved.status === 'approved') {
    if (!revalidate) {
      return { ok: true, status: 'verify_code', email: normalized };
    }
    return { ok: true, status: 'approved', email: normalized, expiresAt: approved.expiresAt, grantType: approved.grantType };
  }
  if (approved && approved.status === 'expired') {
    return { ok: true, status: 'expired', email: normalized, expiresAt: approved.expiresAt };
  }
  var ss = getSpreadsheet();
  var sheet = ensureSheet(ss, 'AccessRequests', SHEET_HEADERS.AccessRequests);
  var latest = findLatestAccessRequestRow(sheet, normalized);
  if (latest) {
    var requestStatus = String(latest.values[2] || '').toLowerCase();
    if (requestStatus === 'pending') {
      return { ok: true, status: 'pending', email: normalized };
    }
    if (requestStatus === 'denied') {
      return { ok: true, status: 'denied', email: normalized };
    }
  }
  return { ok: true, status: 'none', email: normalized };
}

function handleAccessRequest(data) {
  var email = normalizeAccessEmail(data.email);
  if (!isValidAccessEmail(email)) {
    return { ok: false, error: 'Invalid email address.' };
  }
  var existing = readApprovedAccess(email);
  if (existing && existing.status === 'approved') {
    var codeResult = ensureAccessCode(email, { forceNew: false });
    return {
      ok: true,
      status: 'verify_code',
      email: email,
      codeSent: !!(codeResult.sent && !codeResult.reused),
    };
  }
  if (isAutoApproveEmail(email)) {
    upsertApprovedUser(email, 'trimble_auto', 'auto');
    logAccessEvent('access_granted', email, 'trimble_auto', data);
    var trimbleCode = ensureAccessCode(email, { forceNew: true });
    return {
      ok: true,
      status: 'verify_code',
      email: email,
      codeSent: !!trimbleCode.sent,
    };
  }
  var pending = createPendingAccessRequest(data);
  if (!pending.duplicate) {
    sendAccessAdminEmail(email, pending.token);
    logAccessEvent('access_requested', email, 'pending', data);
  } else {
    logAccessEvent('access_requested', email, 'pending_duplicate', data);
  }
  return { ok: true, status: 'pending', email: email, duplicate: !!pending.duplicate };
}

function handleAccessApprove(params) {
  var email = normalizeAccessEmail(params.email);
  var token = String(params.token || '');
  if (!isValidAccessEmail(email) || !token) {
    return htmlAccessPage('Access approval failed', 'Missing email or token.', false);
  }
  if (!resolveAccessRequest(email, 'approved', CONFIG.RECIPIENT_EMAIL, token)) {
    return htmlAccessPage('Access approval failed', 'This request is invalid or already resolved.', false);
  }
  var granted = upsertApprovedUser(email, 'manual', CONFIG.RECIPIENT_EMAIL);
  logAccessEvent('access_granted', email, 'manual', { tool: 'hub', page: getAppUrl() });
  var codeResult = ensureAccessCode(email, { forceNew: true, skipEmail: true });
  try {
    sendAccessApprovedUserEmail(email, granted.expiresAt, codeResult.code);
  } catch (err) {}
  return htmlAccessPage(
    'Access granted',
    'Approved <strong>' +
      email +
      '</strong> for <strong>' +
      getAccessGrantDays() +
      ' days</strong>. The user has been emailed their sign-in code and a link to open the app.',
    true
  );
}

function handleAccessDeny(params) {
  var email = normalizeAccessEmail(params.email);
  var token = String(params.token || '');
  if (!isValidAccessEmail(email) || !token) {
    return htmlAccessPage('Access denial failed', 'Missing email or token.', false);
  }
  if (!resolveAccessRequest(email, 'denied', CONFIG.RECIPIENT_EMAIL, token)) {
    return htmlAccessPage('Access denial failed', 'This request is invalid or already resolved.', false);
  }
  logAccessEvent('access_denied', email, 'manual', { tool: 'hub', page: getAppUrl() });
  try {
    sendAccessDeniedUserEmail(email);
  } catch (err) {}
  return htmlAccessPage('Access denied', 'Denied access for <strong>' + email + '</strong>.', true);
}

function getBetaToolLabel(toolId) {
  var labels = {
    'gw-csv-formatter': 'Groundworks CSV Formatter (BETA)',
  };
  return labels[String(toolId || '')] || String(toolId || 'BETA tool');
}

function getBetaToolPage(toolId) {
  var base = getAppUrl();
  if (toolId === 'gw-csv-formatter') {
    return base + 'groundworks/csv-formatter/index.html';
  }
  return base;
}

function findBetaApprovedUserRow(sheet, toolId, email) {
  var normalized = normalizeAccessEmail(email);
  var tid = String(toolId || '');
  var values = sheet.getDataRange().getValues();
  var i;
  for (i = 1; i < values.length; i++) {
    if (String(values[i][0] || '') === tid && normalizeAccessEmail(values[i][1]) === normalized) {
      return { row: i + 1, values: values[i] };
    }
  }
  return null;
}

function findLatestBetaRequestRow(sheet, toolId, email) {
  var normalized = normalizeAccessEmail(email);
  var tid = String(toolId || '');
  var values = sheet.getDataRange().getValues();
  var i;
  var latest = null;
  for (i = 1; i < values.length; i++) {
    if (String(values[i][1] || '') === tid && normalizeAccessEmail(values[i][2]) === normalized) {
      latest = { row: i + 1, values: values[i] };
    }
  }
  return latest;
}

function upsertBetaApprovedUser(toolId, email, grantType, approvedBy) {
  var ss = getSpreadsheet();
  var sheet = ensureSheet(ss, 'BetaApprovedUsers', SHEET_HEADERS.BetaApprovedUsers);
  var now = Date.now();
  var expiresAt = now + getAccessGrantMs();
  var existing = findBetaApprovedUserRow(sheet, toolId, email);
  var rowValues = [
    String(toolId || ''),
    normalizeAccessEmail(email),
    accessIsoDate(now),
    accessIsoDate(expiresAt),
    grantType || 'manual',
    approvedBy || '',
    accessIsoDate(now),
  ];
  if (existing) {
    sheet.getRange(existing.row, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
  return {
    toolId: String(toolId || ''),
    email: normalizeAccessEmail(email),
    status: 'approved',
    grantType: grantType || 'manual',
    expiresAt: accessIsoDate(expiresAt),
  };
}

function readBetaApprovedAccess(toolId, email) {
  var ss = getSpreadsheet();
  var sheet = ensureSheet(ss, 'BetaApprovedUsers', SHEET_HEADERS.BetaApprovedUsers);
  var existing = findBetaApprovedUserRow(sheet, toolId, email);
  if (!existing) return null;
  var expiresAt = new Date(existing.values[3]).getTime();
  if (!expiresAt || isNaN(expiresAt)) return null;
  if (Date.now() > expiresAt) {
    return {
      toolId: String(toolId || ''),
      email: normalizeAccessEmail(email),
      status: 'expired',
      expiresAt: accessIsoDate(expiresAt),
      grantType: existing.values[4] || '',
    };
  }
  sheet.getRange(existing.row, 7).setValue(accessIsoDate(Date.now()));
  return {
    toolId: String(toolId || ''),
    email: normalizeAccessEmail(email),
    status: 'approved',
    expiresAt: accessIsoDate(expiresAt),
    grantType: existing.values[4] || '',
  };
}

function createPendingBetaRequest(data) {
  var ss = getSpreadsheet();
  var sheet = ensureSheet(ss, 'BetaAccessRequests', SHEET_HEADERS.BetaAccessRequests);
  var toolId = String(data.toolId || '');
  var email = normalizeAccessEmail(data.email);
  var latest = findLatestBetaRequestRow(sheet, toolId, email);
  if (latest && String(latest.values[3] || '').toLowerCase() === 'pending') {
    return {
      toolId: toolId,
      email: email,
      status: 'pending',
      token: latest.values[4] || '',
      duplicate: true,
    };
  }
  var token = Utilities.getUuid();
  var nowIso = accessIsoDate(Date.now());
  sheet.appendRow([nowIso, toolId, email, 'pending', token, nowIso, '', '', data.page || '']);
  return {
    toolId: toolId,
    email: email,
    status: 'pending',
    token: token,
    duplicate: false,
  };
}

function resolveBetaRequest(toolId, email, status, resolvedBy, token) {
  var ss = getSpreadsheet();
  var sheet = ensureSheet(ss, 'BetaAccessRequests', SHEET_HEADERS.BetaAccessRequests);
  var latest = findLatestBetaRequestRow(sheet, toolId, email);
  if (!latest) return false;
  if (token && String(latest.values[4]) !== String(token)) return false;
  if (String(latest.values[3] || '').toLowerCase() !== 'pending') return false;
  sheet.getRange(latest.row, 4).setValue(status);
  sheet.getRange(latest.row, 7).setValue(accessIsoDate(Date.now()));
  sheet.getRange(latest.row, 8).setValue(resolvedBy || '');
  return true;
}

function sendBetaAdminEmail(toolId, email, token) {
  var recipient = CONFIG.RECIPIENT_EMAIL;
  var webAppUrl = getWebAppUrl();
  var label = getBetaToolLabel(toolId);
  var approveUrl =
    webAppUrl +
    '?action=beta_access_approve&toolId=' +
    encodeURIComponent(toolId) +
    '&email=' +
    encodeURIComponent(email) +
    '&token=' +
    encodeURIComponent(token);
  var denyUrl =
    webAppUrl +
    '?action=beta_access_deny&toolId=' +
    encodeURIComponent(toolId) +
    '&email=' +
    encodeURIComponent(email) +
    '&token=' +
    encodeURIComponent(token);
  var subject = '[Tech Assistant] BETA access — ' + label + ' — ' + email;
  var plain =
    email +
    ' is requesting BETA access to ' +
    label +
    '.\n\nGrant: ' +
    approveUrl +
    '\nDeny: ' +
    denyUrl;
  var html =
    '<p><strong>' +
    email +
    '</strong> is requesting <strong>BETA</strong> access to <strong>' +
    label +
    '</strong>.</p>' +
    '<p style="margin:24px 0;">' +
    '<a href="' +
    approveUrl +
    '" style="display:inline-block;padding:12px 20px;margin-right:12px;background:#005f9e;color:#fff;text-decoration:none;border-radius:6px;font-weight:700;">Grant BETA access</a>' +
    '<a href="' +
    denyUrl +
    '" style="display:inline-block;padding:12px 20px;background:#fff;color:#b42318;text-decoration:none;border-radius:6px;border:1px solid #d0d5dd;font-weight:700;">Deny</a>' +
    '</p>';
  MailApp.sendEmail({
    to: recipient,
    subject: subject,
    body: plain,
    htmlBody: html,
    replyTo: email,
  });
}

function sendBetaApprovedUserEmail(toolId, email, expiresAt) {
  var label = getBetaToolLabel(toolId);
  var toolUrl = getBetaToolPage(toolId);
  var subject = 'Technician Assistant — BETA access approved';
  var plain =
    'Your BETA access to ' +
    label +
    ' has been approved.\n\nOpen the tool: ' +
    toolUrl +
    '\n\nAccess expires: ' +
    expiresAt;
  var html =
    '<p>Your <strong>BETA</strong> access to <strong>' +
    label +
    '</strong> has been approved.</p>' +
    '<p style="margin:24px 0;"><a href="' +
    toolUrl +
    '" style="display:inline-block;padding:12px 20px;background:#005f9e;color:#fff;text-decoration:none;border-radius:6px;font-weight:700;">Open BETA tool</a></p>' +
    '<p style="color:#666;font-size:13px;">Access expires: ' +
    expiresAt +
    '</p>';
  MailApp.sendEmail({
    to: email,
    subject: subject,
    body: plain,
    htmlBody: html,
    name: 'Technician Assistant',
  });
}

function sendBetaDeniedUserEmail(toolId, email) {
  var label = getBetaToolLabel(toolId);
  var subject = 'Technician Assistant — BETA access update';
  var body =
    'Your request for BETA access to ' +
    label +
    ' was not approved at this time.\n\nContact the app administrator if you believe this is an error.';
  MailApp.sendEmail(email, subject, body);
}

function buildBetaAccessCheckResult(toolId, email, options) {
  options = options || {};
  var revalidate = options.revalidate === true || String(options.revalidate || '') === '1';
  var normalized = normalizeAccessEmail(email);
  var tid = String(toolId || '');
  if (!tid || !isValidAccessEmail(normalized)) {
    return { ok: false, status: 'invalid', email: normalized, toolId: tid };
  }
  var approved = readBetaApprovedAccess(tid, normalized);
  if (approved && approved.status === 'approved') {
    return {
      ok: true,
      status: 'approved',
      email: normalized,
      toolId: tid,
      expiresAt: approved.expiresAt,
      grantType: approved.grantType,
    };
  }
  if (approved && approved.status === 'expired') {
    return { ok: true, status: 'expired', email: normalized, toolId: tid, expiresAt: approved.expiresAt };
  }
  var ss = getSpreadsheet();
  var sheet = ensureSheet(ss, 'BetaAccessRequests', SHEET_HEADERS.BetaAccessRequests);
  var latest = findLatestBetaRequestRow(sheet, tid, normalized);
  if (latest) {
    var requestStatus = String(latest.values[3] || '').toLowerCase();
    if (requestStatus === 'pending') {
      return { ok: true, status: 'pending', email: normalized, toolId: tid };
    }
    if (requestStatus === 'denied') {
      return { ok: true, status: 'denied', email: normalized, toolId: tid };
    }
  }
  return { ok: true, status: 'none', email: normalized, toolId: tid };
}

function handleBetaAccessRequest(data) {
  var toolId = String(data.toolId || '');
  var email = normalizeAccessEmail(data.email);
  if (!toolId) {
    return { ok: false, error: 'Missing tool id.' };
  }
  if (!isValidAccessEmail(email)) {
    return { ok: false, error: 'Invalid email address.' };
  }
  var appAccess = readApprovedAccess(email);
  if (!appAccess || appAccess.status !== 'approved') {
    return { ok: false, error: 'App access is required before requesting BETA access.' };
  }
  var existing = readBetaApprovedAccess(toolId, email);
  if (existing && existing.status === 'approved') {
    return {
      ok: true,
      status: 'approved',
      email: email,
      toolId: toolId,
      expiresAt: existing.expiresAt,
      grantType: existing.grantType,
    };
  }
  if (isAutoApproveEmail(email)) {
    var granted = upsertBetaApprovedUser(toolId, email, 'trimble_auto', 'auto');
    logAccessEvent('beta_access_granted', email, 'trimble_auto', data);
    return {
      ok: true,
      status: 'approved',
      email: email,
      toolId: toolId,
      expiresAt: granted.expiresAt,
      grantType: 'trimble_auto',
    };
  }
  var pending = createPendingBetaRequest(data);
  if (!pending.duplicate) {
    sendBetaAdminEmail(toolId, email, pending.token);
    logAccessEvent('beta_access_requested', email, 'pending', data);
  } else {
    logAccessEvent('beta_access_requested', email, 'pending_duplicate', data);
  }
  return { ok: true, status: 'pending', email: email, toolId: toolId, duplicate: !!pending.duplicate };
}

function handleBetaAccessApprove(params) {
  var toolId = String(params.toolId || '');
  var email = normalizeAccessEmail(params.email);
  var token = String(params.token || '');
  if (!toolId || !isValidAccessEmail(email) || !token) {
    return htmlAccessPage('BETA approval failed', 'Missing tool, email, or token.', false);
  }
  if (!resolveBetaRequest(toolId, email, 'approved', CONFIG.RECIPIENT_EMAIL, token)) {
    return htmlAccessPage('BETA approval failed', 'This request is invalid or already resolved.', false);
  }
  var granted = upsertBetaApprovedUser(toolId, email, 'manual', CONFIG.RECIPIENT_EMAIL);
  logAccessEvent('beta_access_granted', email, 'manual', { tool: toolId, page: getBetaToolPage(toolId) });
  try {
    sendBetaApprovedUserEmail(toolId, email, granted.expiresAt);
  } catch (err) {}
  return htmlAccessPage(
    'BETA access granted',
    'Approved <strong>' +
      email +
      '</strong> for <strong>' +
      getBetaToolLabel(toolId) +
      '</strong>. The user has been emailed a link to open the tool.',
    true
  );
}

function handleBetaAccessDeny(params) {
  var toolId = String(params.toolId || '');
  var email = normalizeAccessEmail(params.email);
  var token = String(params.token || '');
  if (!toolId || !isValidAccessEmail(email) || !token) {
    return htmlAccessPage('BETA denial failed', 'Missing tool, email, or token.', false);
  }
  if (!resolveBetaRequest(toolId, email, 'denied', CONFIG.RECIPIENT_EMAIL, token)) {
    return htmlAccessPage('BETA denial failed', 'This request is invalid or already resolved.', false);
  }
  logAccessEvent('beta_access_denied', email, 'manual', { tool: toolId, page: getBetaToolPage(toolId) });
  try {
    sendBetaDeniedUserEmail(toolId, email);
  } catch (err) {}
  return htmlAccessPage('BETA access denied', 'Denied BETA access for <strong>' + email + '</strong>.', true);
}

function htmlAccessPage(title, message, success) {
  var color = success ? '#005f9e' : '#b42318';
  var html =
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' +
    title +
    '</title></head><body style="font-family:Segoe UI,Arial,sans-serif;padding:32px;color:#252a2e;">' +
    '<h1 style="color:' +
    color +
    ';">' +
    title +
    '</h1><p style="font-size:16px;line-height:1.5;">' +
    message +
    '</p></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle(title);
}

function respondJson(obj, callback) {
  var text = JSON.stringify(obj || {});
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + text + ')').setMimeType(
      ContentService.MimeType.JAVASCRIPT
    );
  }
  return jsonResponse(obj);
}

function doPost(e) {
  try {
    var data = parsePayload(e);
    var action = String(data.action || 'feedback').toLowerCase();

    if (action === 'event') {
      appendEvent(data);
      return jsonResponse({ ok: true });
    }

    if (action === 'feedback') {
      sendFeedbackEmail(data);
      appendFeedback(data);
      return jsonResponse({ ok: true });
    }

    if (action === 'upload') {
      var saved = saveReportToDrive(data);
      appendUpload(data, saved.id, saved.url);
      return jsonResponse({ ok: true, fileId: saved.id, fileUrl: saved.url });
    }

    if (action === 'access_request') {
      return jsonResponse(handleAccessRequest(data));
    }

    return jsonResponse({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  var params = e && e.parameter ? e.parameter : {};
  var action = String(params.action || '').toLowerCase();
  var callback = params.callback || '';

  try {
    if (action === 'access_check') {
      return respondJson(buildAccessCheckResult(params.email, { revalidate: params.revalidate }), callback);
    }

    if (action === 'access_start') {
      return respondJson(handleAccessRequest(params), callback);
    }

    if (action === 'access_verify') {
      return respondJson(handleAccessVerify(params), callback);
    }

    if (action === 'access_resend_code') {
      return respondJson(handleAccessResendCode(params), callback);
    }

    if (action === 'access_approve') {
      return handleAccessApprove(params);
    }

    if (action === 'access_deny') {
      return handleAccessDeny(params);
    }

    if (action === 'access_revoke') {
      return handleAccessRevoke(params);
    }

    if (action === 'beta_access_check') {
      return respondJson(
        buildBetaAccessCheckResult(params.toolId, params.email, { revalidate: params.revalidate }),
        callback
      );
    }

    if (action === 'beta_access_start') {
      return respondJson(handleBetaAccessRequest(params), callback);
    }

    if (action === 'beta_access_approve') {
      return handleBetaAccessApprove(params);
    }

    if (action === 'beta_access_deny') {
      return handleBetaAccessDeny(params);
    }

    if (callback) {
      return respondJson({ ok: false, error: 'Unknown action' }, callback);
    }

    return ContentService.createTextOutput(
      'Trimble Technician Assistant workspace API — POST for writes, GET ?action=access_check for access status.'
    ).setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    if (callback) {
      return respondJson({ ok: false, error: String(err) }, callback);
    }
    return ContentService.createTextOutput('Error: ' + String(err)).setMimeType(
      ContentService.MimeType.TEXT
    );
  }
}

/** Header-only setup — run this if setupSheets fails with an unknown error. */
function setupSheetsMinimal() {
  Logger.log('setupSheetsMinimal: start');
  var ss = getSpreadsheet();
  var name;
  for (name in SHEET_HEADERS) {
    if (!Object.prototype.hasOwnProperty.call(SHEET_HEADERS, name)) continue;
    var headers = SHEET_HEADERS[name];
    var sheet = ensureSheet(ss, name, headers);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    formatSheetHeaderOnly(sheet, headers.length);
    SpreadsheetApp.flush();
    Logger.log('setupSheetsMinimal: OK — ' + name);
  }
  Logger.log('setupSheetsMinimal: done — tabs and headers refreshed');
}

/** Run once (or again) from the editor — creates tabs, headers, formatting, README. */
function setupSheets() {
  Logger.log('setupSheets: start');
  var ss;
  try {
    ss = getSpreadsheet();
    Logger.log('setupSheets: opened spreadsheet');
  } catch (openErr) {
    throw new Error('Could not open spreadsheet — check CONFIG.SPREADSHEET_ID: ' + openErr);
  }

  var name;
  var headers;

  for (name in SHEET_HEADERS) {
    if (!Object.prototype.hasOwnProperty.call(SHEET_HEADERS, name)) continue;
    try {
      headers = SHEET_HEADERS[name];
      var sheet = ensureSheet(ss, name, headers);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      formatSheetHeaderOnly(sheet, headers.length);
      SpreadsheetApp.flush();
      Logger.log('setupSheets: OK — ' + name);
    } catch (err) {
      throw new Error('setupSheets failed on tab "' + name + '": ' + err);
    }
  }

  try {
    setupReadmeSheet(ss);
    Logger.log('setupSheets: OK — README');
  } catch (err) {
    throw new Error('setupSheets failed on README: ' + err);
  }

  try {
    removeDefaultSheet(ss);
  } catch (err) {
    Logger.log('setupSheets: skipped removeDefaultSheet — ' + err);
  }

  try {
    reorderSheets(ss, [
      'README',
      'Events',
      'Feedback',
      'Uploads',
      'AccessRequests',
      'ApprovedUsers',
      'AccessCodes',
      'BetaAccessRequests',
      'BetaApprovedUsers',
    ]);
    Logger.log('setupSheets: OK — tab order');
  } catch (err) {
    Logger.log('setupSheets: tab reorder skipped — ' + err);
  }

  try {
    refreshApprovedUserRevokeLinks();
    Logger.log('setupSheets: OK — revoke links');
  } catch (err) {
    Logger.log('setupSheets: revoke links skipped — ' + err);
  }

  Logger.log(
    'Sheets ready: README, Events, Feedback, Uploads, AccessRequests, ApprovedUsers, AccessCodes, BetaAccessRequests, BetaApprovedUsers'
  );
}
