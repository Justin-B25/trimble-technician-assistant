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
  function fmtM(n) { return TipDevCalc.fmt(n, 3); }
  function fmtMm(n) { return TipDevCalc.fmtMm(n, 1); }

  function activityTable(title, rows) {
    var html = '<h3>' + esc(title) + '</h3><table class="data"><thead><tr>' +
      '<th>Tilt</th><th>Point</th><th>Tgt Ht m</th><th>Tilt°</th><th>Pitch</th><th>Roll</th>' +
      '<th>ΔN mm</th><th>ΔE mm</th><th>ΔZ mm</th><th>Horiz mm</th><th>Spec XY|Z mm</th>' +
      '</tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr><td>' + esc(r.tiltLabel) + '</td><td>' + esc(r.pointName) + '</td>' +
        '<td>' + (r.targetHeight != null ? fmtM(Math.abs(r.targetHeight)) : '—') + '</td>' +
        '<td>' + (r.tiltAngleDeg != null ? r.tiltAngleDeg.toFixed(2) : '—') + '</td>' +
        '<td>' + (r.pitchDeg != null ? r.pitchDeg.toFixed(2) : '—') + '</td>' +
        '<td>' + (r.rollDeg != null ? r.rollDeg.toFixed(2) : '—') + '</td>' +
        '<td>' + fmtMm(r.d && r.d.dn) + '</td><td>' + fmtMm(r.d && r.d.de) + '</td>' +
        '<td>' + fmtMm(r.d && r.d.dz) + '</td><td>' + fmtMm(r.d && r.d.horiz) + '</td>' +
        '<td>' + (r.check ? r.check.specXY + ' | ' + r.check.specZ : '—') + '</td></tr>';
    });
    return html + '</tbody></table>';
  }

  function compareTable(rows) {
    var html = '<h3>Tip UP vs Tip DOWN (same tilt)</h3><table class="data"><thead><tr>' +
      '<th>Tilt</th><th>Tip DOWN</th><th>Tip UP</th><th>ΔN mm</th><th>ΔE mm</th><th>ΔZ mm</th><th>Horiz mm</th>' +
      '</tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr><td>' + esc(r.tiltLabel) + '</td><td>' + esc(r.tipDownName) + '</td><td>' + esc(r.tipUpName) + '</td>' +
        '<td>' + fmtMm(r.d && r.d.dn) + '</td><td>' + fmtMm(r.d && r.d.de) + '</td>' +
        '<td>' + fmtMm(r.d && r.d.dz) + '</td><td>' + fmtMm(r.d && r.d.horiz) + '</td></tr>';
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
      '<p class="sub">' +
      (report.rodA
        ? 'A (UP*) ' + esc(TipDevCalc.fmt(report.rodA.rodHeightM, 3)) + ' m → ' + esc(report.rodA.specRow.label)
        : '') +
      (report.rodB
        ? ' · B (DOWN*) ' + esc(TipDevCalc.fmt(report.rodB.rodHeightM, 3)) + ' m → ' + esc(report.rodB.specRow.label)
        : '') +
      (b
        ? (' · Origin ' +
          esc(b.name) +
          (b.forA ? ' · A→' + esc(b.forA.name) : '') +
          (b.forB ? ' · B→' + esc(b.forB.name) : ''))
        : ' · No UP0/DOWN0') +
      '</p>' +
      debriefBlock(report.debrief) +
      activityTable(
        'Tip DOWN (Activity A) vs ' +
          ((b && b.forA && b.forA.name) || 'UP0') +
          (report.rodA ? ' · ' + report.rodA.specRow.label : ''),
        report.tipDown
      ) +
      activityTable(
        'Tip UP (Activity B) vs ' +
          ((b && b.forB && b.forB.name) || 'DOWN0') +
          (report.rodB ? ' · ' + report.rodB.specRow.label : ''),
        report.tipUp
      ) +
      compareTable(report.compare) +
      '<p class="sub">CSV US FT → meters. Δ = measured − 0° origin (UP0 / DOWN0), shown in mm next to ST30 tip specs. Tip UP vs Tip DOWN = tip-up − tip-down.</p>' +
      '<p class="noprint"><button onclick="window.print()">Print / Save PDF</button></p>' +
      '<script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script></body></html>';
    w.document.open(); w.document.write(html); w.document.close();
  }
  return { open: open };
})();
