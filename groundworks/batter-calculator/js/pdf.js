/**
 * Batter calculator PDF / print report — Technician Assistant style (logo top-left).
 */
var BatterPdf = (function () {
  function logoUrl() {
    if (typeof TRIMBLE_PDF_LOGO_SRC !== 'undefined' && TRIMBLE_PDF_LOGO_SRC) {
      return TRIMBLE_PDF_LOGO_SRC;
    }
    try {
      return new URL('../../assets/brand/trimble-logo-blue.png', window.location.href).href;
    } catch (e) {
      return '../../assets/brand/trimble-logo-blue.png';
    }
  }

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmt(n, d) {
    return BatterCalc.fmt(n, d == null ? 3 : d);
  }

  function buildTable(report) {
    var html =
      '<table class="data"><thead><tr>' +
      '<th>Pile ID</th>' +
      '<th>Bot N</th><th>Bot E</th><th>Bot Z</th>' +
      '<th>Top N</th><th>Top E</th><th>Top Z</th>' +
      '<th>ΔN</th><th>ΔE</th><th>ΔXY</th><th>ΔZ</th>' +
      '<th>Batter</th><th>Angle°</th><th>Lean</th>' +
      '</tr></thead><tbody>';
    report.rows.forEach(function (r) {
      html +=
        '<tr>' +
        '<td><strong>' +
        escapeHtml(r.pileId) +
        '</strong></td>' +
        '<td>' +
        fmt(r.bottom && r.bottom.n) +
        '</td><td>' +
        fmt(r.bottom && r.bottom.e) +
        '</td><td>' +
        fmt(r.bottom && r.bottom.z) +
        '</td>' +
        '<td>' +
        fmt(r.top && r.top.n) +
        '</td><td>' +
        fmt(r.top && r.top.e) +
        '</td><td>' +
        fmt(r.top && r.top.z) +
        '</td>' +
        '<td>' +
        fmt(r.dn) +
        '</td><td>' +
        fmt(r.de) +
        '</td><td>' +
        fmt(r.dxy) +
        '</td><td>' +
        fmt(r.dz) +
        '</td>' +
        '<td>' +
        escapeHtml(BatterCalc.fmtBatter(r.batter)) +
        '</td><td>' +
        fmt(r.angleDeg, 2) +
        '</td><td>' +
        escapeHtml(r.favor || '—') +
        '</td>' +
        '</tr>';
      if (r.warnings && r.warnings.length) {
        html +=
          '<tr class="warn"><td colspan="14">' +
          escapeHtml(r.warnings.join(' · ')) +
          '</td></tr>';
      }
    });
    html += '</tbody></table>';
    return html;
  }

  function open(report, meta) {
    meta = meta || {};
    var w = window.open('', '_blank');
    if (!w) {
      alert('Allow pop-ups to export the PDF report.');
      return;
    }
    var avg = report.avg || {};
    var html =
      '<!DOCTYPE html><html><head><meta charset="UTF-8"/>' +
      '<title>Battered Pile Report</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap" rel="stylesheet"/>' +
      '<style>' +
      'body{font-family:"Open Sans",Arial,sans-serif;color:#1a1a1a;margin:28px;}' +
      '.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #00548C;padding-bottom:12px;margin-bottom:18px;}' +
      '.hdr img{height:36px;}' +
      '.hdr h1{margin:0;font-size:18px;color:#00548C;}' +
      '.hdr .sub{margin:4px 0 0;font-size:12px;color:#555;}' +
      '.meta{font-size:12px;margin-bottom:14px;}' +
      '.stats{display:flex;flex-wrap:wrap;gap:10px;margin:12px 0 18px;}' +
      '.stat{border:1px solid #c8c8c8;border-radius:6px;padding:10px 12px;min-width:110px;}' +
      '.stat .label{font-size:10px;text-transform:uppercase;color:#00548C;letter-spacing:.04em;}' +
      '.stat .value{font-size:16px;font-weight:700;margin-top:4px;}' +
      'table.data{width:100%;border-collapse:collapse;font-size:10px;}' +
      'table.data th{background:#00548C;color:#fff;padding:6px 5px;text-align:left;}' +
      'table.data td{border:1px solid #ddd;padding:5px;}' +
      'table.data tr.warn td{background:#fff8e6;color:#7a5b00;font-size:9px;}' +
      '.note{font-size:11px;color:#555;margin-top:14px;}' +
      '@media print{body{margin:12px;} .noprint{display:none;}}' +
      '</style></head><body>' +
      '<div class="hdr">' +
      '<div><img src="' +
      escapeHtml(logoUrl()) +
      '" alt="Trimble"/><p class="sub">Technician Assistant · Groundworks</p></div>' +
      '<div style="text-align:right"><h1>Battered Pile / Batter Report</h1>' +
      '<p class="sub">' +
      escapeHtml(meta.job || 'Field report') +
      ' · ' +
      escapeHtml(meta.date || new Date().toLocaleString()) +
      '</p></div></div>' +
      '<div class="meta">Naming: {PileID}B1–B3 (bottom) · {PileID}T1–T3 (top) &nbsp;|&nbsp; Centers = average of 3 rim shots &nbsp;|&nbsp; Batter = ΔXY ÷ |ΔZ|</div>' +
      (meta.notes
        ? '<p class="meta"><strong>Notes:</strong> ' + escapeHtml(meta.notes) + '</p>'
        : '') +
      '<div class="stats">' +
      '<div class="stat"><div class="label">Piles OK</div><div class="value">' +
      report.okCount +
      ' / ' +
      report.pileCount +
      '</div></div>' +
      '<div class="stat"><div class="label">Avg ΔN</div><div class="value">' +
      fmt(avg.dn) +
      '</div></div>' +
      '<div class="stat"><div class="label">Avg ΔE</div><div class="value">' +
      fmt(avg.de) +
      '</div></div>' +
      '<div class="stat"><div class="label">Avg ΔXY</div><div class="value">' +
      fmt(avg.dxy) +
      '</div></div>' +
      '<div class="stat"><div class="label">Avg ΔZ</div><div class="value">' +
      fmt(avg.dz) +
      '</div></div>' +
      '<div class="stat"><div class="label">Avg Batter</div><div class="value" style="font-size:13px">' +
      escapeHtml(BatterCalc.fmtBatter(avg.batter)) +
      '</div></div>' +
      '</div>' +
      buildTable(report) +
      '<p class="note">ΔN / ΔE show how the pile top center deviates in plan from the bottom center (positive N = north, positive E = east). Units match the Siteworks CSV.</p>' +
      '<p class="noprint"><button onclick="window.print()">Print / Save PDF</button></p>' +
      '<script>window.onload=function(){setTimeout(function(){window.print()},400)}</script>' +
      '</body></html>';
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  return { open: open };
})();
