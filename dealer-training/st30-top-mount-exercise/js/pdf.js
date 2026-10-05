/**
 * ST30 Top Mount Exercise PDF report.
 */
var TipDevPdf = (function () {
  function logoUrl() {
    if (typeof TRIMBLE_PDF_LOGO_SRC !== 'undefined' && TRIMBLE_PDF_LOGO_SRC) return TRIMBLE_PDF_LOGO_SRC;
    try {
      return new URL('../../assets/brand/trimble-logo-blue.png', window.location.href).href;
    } catch (e) {
      return '../../assets/brand/trimble-logo-blue.png';
    }
  }
  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function fmtMm(n) {
    return TipDevCalc.fmtMm(n, 1);
  }

  function activityTable(title, rows) {
    var html =
      '<h3>' +
      esc(title) +
      '</h3><table class="data"><thead><tr>' +
      '<th>Tilt</th><th>Point</th><th>Horiz mm</th><th>Spec XY</th><th>|ΔZ| mm</th><th>Spec Z</th><th>vs advertised</th>' +
      '</tr></thead><tbody>';
    rows.forEach(function (r) {
      var horiz = r.d ? Math.abs(r.d.horiz) : null;
      var absZ = r.d ? Math.abs(r.d.dz) : null;
      var vs = '—';
      if (r.tilt === 0) vs = 'origin (0°)';
      else if (r.check) {
        vs =
          (r.check.passXY ? 'XY ok' : 'XY over') +
          ' · ' +
          (r.check.passZ ? 'Z ok' : 'Z over') +
          ' (' +
          r.check.horizMm.toFixed(1) +
          ' / ' +
          r.check.zMm.toFixed(1) +
          ' mm)';
      }
      html +=
        '<tr><td>' +
        esc(r.tiltLabel) +
        '</td><td>' +
        esc(r.pointName) +
        '</td>' +
        '<td>' +
        fmtMm(horiz) +
        '</td><td>' +
        (r.check ? r.check.specXY.toFixed(1) : '—') +
        '</td>' +
        '<td>' +
        fmtMm(absZ) +
        '</td><td>' +
        (r.check ? r.check.specZ.toFixed(1) : '—') +
        '</td>' +
        '<td>' +
        esc(vs) +
        '</td></tr>';
    });
    return html + '</tbody></table>';
  }

  function compareTable(rows) {
    var html =
      '<h3>UP vs DOWN (same tilt)</h3><table class="data"><thead><tr>' +
      '<th>Tilt</th><th>UP</th><th>DOWN</th><th>ΔN mm</th><th>ΔE mm</th><th>ΔZ mm</th><th>Horiz Δ mm</th>' +
      '</tr></thead><tbody>';
    rows.forEach(function (r) {
      html +=
        '<tr><td>' +
        esc(r.tiltLabel) +
        '</td><td>' +
        esc(r.tipDownName) +
        '</td><td>' +
        esc(r.tipUpName) +
        '</td>' +
        '<td>' +
        fmtMm(r.d && r.d.dn) +
        '</td><td>' +
        fmtMm(r.d && r.d.de) +
        '</td>' +
        '<td>' +
        fmtMm(r.d && r.d.dz) +
        '</td><td>' +
        fmtMm(r.d && r.d.horiz) +
        '</td></tr>';
    });
    return html + '</tbody></table>';
  }

  function specBlock(report) {
    function cell(row, tilt) {
      var b = TipDevCalc.specBudget(row, tilt, report.tsMm || 0);
      return b.specXY.toFixed(1) + ' | ' + b.specZ.toFixed(1);
    }
    return (
      '<h3>Optical TIP formula (mm)</h3>' +
      '<p class="sub">spec = TS + constant + (mm/°tilt × tilt). TS in this report = ' +
      (report.tsMm != null ? Number(report.tsMm).toFixed(1) : '0.0') +
      ' mm.</p>' +
      '<table class="data"><thead><tr><th>Rod height</th><th>Formula XY / Z</th><th>5°</th><th>15°</th><th>30°</th></tr></thead><tbody>' +
      TipDevCalc.TIP_SPECS.map(function (row) {
        return (
          '<tr><td>' +
          esc(row.label) +
          '</td><td>XY TS+' +
          row.xyConst +
          '+' +
          row.xyPerDeg +
          '×° &nbsp; Z TS+' +
          row.zConst +
          '+' +
          row.zPerDeg +
          '×°</td><td>' +
          cell(row, 5) +
          '</td><td>' +
          cell(row, 15) +
          '</td><td>' +
          cell(row, 30) +
          '</td></tr>'
        );
      }).join('') +
      '</tbody></table>' +
      '<p class="sub">Active: UP → ' +
      esc(report.rodA ? report.rodA.specRow.label : '—') +
      ' · DOWN → ' +
      esc(report.rodB ? report.rodB.specRow.label : '—') +
      '</p>'
    );
  }

  function open(report, meta) {
    meta = meta || {};
    var w = window.open('', '_blank');
    if (!w) {
      alert('Allow pop-ups to export the PDF report.');
      return;
    }
    var b = report.bench;
    var html =
      '<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>ST30 Top Mount Exercise</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap" rel="stylesheet"/>' +
      '<style>body{font-family:"Open Sans",Arial,sans-serif;color:#1a1a1a;margin:28px;}' +
      '.hdr{display:flex;justify-content:space-between;border-bottom:3px solid #00548C;padding-bottom:12px;margin-bottom:16px;}' +
      '.hdr img{height:36px;} h1{margin:0;font-size:18px;color:#00548C;} .sub{font-size:12px;color:#555;}' +
      'h3{color:#00548C;font-size:13px;margin:16px 0 6px;} table.data{width:100%;border-collapse:collapse;font-size:10px;}' +
      'th{background:#00548C;color:#fff;padding:5px;} td{border:1px solid #ddd;padding:5px;}' +
      '@media print{.noprint{display:none}}</style></head><body>' +
      '<div class="hdr"><div><img src="' +
      esc(logoUrl()) +
      '" alt="Trimble"/><p class="sub">Technician Assistant · Dealer Training</p></div>' +
      '<div style="text-align:right"><h1>ST30 Top Mount Exercise</h1><p class="sub">' +
      esc(meta.job || 'Field report') +
      ' · ' +
      esc(meta.date || new Date().toLocaleString()) +
      '</p></div></div>' +
      '<p class="sub">' +
      (report.rodA
        ? 'UP ' + esc(TipDevCalc.fmt(report.rodA.rodHeightM, 3)) + ' m → ' + esc(report.rodA.specRow.label)
        : '') +
      (report.rodB
        ? ' · DOWN ' + esc(TipDevCalc.fmt(report.rodB.rodHeightM, 3)) + ' m → ' + esc(report.rodB.specRow.label)
        : '') +
      (b ? ' · Origin ' + esc(b.name) : '') +
      '</p>' +
      specBlock(report) +
      activityTable(
        'UP shots vs UP0 · ' + (report.rodA ? report.rodA.specRow.label : ''),
        report.tipDown
      ) +
      activityTable(
        'DOWN shots vs DOWN0 · ' + (report.rodB ? report.rodB.specRow.label : ''),
        report.tipUp
      ) +
      compareTable(report.compare) +
      '<p class="sub">CSV US FT → meters. Δ vs 0° origin. Specs from Top Mount Accuracy slide.</p>' +
      '<p class="noprint"><button onclick="window.print()">Print / Save PDF</button></p>' +
      '<script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script></body></html>';
    w.document.open();
    w.document.write(html);
    w.document.close();
  }
  return { open: open };
})();
