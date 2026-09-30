/**
 * Pile QC PDF / print report — Technician Assistant–style popup + print.
 */
var PilePdf = (function () {
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

  function fmt(n) {
    return PileQC.fmt(n, 3);
  }

  function row(label, value) {
    return (
      "<tr><td class='lbl'>" +
      escapeHtml(label) +
      '</td><td>' +
      (escapeHtml(value) || '—') +
      '</td></tr>'
    );
  }

  function buildTable(report, maxRows) {
    maxRows = maxRows == null ? 500 : maxRows;
    var rows = report.rows;
    var limit = Math.min(rows.length, maxRows);
    var html =
      '<table class="data"><thead><tr>' +
      '<th>ID</th><th>Des N</th><th>Des E</th><th>Des Z</th>' +
      '<th>Meas N</th><th>Meas E</th><th>Meas Z</th>' +
      '<th>Mach N</th><th>Mach E</th><th>Mach Z</th>' +
      '<th>ΔN m−d</th><th>ΔE m−d</th><th>ΔZ m−d</th><th>Horiz</th>' +
      '</tr></thead><tbody>';
    for (var i = 0; i < limit; i++) {
      var r = rows[i];
      html +=
        '<tr>' +
        '<td>' +
        escapeHtml(r.id) +
        '</td>' +
        '<td>' +
        fmt(r.design && r.design.n) +
        '</td><td>' +
        fmt(r.design && r.design.e) +
        '</td><td>' +
        fmt(r.design && r.design.z) +
        '</td>' +
        '<td>' +
        fmt(r.measured && r.measured.n) +
        '</td><td>' +
        fmt(r.measured && r.measured.e) +
        '</td><td>' +
        fmt(r.measured && r.measured.z) +
        '</td>' +
        '<td>' +
        fmt(r.machine && r.machine.n) +
        '</td><td>' +
        fmt(r.machine && r.machine.e) +
        '</td><td>' +
        fmt(r.machine && r.machine.z) +
        '</td>' +
        '<td>' +
        fmt(r.md && r.md.dn) +
        '</td><td>' +
        fmt(r.md && r.md.de) +
        '</td><td>' +
        fmt(r.md && r.md.dz) +
        '</td><td>' +
        fmt(r.md && r.md.horiz) +
        '</td>' +
        '</tr>';
    }
    html += '</tbody></table>';
    if (rows.length > limit) {
      html +=
        '<p style="font-size:12px;color:#6a6e79">Table truncated to first ' +
        limit +
        ' of ' +
        rows.length +
        ' piles. Export CSV for the full set.</p>';
    }
    return html;
  }

  function buildSummaryCards(report) {
    var md = report.avg.measuredVsDesign;
    var kd = report.avg.machineVsDesign;
    var primary = md || kd;
    var note = md ? 'meas − design' : kd ? 'mach − design' : '';
    var med = report.medianZ || {};
    var countsNote =
      'of D' +
      report.counts.design +
      ' / M' +
      report.counts.measured +
      ' / K' +
      report.counts.machine;

    function card(label, value, sub) {
      return (
        '<div class="stat">' +
        '<div class="label">' +
        escapeHtml(label) +
        '</div>' +
        '<div class="value">' +
        escapeHtml(value) +
        '</div>' +
        '<div class="note">' +
        escapeHtml(sub || '') +
        '</div></div>'
      );
    }

    var favorHtml = '';
    if (md) {
      favorHtml +=
        'Measured favors <span class="chip chip-info">' + escapeHtml(md.favor) + '</span> ';
    }
    if (kd) {
      favorHtml +=
        'Machine favors <span class="chip chip-ok">' + escapeHtml(kd.favor) + '</span>';
    }

    var medianCard =
      '<div class="stat">' +
      '<div class="label">Median ΔZ (ft)</div>' +
      '<div class="value" style="font-size:16px;line-height:1.35">' +
      'Rover ' +
      escapeHtml(med.roverDz != null ? fmt(med.roverDz) : '—') +
      '<br/>Machine ' +
      escapeHtml(med.machineDz != null ? fmt(med.machineDz) : '—') +
      '</div>' +
      '<div class="note">vs design</div></div>';

    return (
      '<p class="match">Showing ' +
      report.counts.common +
      ' common ID(s) across: ' +
      escapeHtml((report.sourcesUsed || []).join(', ')) +
      '</p>' +
      '<div class="stats">' +
      card('Common piles', String(report.counts.common), countsNote) +
      card('Avg ΔN (ft)', primary ? fmt(primary.dn) : '—', note) +
      card('Avg ΔE (ft)', primary ? fmt(primary.de) : '—', note) +
      card('Avg ΔZ (ft)', primary ? fmt(primary.dz) : '—', note) +
      medianCard +
      '</div>' +
      (favorHtml ? '<p class="favor">' + favorHtml + '</p>' : '')
    );
  }

  function avgBlock(title, avg) {
    if (!avg) return row(title, '—');
    return (
      row(title + ' ΔN (ft)', fmt(avg.dn)) +
      row(title + ' ΔE (ft)', fmt(avg.de)) +
      row(title + ' ΔZ (ft)', fmt(avg.dz)) +
      row(title + ' horiz (ft)', fmt(avg.horiz)) +
      row(title + ' favor', avg.favor)
    );
  }

  function open(report, meta, images) {
    meta = meta || {};
    images = images || {};
    var generatedAt = new Date().toLocaleString();
    var html =
      "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Pile QC Report</title>" +
      "<link href='https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap' rel='stylesheet'>" +
      '<style>' +
      "body{font-family:'Open Sans',Arial,sans-serif;color:#252a2e;margin:0;padding:0;}" +
      '.rpt-hdr{background:#fff;padding:20px 24px 16px;border-bottom:3px solid #005f9e;}' +
      '.rpt-hdr__brands{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:14px;}' +
      '.trimble-logo{height:32px;width:auto;display:block;}' +
      '.rpt-hdr h1{margin:0;font-size:20px;color:#005f9e;font-weight:700;}' +
      '.rpt-hdr p{margin:6px 0 0;font-size:13px;color:#6a6e79;}' +
      '.body{padding:24px;}' +
      'h2{font-size:14px;color:#005f9e;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #e0e1e9;padding-bottom:6px;margin:24px 0 12px;}' +
      'table{width:100%;border-collapse:collapse;margin-bottom:8px;}' +
      'td{padding:8px 10px;border:1px solid #e0e1e9;font-size:12px;vertical-align:top;}' +
      'td.lbl{width:38%;background:#f7f8fa;font-weight:700;color:#6a6e79;}' +
      'table.data th,table.data td{font-size:10px;padding:4px 5px;text-align:right;}' +
      'table.data th{background:#005f9e;color:#fff;text-align:center;}' +
      'table.data td:first-child,table.data th:first-child{text-align:left;font-weight:700;}' +
      '.match{font-size:12px;color:#6a6e79;margin:0 0 12px;}' +
      '.stats{display:flex;gap:12px;margin-bottom:10px;}' +
      '.stat{flex:1;background:#f4f9fc;border:1px solid #e0e1e9;border-radius:4px;padding:12px;}' +
      '.stat .label{font-size:11px;color:#6a6e79;text-transform:uppercase;letter-spacing:.04em;}' +
      '.stat .value{font-size:22px;font-weight:700;color:#005f9e;margin-top:4px;}' +
      '.stat .note{font-size:11px;color:#6a6e79;margin-top:4px;}' +
      '.favor{font-size:13px;font-weight:600;margin:8px 0 0;}' +
      '.chip{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;}' +
      '.chip-info{background:#e8f2f8;color:#005f9e;}' +
      '.chip-ok{background:#e4f2ed;color:#006638;}' +
      '.viz{display:flex;gap:16px;flex-wrap:wrap;}' +
      '.viz img{max-width:48%;border:1px solid #e0e1e9;}' +
      '.z-page{page:zlandscape;break-before:page;padding:18px 24px;}' +
      '.z-page h2{margin-top:0;}' +
      '.z-page img{width:100%;max-height:6.8in;object-fit:contain;border:1px solid #e0e1e9;}' +
      '.footer{margin-top:32px;padding-top:12px;border-top:1px solid #e0e1e9;font-size:11px;color:#6a6e79;}' +
      '@page{size:letter portrait;margin:0.6in;}' +
      '@page zlandscape{size:letter landscape;margin:0.45in;}' +
      '@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}.stats{break-inside:avoid;}.z-page{break-before:page;}}' +
      '</style></head><body>' +
      '<div class="rpt-hdr"><div class="rpt-hdr__brands">' +
      '<img class="trimble-logo" src="' +
      logoUrl() +
      '" alt="Trimble" />' +
      '</div>' +
      '<h1>Pile QC Report</h1>' +
      '<p>Design · Measured · Machine · Generated ' +
      escapeHtml(generatedAt) +
      '</p></div>' +
      '<div class="body">' +
      '<h2>Job details</h2><table>' +
      row('Job / site', meta.jobName || '') +
      row('Notes', meta.notes || '') +
      row('Design files', (meta.designFiles || []).join('; ')) +
      row('Measured files', (meta.measuredFiles || []).join('; ')) +
      row('Machine files', (meta.machineFiles || []).join('; ')) +
      row('Sources used', (report.sourcesUsed || []).join(', ')) +
      '</table>' +
      '<h2>Summary</h2>' +
      buildSummaryCards(report) +
      '<h2>Detail averages</h2><table>' +
      avgBlock('Measured vs design', report.avg.measuredVsDesign) +
      avgBlock('Machine vs design', report.avg.machineVsDesign) +
      avgBlock('Machine vs measured', report.avg.machineVsMeasured) +
      '</table>';

    if (images.bullseye) {
      html +=
        '<h2>Directional bullseye</h2><div class="viz">' +
        '<img src="' +
        images.bullseye +
        '" alt="Bullseye" style="max-width:70%" />' +
        '</div>';
    }

    html +=
      '<h2>Per-pile QC</h2>' +
      buildTable(report) +
      '<div class="footer">Positive ΔN = north of design · Positive ΔE = east of design · Positive ΔZ = above design. Only pile IDs common to all loaded source types are shown. Z Δ charts follow on landscape pages (10 piles per page).</div>' +
      '</div>';

    // Dedicated landscape Z pages — 10 piles each (may be truncated for large jobs)
    var zPages = images.zPages || [];
    var zMeta = images.zMeta || {};
    for (var zi = 0; zi < zPages.length; zi++) {
      html +=
        '<div class="z-page">' +
        '<h2>Z visualizer (ΔZ) — page ' +
        (zi + 1) +
        ' of ' +
        (zMeta.totalPages || zPages.length) +
        '</h2>' +
        '<img src="' +
        zPages[zi] +
        '" alt="Z page ' +
        (zi + 1) +
        '" />' +
        '</div>';
    }
    if (zMeta.truncated) {
      html +=
        '<div class="z-page"><p>Z chart pages truncated at ' +
        zMeta.renderedPages +
        ' of ' +
        zMeta.totalPages +
        ' for PDF size. Use the on-screen Z scroller or Export CSV for the full pile set.</p></div>';
    }

    html += '</body></html>';

    var w = window.open('', '_blank');
    if (!w) {
      alert('Popup blocked — allow popups to export PDF.');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(function () {
      try {
        w.focus();
        w.print();
      } catch (e) {
        /* ignore */
      }
    }, 400);
  }

  return { open: open };
})();
