/**
 * PD25 Groundworks measure-up PDF — matches CTL / pre-inspection report layout.
 */
var PD25Pdf = (function () {
  var PDF_RESULT_ROW_ORDER = ['G6', 'G5', 'G2', 'G1', 'G7', 'B5', 'T1', 'T5'];

  function trimblePdfLogoSrc() {
    return typeof TRIMBLE_PDF_LOGO_SRC !== 'undefined'
      ? TRIMBLE_PDF_LOGO_SRC
      : '../../assets/brand/trimble-logo-blue.png';
  }

  var TRIMBLE_LOGO_URL = trimblePdfLogoSrc();

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function row(label, value) {
    return (
      "<tr><td class='lbl'>" + escapeHtml(label) + '</td><td>' + (escapeHtml(value) || '—') + '</td></tr>'
    );
  }

  function buildPdfHeaderHtml(data) {
    var dealerSlot = data.dealerLogo
      ? '<img class="dealer-logo" src="' + data.dealerLogo.dataUrl + '" alt="Dealer logo" />'
      : '<div class="dealer-logo-slot" aria-hidden="true"></div>';

    var subtitle = data.reportName && data.reportName.trim()
      ? escapeHtml(data.reportName.trim())
      : 'Vermeer PD25R Groundworks measure-up';

    return (
      '<div class="rpt-hdr">' +
      '<div class="rpt-hdr__brands">' +
      '<img class="trimble-logo" src="' +
      TRIMBLE_LOGO_URL +
      '" alt="Trimble" />' +
      '<div class="dealer-logo-wrap">' +
      dealerSlot +
      '</div></div>' +
      '<h1>PD25 Groundworks Measure-Up Report</h1>' +
      '<p>' +
      subtitle +
      ' · Generated ' +
      escapeHtml(data.generatedAt) +
      '</p></div>'
    );
  }

  function formatResultValue(key, entry, unitLabel) {
    if (!entry || entry.value == null) return '—';
    return Number(entry.value).toFixed(3) + ' ' + unitLabel;
  }

  function buildMeasurementsTableHtml(groundworks, unitLabel) {
    var html = '<table>';
    var i;
    var key;
    for (i = 0; i < PDF_RESULT_ROW_ORDER.length; i++) {
      key = PDF_RESULT_ROW_ORDER[i];
      if (!groundworks || !groundworks[key]) continue;
      var label = key + ' — ' + groundworks[key].label;
      html += row(label, formatResultValue(key, groundworks[key], unitLabel));
    }
    html += '</table>';
    return html;
  }

  function buildHtml(data) {
    var meta = data.meta || {};
    var notes = data.notes || [];

    var notesHtml = '';
    if (notes.length) {
      notesHtml =
        '<h2>Notes</h2><table>' +
        notes
          .map(function (n) {
            return row(n.label, n.value);
          })
          .join('') +
        '</table>';
    }

    return (
      "<!DOCTYPE html><html><head><meta charset='utf-8'><title>" +
      escapeHtml(data.reportTitle || 'PD25 Measure-Up Report') +
      "</title>" +
      "<link href='https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap' rel='stylesheet'>" +
      "<style>" +
      "body{font-family:'Open Sans',sans-serif;color:#252a2e;margin:0;padding:0;}" +
      ".rpt-hdr{background:#fff;padding:20px 24px 16px;border-bottom:3px solid #005f9e;}" +
      ".rpt-hdr__brands{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:14px;}" +
      ".trimble-logo{height:32px;width:auto;display:block;background:#fff;}" +
      ".dealer-logo-wrap{flex:0 0 180px;min-height:52px;display:flex;align-items:center;justify-content:flex-end;}" +
      ".dealer-logo{max-width:180px;max-height:52px;object-fit:contain;}" +
      ".dealer-logo-slot{width:180px;height:52px;}" +
      ".rpt-hdr h1{margin:0;font-size:20px;color:#005f9e;font-weight:700;}" +
      ".rpt-hdr p{margin:6px 0 0;font-size:13px;color:#6a6e79;}" +
      ".body{padding:24px;}" +
      "h2{font-size:14px;color:#005f9e;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #e0e1e9;padding-bottom:6px;margin:24px 0 12px;}" +
      "table{width:100%;border-collapse:collapse;margin-bottom:8px;}" +
      "td{padding:8px 10px;border:1px solid #e0e1e9;font-size:13px;vertical-align:top;}" +
      "td.lbl{width:38%;background:#f7f8fa;font-weight:700;color:#6a6e79;}" +
      ".footer{margin-top:32px;padding-top:12px;border-top:1px solid #e0e1e9;font-size:11px;color:#6a6e79;}" +
      "@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}" +
      "</style></head><body>" +
      buildPdfHeaderHtml(data) +
      '<div class="body">' +
      '<h2>Job details</h2>' +
      '<table>' +
      row('Dealer', data.dealerName) +
      row('Technician', data.techName) +
      row('Machine model', meta.machineModel) +
      row('Serial number', meta.serialNumber) +
      row('Survey file', meta.surveyFile) +
      row('Survey coordinate units', meta.surveyCoordinateUnits) +
      '</table>' +
      '<h2>Groundworks measure-up results</h2>' +
      buildMeasurementsTableHtml(data.groundworks, data.unitLabel) +
      notesHtml +
      '<div class="footer">Trimble Technician Assistant — PD25 Groundworks Measure-Up Report. COGO calculator for Vermeer PD25R pile driver guidance.</div>' +
      '</div></body></html>'
    );
  }

  function exportPdf(data) {
    var popup = window.open('', '_blank');
    if (!popup) {
      throw new Error('Popup blocked. Allow popups to generate the PDF, then use Print → Save as PDF.');
    }
    popup.document.open();
    popup.document.write(buildHtml(data));
    popup.document.close();
    popup.focus();
    setTimeout(function () {
      popup.print();
    }, 500);
  }

  return {
    buildHtml: buildHtml,
    exportPdf: exportPdf,
    TRIMBLE_LOGO_URL: TRIMBLE_LOGO_URL,
  };
})();
