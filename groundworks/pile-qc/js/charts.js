/**
 * Canvas visuals: directional bullseye (ΔE vs ΔN) and virtualized Z visualizer (ΔZ).
 * Z chart uses a scroll viewport so thousands of piles do not exceed canvas size limits.
 */
var PileCharts = (function () {
  var Z_PX_PER_PILE = 56;
  var Z_PDF_PILES_PER_PAGE = 10;
  var MAX_CANVAS_W = 8192;
  var BULLSEYE_MAX_DOTS = 2500;

  function clear(canvas) {
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return ctx;
  }

  function computeMaxAbsZ(report, rows) {
    var md = report.avg.measuredVsDesign;
    var kd = report.avg.machineVsDesign;
    var maxAbs = 0.05;
    function considerDz(v) {
      if (v == null || !Number.isFinite(v)) return;
      maxAbs = Math.max(maxAbs, Math.abs(v));
    }
    if (md) considerDz(md.dz);
    if (kd) considerDz(kd.dz);
    var list = rows || report.rows;
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (r.md) considerDz(r.md.dz);
      if (r.kd) considerDz(r.kd.dz);
    }
    return maxAbs;
  }

  function drawBullseye(canvas, report) {
    var ctx = clear(canvas);
    var w = canvas.width;
    var h = canvas.height;
    var cx = w / 2;
    var cy = h / 2;
    var pad = 28;
    var radius = Math.min(w, h) / 2 - pad;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#e0e1e9';
    ctx.lineWidth = 1;
    for (var i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (radius * i) / 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.strokeStyle = '#9b9faa';
    ctx.beginPath();
    ctx.moveTo(pad, cy);
    ctx.lineTo(w - pad, cy);
    ctx.moveTo(cx, pad);
    ctx.lineTo(cx, h - pad);
    ctx.stroke();

    ctx.fillStyle = '#6a6e79';
    ctx.font = '11px "Open Sans", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('East', w - 22, cy - 6);
    ctx.fillText('West', 22, cy - 6);
    ctx.fillText('North', cx + 18, pad + 4);
    ctx.fillText('South', cx + 18, h - 10);

    var md = report.avg.measuredVsDesign;
    var kd = report.avg.machineVsDesign;

    var maxAbs = 0.05;
    function consider(avg) {
      if (!avg) return;
      maxAbs = Math.max(maxAbs, Math.abs(avg.de), Math.abs(avg.dn));
    }
    consider(md);
    consider(kd);

    var rows = report.rows;
    var step = rows.length > BULLSEYE_MAX_DOTS ? Math.ceil(rows.length / BULLSEYE_MAX_DOTS) : 1;
    for (var i = 0; i < rows.length; i += step) {
      var r = rows[i];
      if (r.md) maxAbs = Math.max(maxAbs, Math.abs(r.md.de), Math.abs(r.md.dn));
      if (r.kd) maxAbs = Math.max(maxAbs, Math.abs(r.kd.de), Math.abs(r.kd.dn));
    }
    var scale = radius / maxAbs;

    function plotPoint(de, dn, color, label) {
      var x = cx + de * scale;
      var y = cy - dn * scale;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = '600 11px "Open Sans", Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(label, x + 10, y + 4);
    }

    ctx.globalAlpha = 0.25;
    for (i = 0; i < rows.length; i += step) {
      r = rows[i];
      if (!r.md) continue;
      var x = cx + r.md.de * scale;
      var y = cy - r.md.dn * scale;
      ctx.fillStyle = '#005f9e';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (md) plotPoint(md.de, md.dn, '#005f9e', 'Meas avg');
    if (kd) plotPoint(kd.de, kd.dn, '#006638', 'Mach avg');

    ctx.fillStyle = '#252a2e';
    ctx.font = '12px "Open Sans", Arial, sans-serif';
    ctx.textAlign = 'left';
    var note = 'Center = design';
    if (step > 1) note += ' · dots sampled 1/' + step;
    ctx.fillText(note, 12, h - 12);
  }

  /**
   * Draw Z points for a row slice onto canvas.
   * options: rows, pxPerPile, height, maxAbs, title, pageLabel, selected,
   *          scrollOffset (world X of left edge), viewOnly (boolean)
   */
  function drawZ(canvas, report, options) {
    options = options || {};
    var rows = options.rows || report.rows;
    var pxPerPile = options.pxPerPile || Z_PX_PER_PILE;
    var padL = 52;
    var padR = 24;
    var padT = 32;
    var padB = 78;
    var scrollOffset = options.scrollOffset || 0;
    var n = Math.max(1, rows.length);
    var h = options.height || 420;

    var fullPlotW = n * pxPerPile;
    var fullW = padL + padR + fullPlotW;

    // Fixed-size canvas for UI viewport mode; full width for PDF page slices
    var w;
    if (options.viewWidth) {
      w = Math.min(options.viewWidth, MAX_CANVAS_W);
      canvas.width = w;
      canvas.height = h;
    } else {
      w = Math.min(fullW, MAX_CANVAS_W);
      if (!options.rows || options.rows === report.rows) {
        // safety: never allocate giant canvas for full report in UI
        if (fullW > MAX_CANVAS_W && !options.allowFullWidth) {
          w = MAX_CANVAS_W;
        }
      }
      canvas.width = w;
      canvas.height = h;
    }

    var ctx = clear(canvas);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    var md = report.avg.measuredVsDesign;
    var kd = report.avg.machineVsDesign;
    var maxAbs = (options.maxAbs != null ? options.maxAbs : computeMaxAbsZ(report)) * 1.1;

    function yOf(dz) {
      var mid = padT + (h - padT - padB) / 2;
      var half = (h - padT - padB) / 2;
      return mid - (dz / maxAbs) * half;
    }

    var yZero = yOf(0);
    var worldLeft = scrollOffset;
    var worldRight = scrollOffset + w;

    // Design ΔZ = 0
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = '#6a6e79';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, yZero);
    ctx.lineTo(w, yZero);
    ctx.stroke();
    ctx.setLineDash([]);

    function drawAvgLine(avg, color, dash) {
      if (!avg) return;
      ctx.setLineDash(dash);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, yOf(avg.dz));
      ctx.lineTo(w, yOf(avg.dz));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    drawAvgLine(md, '#005f9e', []);
    drawAvgLine(kd, '#006638', [7, 4]);

    function drawDot(x, y, color, radius, ring) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = ring || '#ffffff';
      ctx.lineWidth = ring ? 2.5 : 1.5;
      ctx.stroke();
    }

    var hits = [];
    var selected = options.selected || null;
    var startIdx = Math.max(0, Math.floor((worldLeft - padL) / pxPerPile) - 1);
    var endIdx = Math.min(n - 1, Math.ceil((worldRight - padL) / pxPerPile) + 1);

    for (var idx = startIdx; idx <= endIdx; idx++) {
      var r = rows[idx];
      if (!r) continue;
      var worldCx = padL + (idx + 0.5) * pxPerPile;
      var cx = worldCx - scrollOffset;

      ctx.strokeStyle = '#f0f1f4';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, padT);
      ctx.lineTo(cx, h - padB + 8);
      ctx.stroke();

      if (r.md) {
        var yM = yOf(r.md.dz);
        var xM = cx - 6;
        ctx.strokeStyle = 'rgba(0,95,158,0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(xM, yZero);
        ctx.lineTo(xM, yM);
        ctx.stroke();
        var selM = selected && selected.id === r.id && selected.series === 'measured';
        drawDot(xM, yM, '#005f9e', selM ? 8 : 5, selM ? '#fbad26' : '#ffffff');
        hits.push({
          x: xM,
          y: yM,
          r: 14,
          id: r.id,
          series: 'measured',
          label: 'Measured vs design',
          color: '#005f9e',
          row: r,
          plotted: { dz: r.md.dz, dn: r.md.dn, de: r.md.de, horiz: r.md.horiz },
        });
      }
      if (r.kd) {
        var yK = yOf(r.kd.dz);
        var xK = cx + 6;
        ctx.strokeStyle = 'rgba(0,102,56,0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(xK, yZero);
        ctx.lineTo(xK, yK);
        ctx.stroke();
        var selK = selected && selected.id === r.id && selected.series === 'machine';
        drawDot(xK, yK, '#006638', selK ? 8 : 5, selK ? '#fbad26' : '#ffffff');
        hits.push({
          x: xK,
          y: yK,
          r: 14,
          id: r.id,
          series: 'machine',
          label: 'Machine vs design',
          color: '#006638',
          row: r,
          plotted: { dz: r.kd.dz, dn: r.kd.dn, de: r.kd.de, horiz: r.kd.horiz },
        });
      }

      ctx.fillStyle = '#6a6e79';
      ctx.font = '10px "Open Sans", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(r.id), cx, h - padB + 18);
    }

    // Top series legend
    ctx.font = '11px "Open Sans", Arial, sans-serif';
    ctx.textAlign = 'left';
    drawDot(padL + 6, 14, '#005f9e', 5);
    ctx.fillStyle = '#005f9e';
    ctx.fillText('Measured vs design', padL + 16, 18);
    drawDot(padL + 156, 14, '#006638', 5);
    ctx.fillStyle = '#006638';
    ctx.fillText('Machine vs design', padL + 166, 18);

    if (options.pageLabel) {
      ctx.fillStyle = '#6a6e79';
      ctx.textAlign = 'right';
      ctx.fillText(options.pageLabel, w - 12, 18);
    }

    // Bottom legend
    var legY = h - 18;
    function lineSample(x, color, dash) {
      ctx.setLineDash(dash);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x, legY - 3);
      ctx.lineTo(x + 22, legY - 3);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.font = '600 11px "Open Sans", Arial, sans-serif';
    ctx.textAlign = 'left';
    var x = 12;
    lineSample(x, '#6a6e79', [5, 5]);
    ctx.fillStyle = '#6a6e79';
    ctx.fillText('Design ΔZ = 0', x + 28, legY);
    x += 130;
    if (md) {
      lineSample(x, '#005f9e', []);
      ctx.fillStyle = '#005f9e';
      ctx.fillText('Meas avg ' + md.dz.toFixed(3) + ' ft', x + 28, legY);
      x += 168;
    }
    if (kd) {
      lineSample(x, '#006638', [7, 4]);
      ctx.fillStyle = '#006638';
      ctx.fillText('Mach avg ' + kd.dz.toFixed(3) + ' ft', x + 28, legY);
    }

    ctx.fillStyle = '#6a6e79';
    ctx.font = '10px "Open Sans", Arial, sans-serif';
    ctx.textAlign = 'right';
    var scaleVal = maxAbs / 1.1;
    ctx.fillText('+' + scaleVal.toFixed(2), padL - 6, yOf(scaleVal) + 3);
    ctx.fillText('-' + scaleVal.toFixed(2), padL - 6, yOf(-scaleVal) + 3);
    ctx.fillText('0', padL - 6, yZero + 3);

    canvas._zHits = hits;
    canvas._zMeta = {
      padL: padL,
      padR: padR,
      pxPerPile: pxPerPile,
      fullWidth: fullW,
      height: h,
      maxAbs: maxAbs / 1.1,
      n: n,
    };
    canvas.style.cursor = 'default';
    return hits;
  }

  /** Bind scrollable Z viewport (handles thousands of piles). */
  function bindZViewport(scrollEl, canvas, spacerEl, report, options) {
    options = options || {};
    var px = options.pxPerPile || Z_PX_PER_PILE;
    var h = options.height || 420;
    var padL = 52;
    var padR = 24;
    var n = Math.max(1, report.rows.length);
    var fullW = padL + padR + n * px;
    var maxAbs = computeMaxAbsZ(report);

    if (spacerEl) {
      spacerEl.style.width = fullW + 'px';
      spacerEl.style.height = h + 'px';
    }

    function paint() {
      var viewW = Math.max(320, Math.floor(scrollEl.clientWidth) || 800);
      var scrollLeft = scrollEl.scrollLeft || 0;
      drawZ(canvas, report, {
        rows: report.rows,
        pxPerPile: px,
        height: h,
        maxAbs: maxAbs,
        viewWidth: viewW,
        scrollOffset: scrollLeft,
        selected: options.selected || null,
      });
      canvas.style.left = scrollLeft + 'px';
      canvas.style.width = viewW + 'px';
      canvas.style.height = h + 'px';
    }

    scrollEl._zPaint = paint;
    scrollEl._zFullWidth = fullW;
    paint();
    return { paint: paint, fullWidth: fullW, maxAbs: maxAbs };
  }

  function hitTestZ(canvas, clientX, clientY) {
    var hits = canvas._zHits || [];
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    var x = (clientX - rect.left) * scaleX;
    var y = (clientY - rect.top) * scaleY;
    var best = null;
    var bestD = Infinity;
    for (var i = 0; i < hits.length; i++) {
      var hit = hits[i];
      var d = Math.sqrt(Math.pow(x - hit.x, 2) + Math.pow(y - hit.y, 2));
      if (d <= hit.r && d < bestD) {
        best = hit;
        bestD = d;
      }
    }
    return best;
  }

  /**
   * Build landscape PDF page images: 10 piles per page.
   * Caps pages to avoid browser OOM; returns { pages, truncated, totalPages }.
   */
  function buildZPageImages(report, limits) {
    limits = limits || {};
    var maxPages = limits.maxPages != null ? limits.maxPages : 100;
    var pages = [];
    var per = Z_PDF_PILES_PER_PAGE;
    var maxAbs = computeMaxAbsZ(report);
    var total = report.rows.length;
    var pageCount = Math.max(1, Math.ceil(total / per));
    var renderCount = Math.min(pageCount, maxPages);
    var offscreen = document.createElement('canvas');

    for (var p = 0; p < renderCount; p++) {
      var slice = report.rows.slice(p * per, p * per + per);
      if (!slice.length && p > 0) break;
      drawZ(offscreen, report, {
        rows: slice.length ? slice : [],
        pxPerPile: 90,
        height: 520,
        maxAbs: maxAbs,
        allowFullWidth: true,
        pageLabel:
          'Z page ' +
          (p + 1) +
          ' of ' +
          pageCount +
          ' · piles ' +
          (p * per + 1) +
          '–' +
          Math.min((p + 1) * per, total),
      });
      pages.push(toDataUrl(offscreen));
    }
    return {
      pages: pages,
      truncated: renderCount < pageCount,
      totalPages: pageCount,
      renderedPages: renderCount,
    };
  }

  function toDataUrl(canvas) {
    try {
      return canvas.toDataURL('image/png');
    } catch (e) {
      return '';
    }
  }

  return {
    drawBullseye: drawBullseye,
    drawZ: drawZ,
    bindZViewport: bindZViewport,
    hitTestZ: hitTestZ,
    buildZPageImages: buildZPageImages,
    toDataUrl: toDataUrl,
    computeMaxAbsZ: computeMaxAbsZ,
    Z_PX_PER_PILE: Z_PX_PER_PILE,
    Z_PDF_PILES_PER_PAGE: Z_PDF_PILES_PER_PAGE,
  };
})();
