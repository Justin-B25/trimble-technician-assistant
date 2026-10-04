/**
 * Batter calculator PDF — centers, vector, smart-level inclination.
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

  function pileBlocks(report) {
    var html = '';
    report.rows.forEach(function (r) {
      html += '<div class="pile">';
      html += '<h3>Pile ' + escapeHtml(r.pileId) + (r.ok ? '' : ' — incomplete') + '</h3>';
      if (r.ok) {
        var vs = r.vsDesign || {};
        var cutoff = r.cutoff;
        html +=
          '<table class="data"><tbody>' +
          '<tr><td class="lbl">Cut-off (Y/N, X/E, Z)</td><td><strong>' +
          (cutoff
            ? 'N ' + fmt(cutoff.n) + '   E ' + fmt(cutoff.e) + '   Z ' + fmt(cutoff.z)
            : '—') +
          '</strong></td></tr>' +
          '<tr><td class="lbl">Design cut-off</td><td>' +
          (vs.hasXy
            ? 'N ' +
              fmt(vs.design.n) +
              '   E ' +
              fmt(vs.design.e) +
              (vs.design.z != null ? '   Z ' + fmt(vs.design.z) : '')
            : 'Not entered') +
          '</td></tr>' +
          '<tr><td class="lbl">Batter angle</td><td><strong>' +
          escapeHtml(BatterCalc.fmtInclination(r)) +
          '</strong>' +
          (vs.hasIncl
            ? ' · design ' +
              fmt(vs.design.inclinationFromVerticalDeg, 2) +
              '° · Δ ' +
              fmt(vs.dInclinationDeg, 2) +
              '°'
            : '') +
          '</td></tr>' +
          '<tr><td class="lbl">Azimuth (lean)</td><td><strong>' +
          escapeHtml(BatterCalc.fmtAzimuth(r.azimuthDeg)) +
          '</strong> · ' +
          escapeHtml(r.favor || '') +
          '</td></tr>' +
          '<tr><td class="lbl">Deviation ΔX / ΔY</td><td><strong>' +
          escapeHtml(BatterCalc.fmtDeviation(vs)) +
          '</strong></td></tr>' +
          '<tr><td class="lbl">Bottom / top centers</td><td>' +
          escapeHtml(BatterCalc.fmtCoord(r.bottom)) +
          '  ·  ' +
          escapeHtml(BatterCalc.fmtCoord(r.top)) +
          '</td></tr>' +
          '<tr><td class="lbl">Vector bottom → top</td><td>' +
          escapeHtml(BatterCalc.fmtVector(r)) +
          '</td></tr>' +
          '</tbody></table>';
      } else {
        html +=
          '<p class="note">' +
          escapeHtml((r.warnings || ['Need B1–B3 and T1–T3']).join(' · ')) +
          '</p>';
      }
      html += '</div>';
    });
    return html;
  }

  function open(report, meta) {
    meta = meta || {};
    var w = window.open('', '_blank');
    if (!w) {
      alert('Allow pop-ups to export the PDF report.');
      return;
    }
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
      '.pile{border:1px solid #c8c8c8;border-radius:6px;padding:10px 12px;margin:10px 0;}' +
      'h3{margin:0 0 8px;color:#00548C;font-size:14px;}' +
      'table.data{width:100%;border-collapse:collapse;font-size:11px;}' +
      'table.data td{border:1px solid #ddd;padding:5px;}' +
      'table.data td.lbl{width:34%;background:#E8F1F8;font-weight:600;}' +
      '.note{font-size:11px;color:#555;margin-top:14px;}' +
      '@media print{body{margin:12px;} .noprint{display:none;}}' +
      '</style></head><body>' +
      '<div class="hdr">' +
      '<div><img src="' +
      escapeHtml(logoUrl()) +
      '" alt="Trimble"/><p class="sub">Technician Assistant · Dealer Training</p></div>' +
      '<div style="text-align:right"><h1>Battered Pile — Cut-off vs Design</h1>' +
      '<p class="sub">' +
      escapeHtml(meta.job || 'Field report') +
      ' · ' +
      escapeHtml(meta.date || new Date().toLocaleString()) +
      '</p></div></div>' +
      '<div class="meta">Cut-off XY at design Z (or top ring if Z blank). Deviation = measured − design (ΔN/ΔE). Azimuth from North toward East. Batter angle from vertical.</div>' +
      (meta.notes
        ? '<p class="meta"><strong>Notes:</strong> ' + escapeHtml(meta.notes) + '</p>'
        : '') +
      pileBlocks(report) +
      '<p class="note">Inclination from vertical = atan(|XY|/|ΔZ|). From horizontal (smart level along pile) = 90° − from vertical.</p>' +
      '<p class="noprint"><button onclick="window.print()">Print / Save PDF</button></p>' +
      '<script>window.onload=function(){setTimeout(function(){window.print()},400)}</script>' +
      '</body></html>';
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  return { open: open };
})();
