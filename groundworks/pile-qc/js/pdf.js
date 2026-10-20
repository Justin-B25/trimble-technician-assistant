/**
 * Pile QC PDF / print report — all landscape pages.
 * Includes summary, table, Z chart pages, and per-pile detail pages.
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
    maxRows = maxRows == null ? 400 : maxRows;
    var rows = report.rows;
    var limit = Math.min(rows.length, maxRows);
    var cols = ['ID', 'Des N', 'Des E', 'Des Z'];
    if (report.hasGnss) cols.push('GNSS N', 'GNSS E', 'GNSS Z', 'ΔN g−d', 'ΔE g−d', 'ΔZ g−d');
    if (report.hasUts) cols.push('UTS N', 'UTS E', 'UTS Z', 'ΔN u−d', 'ΔE u−d', 'ΔZ u−d');
    if (report.hasMachine) cols.push('Mach N', 'Mach E', 'Mach Z', 'ΔN k−d', 'ΔE k−d', 'ΔZ k−d');

    var html =
      '<table class="data"><thead><tr>' +
      cols.map(function (c) {
        return '<th>' + escapeHtml(c) + '</th>';
      }).join('') +
      '</tr></thead><tbody>';

    for (var i = 0; i < limit; i++) {
      var r = rows[i];
      html += '<tr><td>' + escapeHtml(r.id) + '</td>';
      html +=
        '<td>' +
        fmt(r.design && r.design.n) +
        '</td><td>' +
        fmt(r.design && r.design.e) +
        '</td><td>' +
        fmt(r.design && r.design.z) +
        '</td>';
      if (report.hasGnss) {
        html +=
          '<td>' +
          fmt(r.gnss && r.gnss.n) +
          '</td><td>' +
          fmt(r.gnss && r.gnss.e) +
          '</td><td>' +
          fmt(r.gnss && r.gnss.z) +
          '</td><td>' +
          fmt(r.gd && r.gd.dn) +
          '</td><td>' +
          fmt(r.gd && r.gd.de) +
          '</td><td>' +
          fmt(r.gd && r.gd.dz) +
          '</td>';
      }
      if (report.hasUts) {
        html +=
          '<td>' +
          fmt(r.uts && r.uts.n) +
          '</td><td>' +
          fmt(r.uts && r.uts.e) +
          '</td><td>' +
          fmt(r.uts && r.uts.z) +
          '</td><td>' +
          fmt(r.ud && r.ud.dn) +
          '</td><td>' +
          fmt(r.ud && r.ud.de) +
          '</td><td>' +
          fmt(r.ud && r.ud.dz) +
          '</td>';
      }
      if (report.hasMachine) {
        html +=
          '<td>' +
          fmt(r.machine && r.machine.n) +
          '</td><td>' +
          fmt(r.machine && r.machine.e) +
          '</td><td>' +
          fmt(r.machine && r.machine.z) +
          '</td><td>' +
          fmt(r.kd && r.kd.dn) +
          '</td><td>' +
          fmt(r.kd && r.kd.de) +
          '</td><td>' +
          fmt(r.kd && r.kd.dz) +
          '</td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    if (rows.length > limit) {
      html +=
        '<p class="muted">Table truncated to first ' +
        limit +
        ' of ' +
        rows.length +
        ' piles. Export CSV for the full set.</p>';
    }
    return html;
  }

  function avgBlock(title, avg, colorClass) {
    if (!avg) return '';
    return (
      '<div class="avg-card ' +
      (colorClass || '') +
      '">' +
      '<div class="avg-title">' +
      escapeHtml(title) +
      '</div>' +
      '<div class="avg-grid">' +
      '<div><span>ΔN</span><b>' +
      fmt(avg.dn) +
      '</b></div>' +
      '<div><span>ΔE</span><b>' +
      fmt(avg.de) +
      '</b></div>' +
      '<div><span>ΔZ</span><b>' +
      fmt(avg.dz) +
      '</b></div>' +
      '<div><span>Horiz</span><b>' +
      fmt(avg.horiz) +
      '</b></div>' +
      '<div class="favor-cell"><span>Favor</span><b>' +
      escapeHtml(avg.favor) +
      '</b></div>' +
      '</div></div>'
    );
  }

  function buildSummary(report) {
    var med = report.medianZ || {};
    var html =
      '<p class="match">Showing ' +
      report.counts.common +
      ' common ID(s) across: ' +
      escapeHtml((report.sourcesUsed || []).join(', ')) +
      ' · counts D' +
      report.counts.design +
      ' / G' +
      report.counts.gnss +
      ' / U' +
      report.counts.uts +
      ' / K' +
      report.counts.machine +
      '</p>' +
      '<div class="avg-row">';
    if (report.hasGnss) html += avgBlock('GNSS rover vs design', report.avg.gnssVsDesign, 'avg-gnss');
    if (report.hasUts) html += avgBlock('UTS vs design', report.avg.utsVsDesign, 'avg-uts');
    if (report.hasMachine) html += avgBlock('Machine vs design', report.avg.machineVsDesign, 'avg-mach');
    if (report.hasGnss && report.hasMachine)
      html += avgBlock('GNSS vs machine', report.avg.gnssVsMachine, 'avg-gnss-mach');
    if (report.hasUts && report.hasMachine)
      html += avgBlock('UTS vs machine', report.avg.utsVsMachine, 'avg-uts-mach');
    html += '</div>';
    html +=
      '<p class="median-line">Median ΔZ vs design — ' +
      (report.hasGnss
        ? 'GNSS ' + escapeHtml(med.gnssDz != null ? fmt(med.gnssDz) : '—') + ' · '
        : '') +
      (report.hasUts
        ? 'UTS ' + escapeHtml(med.utsDz != null ? fmt(med.utsDz) : '—') + ' · '
        : '') +
      (report.hasMachine
        ? 'Machine ' + escapeHtml(med.machineDz != null ? fmt(med.machineDz) : '—')
        : '') +
      ((report.hasGnss && report.hasMachine) || (report.hasUts && report.hasMachine)
        ? ' · vs machine — ' +
          (report.hasGnss && report.hasMachine
            ? 'GNSS ' +
              escapeHtml(med.gnssVsMachineDz != null ? fmt(med.gnssVsMachineDz) : '—') +
              (report.hasUts && report.hasMachine ? ' · ' : '')
            : '') +
          (report.hasUts && report.hasMachine
            ? 'UTS ' + escapeHtml(med.utsVsMachineDz != null ? fmt(med.utsVsMachineDz) : '—')
            : '')
        : '') +
      ' ft</p>';
    return html;
  }

  function sourceBlock(title, pt, delta, colorClass) {
    return (
      '<div class="src ' +
      (colorClass || '') +
      '">' +
      '<h3>' +
      escapeHtml(title) +
      '</h3>' +
      (pt
        ? '<table class="mini">' +
          row('Northing', fmt(pt.n)) +
          row('Easting', fmt(pt.e)) +
          row('Elevation', fmt(pt.z)) +
          (delta
            ? row('ΔN / ΔE / ΔZ', fmt(delta.dn) + ' / ' + fmt(delta.de) + ' / ' + fmt(delta.dz)) +
              row('Horiz (ft)', fmt(delta.horiz))
            : '') +
          '</table>'
        : '<p class="muted">Not in this report set</p>') +
      '</div>'
    );
  }

  function buildPilePage(page, report, index, total) {
    var r = page.row;
    return (
      '<div class="page pile-page">' +
      '<div class="page-hd">' +
      '<h2>Pile ' +
      escapeHtml(r.id) +
      '</h2>' +
      '<p class="page-sub">Detail ' +
      (index + 1) +
      ' of ' +
      total +
      ' · GNSS blue · UTS orange · Machine green · Design at center</p>' +
      '</div>' +
      '<div class="pile-layout">' +
      '<div class="pile-plot">' +
      (page.image
        ? '<img src="' + page.image + '" alt="Pile ' + escapeHtml(r.id) + ' landing plot" />'
        : '') +
      '</div>' +
      '<div class="pile-sources">' +
      sourceBlock('Design', r.design, null, 'src-design') +
      (report.hasGnss ? sourceBlock('GNSS rover (vs design)', r.gnss, r.gd, 'src-gnss') : '') +
      (report.hasUts ? sourceBlock('UTS rover (vs design)', r.uts, r.ud, 'src-uts') : '') +
      (report.hasMachine ? sourceBlock('Machine (vs design)', r.machine, r.kd, 'src-mach') : '') +
      (report.hasGnss && report.hasMachine
        ? sourceBlock('GNSS vs machine', r.gnss, r.gm, 'src-gnss')
        : '') +
      (report.hasUts && report.hasMachine
        ? sourceBlock('UTS vs machine', r.uts, r.um, 'src-uts')
        : '') +
      '</div>' +
      '</div></div>'
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
      "body{font-family:'Open Sans',Arial,sans-serif;color:#252a2e;margin:0;padding:0;background:#fff;}" +
      '.page{page:landscape;break-after:page;padding:0.35in 0.45in;box-sizing:border-box;min-height:7.5in;}' +
      '.page:last-child{break-after:auto;}' +
      '.rpt-hdr{display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:3px solid #005f9e;padding-bottom:10px;margin-bottom:14px;}' +
      '.trimble-logo{height:28px;width:auto;}' +
      '.rpt-hdr h1{margin:0;font-size:18px;color:#005f9e;font-weight:700;}' +
      '.rpt-hdr p{margin:4px 0 0;font-size:12px;color:#6a6e79;}' +
      'h2{font-size:13px;color:#005f9e;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #e0e1e9;padding-bottom:5px;margin:0 0 10px;}' +
      'h3{margin:0 0 6px;font-size:12px;}' +
      'table{width:100%;border-collapse:collapse;}' +
      'td{padding:5px 8px;border:1px solid #e0e1e9;font-size:11px;vertical-align:top;}' +
      'td.lbl{width:36%;background:#f7f8fa;font-weight:700;color:#6a6e79;}' +
      'table.data th,table.data td{font-size:9px;padding:3px 4px;text-align:right;}' +
      'table.data th{background:#005f9e;color:#fff;text-align:center;}' +
      'table.data td:first-child,table.data th:first-child{text-align:left;font-weight:700;}' +
      'table.mini td{font-size:11px;padding:4px 6px;}' +
      '.match,.muted,.median-line,.page-sub{font-size:11px;color:#6a6e79;margin:0 0 8px;}' +
      '.avg-row{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0 10px;}' +
      '.avg-card{flex:1;min-width:180px;border:1px solid #e0e1e9;border-radius:6px;padding:10px 12px;}' +
      '.avg-gnss{border-left:4px solid #005f9e;background:#f4f9fc;}' +
      '.avg-uts{border-left:4px solid #e36c0a;background:#fff8f1;}' +
      '.avg-mach{border-left:4px solid #006638;background:#f2f8f5;}' +
      '.avg-gnss-mach{border-left:4px solid #005f9e;background:#eef5fa;border-style:solid dashed solid solid;}' +
      '.avg-uts-mach{border-left:4px solid #e36c0a;background:#fff4ea;border-style:solid dashed solid solid;}' +
      '.avg-title{font-size:11px;font-weight:700;margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em;}' +
      '.avg-gnss .avg-title,.avg-gnss-mach .avg-title{color:#005f9e;}.avg-uts .avg-title,.avg-uts-mach .avg-title{color:#e36c0a;}.avg-mach .avg-title{color:#006638;}' +
      '.avg-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;}' +
      '.avg-grid span{display:block;font-size:10px;color:#6a6e79;}.avg-grid b{font-size:14px;}' +
      '.favor-cell{grid-column:1/-1;}' +
      '.viz img{max-width:62%;max-height:5.8in;border:1px solid #e0e1e9;}' +
      '.z-page img,.pile-plot img{width:100%;max-height:6.2in;object-fit:contain;border:1px solid #e0e1e9;background:#fff;}' +
      '.pile-layout{display:grid;grid-template-columns:1.35fr 1fr;gap:14px;align-items:start;}' +
      '.pile-sources{display:grid;grid-template-columns:1fr 1fr;gap:8px;}' +
      '.src{border:1px solid #e0e1e9;border-radius:6px;padding:8px 10px;}' +
      '.src-design{border-left:4px solid #6a6e79;}' +
      '.src-gnss{border-left:4px solid #005f9e;}' +
      '.src-uts{border-left:4px solid #e36c0a;}' +
      '.src-mach{border-left:4px solid #006638;}' +
      '.src-gnss h3{color:#005f9e;}.src-uts h3{color:#e36c0a;}.src-mach h3{color:#006638;}' +
      '.two-col{display:grid;grid-template-columns:1fr 1.2fr;gap:14px;}' +
      '.footer{margin-top:12px;padding-top:8px;border-top:1px solid #e0e1e9;font-size:10px;color:#6a6e79;}' +
      '@page{size:letter landscape;margin:0.4in;}' +
      '@page landscape{size:letter landscape;margin:0.4in;}' +
      '@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}.page{break-after:page;}.page:last-child{break-after:auto;}}' +
      '</style></head><body>';

    // Page 1 — summary
    html +=
      '<div class="page">' +
      '<div class="rpt-hdr">' +
      '<div><h1>Pile QC Report</h1>' +
      '<p>Design · GNSS · UTS · Machine · Generated ' +
      escapeHtml(generatedAt) +
      '</p></div>' +
      '<img class="trimble-logo" src="' +
      logoUrl() +
      '" alt="Trimble" />' +
      '</div>' +
      '<div class="two-col">' +
      '<div><h2>Job details</h2><table>' +
      row('Job / site', meta.jobName || '') +
      row('Notes', meta.notes || '') +
      row('Design files', (meta.designFiles || []).join('; ')) +
      row('GNSS stakeout files', (meta.gnssFiles || meta.measuredFiles || []).join('; ')) +
      row('UTS stakeout files', (meta.utsFiles || []).join('; ')) +
      row('Machine files', (meta.machineFiles || []).join('; ')) +
      row('Sources used', (report.sourcesUsed || []).join(', ')) +
      '</table></div>' +
      '<div><h2>Summary</h2>' +
      buildSummary(report) +
      (images.bullseye
        ? '<h2>Directional bullseye</h2><div class="viz"><img src="' +
          images.bullseye +
          '" alt="Bullseye" /></div>'
        : '') +
      '</div></div>' +
      '<div class="footer">Positive ΔN = north of design · Positive ΔE = east of design · Positive ΔZ = above design. Only pile IDs common to all loaded source types are shown. Landscape report: Z charts and per-pile pages follow.</div>' +
      '</div>';

    // Page 2 — table
    html +=
      '<div class="page">' +
      '<h2>Per-pile QC table</h2>' +
      buildTable(report) +
      '</div>';

    // Z landscape pages
    var zPages = images.zPages || [];
    var zMeta = images.zMeta || {};
    for (var zi = 0; zi < zPages.length; zi++) {
      html +=
        '<div class="page z-page">' +
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
        '<div class="page"><p class="muted">Z chart pages truncated at ' +
        zMeta.renderedPages +
        ' of ' +
        zMeta.totalPages +
        ' for PDF size. Use the on-screen Z scroller or Export CSV for the full pile set.</p></div>';
    }

    // Per-pile detail pages
    var pilePages = images.pilePages || [];
    var pileMeta = images.pileMeta || {};
    for (var pi = 0; pi < pilePages.length; pi++) {
      html += buildPilePage(pilePages[pi], report, pi, pileMeta.totalPiles || pilePages.length);
    }
    if (pileMeta.truncated) {
      html +=
        '<div class="page"><p class="muted">Per-pile detail pages truncated at ' +
        pileMeta.renderedPiles +
        ' of ' +
        pileMeta.totalPiles +
        ' piles for PDF size.</p></div>';
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
    }, 450);
  }

  return { open: open };
})();
