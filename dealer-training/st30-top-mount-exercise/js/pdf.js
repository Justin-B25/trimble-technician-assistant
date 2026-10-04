/**
 * ST30 Top Mount Exercise PDF report.
 */
var TipDevPdf = (function () {
  function logoUrl() {
    if (typeof TRIMBLE_PDF_LOGO_SRC !== 'undefined' && TRIMBLE_PDF_LOGO_SRC) return TRIMBLE_PDF_LOGO_SRC;
    try { return new URL('../../assets/brand/trimble-logo-blue.png', window.location.href).href; }
    catch (e) { return '../../assets/brand/trimble-logo-blue.png'; }
  }
  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function fmt(n) { return TipDevCalc.fmt(n, 3); }

  function activityTable(title, rows) {
    var html = '<h3>' + esc(title) + '</h3><table class="data"><thead><tr>' +
      '<th>Tilt</th><th>Point</th><th>Tgt Ht</th><th>Tilt°</th><th>Pitch</th><th>Roll</th><th>ΔN</th><th>ΔE</th><th>ΔZ</th><th>Horiz</th><th>Spec XY|Z mm</th><th>Pass</th>' +
      '</tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr><td>' + esc(r.tiltLabel) + '</td><td>' + esc(r.pointName) + '</td>' +
        '<td>' + (r.targetHeight != null ? fmt(r.targetHeight) : '—') + '</td>' +
        '<td>' + (r.tiltAngleDeg != null ? r.tiltAngleDeg.toFixed(2) : '—') + '</td>' +
        '<td>' + (r.pitchDeg != null ? r.pitchDeg.toFixed(2) : '—') + '</td>' +
        '<td>' + (r.rollDeg != null ? r.rollDeg.toFixed(2) : '—') + '</td>' +
        '<td>' + fmt(r.d && r.d.dn) + '</td><td>' + fmt(r.d && r.d.de) + '</td>' +
        '<td>' + fmt(r.d && r.d.dz) + '</td><td>' + fmt(r.d && r.d.horiz) + '</td>' +
        '<td>' + (r.check ? r.check.specXY + ' | ' + r.check.specZ : '—') + '</td>' +
        '<td>' + (r.check ? (r.check.pass ? 'Y' : 'N') : '—') + '</td></tr>';
    });
    return html + '</tbody></table>';
  }

  function compareTable(rows) {
    var html = '<h3>Tip UP vs Tip DOWN (same tilt)</h3><table class="data"><thead><tr>' +
      '<th>Tilt</th><th>Tip DOWN</th><th>Tip UP</th><th>ΔN</th><th>ΔE</th><th>ΔZ</th><th>Horiz</th>' +
      '</tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr><td>' + esc(r.tiltLabel) + '</td><td>' + esc(r.tipDownName) + '</td><td>' + esc(r.tipUpName) + '</td>' +
        '<td>' + fmt(r.d && r.d.dn) + '</td><td>' + fmt(r.d && r.d.de) + '</td>' +
        '<td>' + fmt(r.d && r.d.dz) + '</td><td>' + fmt(r.d && r.d.horiz) + '</td></tr>';
    });
    return html + '</tbody></table>';
  }

  function debriefBlock(debrief) {
    if (!debrief) return '';
    return '<h3>TIP Accuracy — Debrief (worksheet answers)</h3>' +
      '<table class="data"><thead><tr><th>Question</th><th>Answer</th><th>Fill-in</th></tr></thead><tbody>' +
      '<tr><td>1. Activity A within tip specs at 5° / 15° / 30°?</td><td><strong>' + esc(debrief.q1.answer) + '</strong></td><td>' + esc(debrief.q1.fillIn) + '</td></tr>' +
      '<tr><td>2. Activity B (inverted) within tip specs?</td><td><strong>' + esc(debrief.q2.answer) + '</strong></td><td>' + esc(debrief.q2.fillIn) + '</td></tr>' +
      '<tr><td>3. Largest Δ XY (mm) — which tilt / orientation?</td><td><strong>' +
      esc(debrief.q3.horizMm != null ? debrief.q3.horizMm.toFixed(1) + ' mm' : '—') +
      '</strong></td><td>' + esc(debrief.q3.fillIn) + '</td></tr>' +
      '</tbody></table>';
  }

  function open(report, meta) {
    meta = meta || {};
    var w = window.open('', '_blank');
    if (!w) { alert('Allow pop-ups to export the PDF report.'); return; }
    var b = report.bench;
    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>ST30 Top Mount Exercise</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap" rel="stylesheet"/>' +
      '<style>body{font-family:"Open Sans",Arial,sans-serif;color:#1a1a1a;margin:28px;}' +
      '.hdr{display:flex;justify-content:space-between;border-bottom:3px solid #00548C;padding-bottom:12px;margin-bottom:16px;}' +
      '.hdr img{height:36px;} h1{margin:0;font-size:18px;color:#00548C;} .sub{font-size:12px;color:#555;}' +
      'h3{color:#00548C;font-size:13px;margin:16px 0 6px;} table.data{width:100%;border-collapse:collapse;font-size:10px;}' +
      'th{background:#00548C;color:#fff;padding:5px;} td{border:1px solid #ddd;padding:5px;}' +
      '@media print{.noprint{display:none}}</style></head><body>' +
      '<div class="hdr"><div><img src="' + esc(logoUrl()) + '" alt="Trimble"/><p class="sub">Technician Assistant · Dealer Training</p></div>' +
      '<div style="text-align:right"><h1>ST30 Top Mount Exercise</h1><p class="sub">' +
      esc(meta.job || 'Field report') + ' · ' + esc(meta.date || new Date().toLocaleString()) + '</p></div></div>' +
      '<p class="sub">Rod height: ' + esc(String(report.rodHeightInput || '—')) + ' ' + esc(report.rodUnit || '') +
      ' → specs: ' + esc(report.specRow.label) +
      (b ? (' · BENCH ' + esc(b.name) + ' N' + fmt(b.n) + ' E' + fmt(b.e) + ' Z' + fmt(b.z)) : ' · No BENCH') + '</p>' +
      debriefBlock(report.debrief) +
      activityTable('Tip DOWN (Activity A) vs BENCH', report.tipDown) +
      activityTable('Tip UP (Activity B) vs BENCH', report.tipUp) +
      compareTable(report.compare) +
      '<p class="sub">Δ = measured − reference. Tip UP vs Tip DOWN uses tip-up − tip-down at the same tilt. Specs pending validation.</p>' +
      '<p class="noprint"><button onclick="window.print()">Print / Save PDF</button></p>' +
      '<script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script></body></html>';
    w.document.open(); w.document.write(html); w.document.close();
  }
  return { open: open };
})();
