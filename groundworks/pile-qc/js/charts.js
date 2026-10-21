/**
 * Canvas visuals: directional bullseye (ΔE vs ΔN), virtualized Z visualizer (ΔZ),
 * and per-pile landing plots for PDF.
 * Colors: GNSS blue · UTS orange · Machine green
 */
var PileCharts = (function () {
  var Z_PX_PER_PILE = 64;
  var Z_PDF_PILES_PER_PAGE = 10;
  var MAX_CANVAS_W = 8192;
  var BULLSEYE_MAX_DOTS = 2500;

  function colors() {
    return (typeof PileQC !== 'undefined' && PileQC.COLORS) || {
      gnss: '#005f9e',
      uts: '#e36c0a',
      machine: '#006638',
      design: '#6a6e79',
    };
  }

  function clear(canvas) {
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return ctx;
  }

  function seriesList(report) {
    var c = colors();
    var list = [];
    if (report.hasGnss || report.avg.gnssVsDesign) {
      list.push({
        key: 'gnss',
        deltaKey: 'gd',
        avg: report.avg.gnssVsDesign,
        color: c.gnss,
        label: 'GNSS vs design',
        short: 'GNSS',
      });
    }
    if (report.hasUts || report.avg.utsVsDesign) {
      list.push({
        key: 'uts',
        deltaKey: 'ud',
        avg: report.avg.utsVsDesign,
        color: c.uts,
        label: 'UTS vs design',
        short: 'UTS',
      });
    }
    if (report.hasMachine || report.avg.machineVsDesign) {
      list.push({
        key: 'machine',
        deltaKey: 'kd',
        avg: report.avg.machineVsDesign,
        color: c.machine,
        label: 'Machine vs design',
        short: 'Mach',
      });
    }
    // Fallback if flags missing but rows have deltas
    if (!list.length) {
      var sample = report.rows[0];
      if (sample && sample.gd) {
        list.push({
          key: 'gnss',
          deltaKey: 'gd',
          avg: report.avg.gnssVsDesign,
          color: c.gnss,
          label: 'GNSS vs design',
          short: 'GNSS',
        });
      }
      if (sample && sample.ud) {
        list.push({
          key: 'uts',
          deltaKey: 'ud',
          avg: report.avg.utsVsDesign,
          color: c.uts,
          label: 'UTS vs design',
          short: 'UTS',
        });
      }
      if (sample && sample.kd) {
        list.push({
          key: 'machine',
          deltaKey: 'kd',
          avg: report.avg.machineVsDesign,
          color: c.machine,
          label: 'Machine vs design',
          short: 'Mach',
        });
      }
    }
    return list;
  }

  function liveDelta(src, design) {
    if (!src || !design) return null;
    if (src.z == null || design.z == null) return null;
    if (!Number.isFinite(src.z) || !Number.isFinite(design.z)) return null;
    var dn = src.n != null && design.n != null ? src.n - design.n : null;
    var de = src.e != null && design.e != null ? src.e - design.e : null;
    var dz = src.z - design.z;
    return {
      dn: dn,
      de: de,
      dz: dz,
      horiz:
        dn != null && de != null
          ? Math.sqrt(dn * dn + de * de)
          : null,
    };
  }

  function rowDelta(r, deltaKey) {
    var pre = r[deltaKey];
    if (pre && pre.dz != null && Number.isFinite(pre.dz)) return pre;
    if (deltaKey === 'gd') return liveDelta(r.gnss, r.design);
    if (deltaKey === 'ud') return liveDelta(r.uts, r.design);
    if (deltaKey === 'kd') return liveDelta(r.machine, r.design);
    return pre;
  }

  function computeMaxAbsZ(report, rows) {
    var series = seriesList(report);
    var maxAbs = 0.05;
    function considerDz(v) {
      if (v == null || !Number.isFinite(v)) return;
      maxAbs = Math.max(maxAbs, Math.abs(v));
    }
    series.forEach(function (s) {
      if (s.avg) considerDz(s.avg.dz);
    });
    var list = rows || report.rows;
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      series.forEach(function (s) {
        var d = rowDelta(r, s.deltaKey);
        if (d) considerDz(d.dz);
      });
    }
    return maxAbs;
  }

  /**
   * options.zoom: 1 = fit (~90th pct of points), 2 = 2×, etc.
   * options.hiddenSeries: { gnss:true, uts:true, machine:true } to hide
   */
  function drawBullseye(canvas, report, options) {
    options = options || {};
    var zoom = options.zoom != null && options.zoom > 0 ? options.zoom : 1;
    var hidden = options.hiddenSeries || {};
    var ctx = clear(canvas);
    var w = canvas.width;
    var h = canvas.height;
    var cx = w / 2;
    var cy = h / 2;
    var pad = 28;
    var radius = Math.min(w, h) / 2 - pad;
    var series = seriesList(report).filter(function (s) {
      return !hidden[s.key];
    });

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

    var rows = report.rows;
    var step = rows.length > BULLSEYE_MAX_DOTS ? Math.ceil(rows.length / BULLSEYE_MAX_DOTS) : 1;
    var radii = [];
    for (i = 0; i < rows.length; i += step) {
      var r = rows[i];
      series.forEach(function (s) {
        var d = rowDelta(r, s.deltaKey);
        if (!d || d.de == null || d.dn == null) return;
        if (!Number.isFinite(d.de) || !Number.isFinite(d.dn)) return;
        radii.push(Math.sqrt(d.de * d.de + d.dn * d.dn));
      });
    }
    series.forEach(function (s) {
      if (!s.avg || s.avg.de == null || s.avg.dn == null) return;
      radii.push(Math.sqrt(s.avg.de * s.avg.de + s.avg.dn * s.avg.dn));
    });
    radii.sort(function (a, b) {
      return a - b;
    });
    // Fit ~90th percentile so typical points spread; zoom multiplies scale
    var fitAbs = 0.05;
    if (radii.length) {
      var idx90 = Math.min(radii.length - 1, Math.floor(radii.length * 0.9));
      fitAbs = Math.max(0.02, radii[idx90] * 1.15);
    }
    var maxAbs = fitAbs / zoom;
    var scale = radius / maxAbs;

    function plotPoint(de, dn, color, label, rad) {
      var x = cx + de * scale;
      var y = cy - dn * scale;
      // Clamp labels that zoom off-canvas
      var onCanvas = x >= pad && x <= w - pad && y >= pad && y <= h - pad;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, rad || 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (label && onCanvas) {
        ctx.fillStyle = color;
        ctx.font = '600 11px "Open Sans", Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(label, x + 10, y + 4);
      }
    }

    // Draw machine under rovers so blue/orange stay visible
    var drawOrder = series.slice().sort(function (a, b) {
      var rank = { machine: 0, gnss: 1, uts: 2 };
      return (rank[a.key] || 0) - (rank[b.key] || 0);
    });

    drawOrder.forEach(function (s) {
      ctx.globalAlpha = s.key === 'machine' ? 0.28 : 0.45;
      for (i = 0; i < rows.length; i += step) {
        r = rows[i];
        var d = rowDelta(r, s.deltaKey);
        if (!d || d.de == null || d.dn == null) continue;
        var x = cx + d.de * scale;
        var y = cy - d.dn * scale;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(x, y, s.key === 'machine' ? 3 : 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    });

    drawOrder.forEach(function (s) {
      if (s.avg) plotPoint(s.avg.de, s.avg.dn, s.color, s.short + ' avg', 8);
    });

    ctx.fillStyle = '#252a2e';
    ctx.font = '12px "Open Sans", Arial, sans-serif';
    ctx.textAlign = 'left';
    var ringFt = maxAbs;
    var note =
      'Center = design · ring ≈ ±' +
      ringFt.toFixed(3) +
      ' ft · zoom ' +
      zoom.toFixed(1) +
      '×';
    if (step > 1) note += ' · dots 1/' + step;
    ctx.fillText(note, 12, h - 12);
  }

  function seriesOffsets(count) {
    if (count <= 1) return [0];
    if (count === 2) return [-12, 12];
    return [-18, 0, 18];
  }

  function drawZ(canvas, report, options) {
    options = options || {};
    var rows = options.rows || report.rows;
    var pxPerPile = options.pxPerPile || Z_PX_PER_PILE;
    var padL = 52;
    var padR = 24;
    var padT = 36;
    var padB = 86;
    var scrollOffset = options.scrollOffset || 0;
    var n = Math.max(1, rows.length);
    var h = options.height || 420;
    var series = seriesList(report);
    var offsets = seriesOffsets(series.length);

    var fullPlotW = n * pxPerPile;
    var fullW = padL + padR + fullPlotW;

    var w;
    if (options.viewWidth) {
      w = Math.min(options.viewWidth, MAX_CANVAS_W);
      canvas.width = w;
      canvas.height = h;
    } else {
      w = Math.min(fullW, MAX_CANVAS_W);
      if (!options.rows || options.rows === report.rows) {
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

    var maxAbs = (options.maxAbs != null ? options.maxAbs : computeMaxAbsZ(report)) * 1.1;

    function yOf(dz) {
      var mid = padT + (h - padT - padB) / 2;
      var half = (h - padT - padB) / 2;
      return mid - (dz / maxAbs) * half;
    }

    var yZero = yOf(0);
    var worldLeft = scrollOffset;
    var worldRight = scrollOffset + w;

    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = '#6a6e79';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, yZero);
    ctx.lineTo(w, yZero);
    ctx.stroke();
    ctx.setLineDash([]);

    series.forEach(function (s, si) {
      if (!s.avg) return;
      ctx.setLineDash(si === 0 ? [] : si === 1 ? [6, 4] : [2, 4]);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, yOf(s.avg.dz));
      ctx.lineTo(w, yOf(s.avg.dz));
      ctx.stroke();
      ctx.setLineDash([]);
    });

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

      series.forEach(function (s, si) {
        var d = rowDelta(r, s.deltaKey);
        if (!d) return;
        var x = cx + offsets[si];
        var y = yOf(d.dz);
        ctx.strokeStyle = s.color.replace(')', ',0.35)').replace('rgb', 'rgba').replace('#', '');
        // simple alpha via rgba from hex
        ctx.strokeStyle =
          'rgba(' +
          parseInt(s.color.slice(1, 3), 16) +
          ',' +
          parseInt(s.color.slice(3, 5), 16) +
          ',' +
          parseInt(s.color.slice(5, 7), 16) +
          ',0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, yZero);
        ctx.lineTo(x, y);
        ctx.stroke();
        var sel = selected && selected.id === r.id && selected.series === s.key;
        drawDot(x, y, s.color, sel ? 8 : 5, sel ? '#fbad26' : '#ffffff');
        hits.push({
          x: x,
          y: y,
          r: 14,
          id: r.id,
          series: s.key,
          label: s.label,
          color: s.color,
          row: r,
          plotted: { dz: d.dz, dn: d.dn, de: d.de, horiz: d.horiz },
        });
      });

      ctx.fillStyle = '#6a6e79';
      ctx.font = '10px "Open Sans", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(r.id), cx, h - padB + 18);
    }

    ctx.font = '11px "Open Sans", Arial, sans-serif';
    ctx.textAlign = 'left';
    var lx = padL;
    series.forEach(function (s) {
      drawDot(lx + 6, 14, s.color, 5);
      ctx.fillStyle = s.color;
      ctx.fillText(s.label, lx + 16, 18);
      lx += 150;
    });

    if (options.pageLabel) {
      ctx.fillStyle = '#6a6e79';
      ctx.textAlign = 'right';
      ctx.fillText(options.pageLabel, w - 12, 18);
    }

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
    x += 120;
    series.forEach(function (s, si) {
      if (!s.avg) return;
      lineSample(x, s.color, si === 0 ? [] : si === 1 ? [6, 4] : [2, 4]);
      ctx.fillStyle = s.color;
      ctx.fillText(s.short + ' avg ' + s.avg.dz.toFixed(3) + ' ft', x + 28, legY);
      x += 168;
    });

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

  /**
   * Per-pile landing plot: design at center, GNSS / UTS / machine as ΔE vs ΔN dots.
   */
  function drawPileLanding(canvas, row, report) {
    var w = canvas.width || 640;
    var h = canvas.height || 420;
    canvas.width = w;
    canvas.height = h;
    var ctx = clear(canvas);
    var c = colors();
    var series = seriesList(report || { rows: [row], avg: {}, hasGnss: !!row.gnss, hasUts: !!row.uts, hasMachine: !!row.machine });

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    var cx = w * 0.38;
    var cy = h / 2;
    var radius = Math.min(w * 0.32, h / 2 - 36);

    ctx.strokeStyle = '#e0e1e9';
    for (var i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (radius * i) / 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = '#9b9faa';
    ctx.beginPath();
    ctx.moveTo(cx - radius - 8, cy);
    ctx.lineTo(cx + radius + 8, cy);
    ctx.moveTo(cx, cy - radius - 8);
    ctx.lineTo(cx, cy + radius + 8);
    ctx.stroke();

    ctx.fillStyle = '#6a6e79';
    ctx.font = '11px "Open Sans", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('E', cx + radius + 14, cy + 4);
    ctx.fillText('W', cx - radius - 14, cy + 4);
    ctx.fillText('N', cx + 10, cy - radius - 10);
    ctx.fillText('S', cx + 10, cy + radius + 16);

    var maxAbs = 0.05;
    series.forEach(function (s) {
      var d = rowDelta(row, s.deltaKey);
      if (d) maxAbs = Math.max(maxAbs, Math.abs(d.de), Math.abs(d.dn), Math.abs(d.dz));
    });
    var scale = radius / (maxAbs * 1.15 || 0.05);

    // Design marker
    ctx.fillStyle = c.design;
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    series.forEach(function (s) {
      var d = rowDelta(row, s.deltaKey);
      if (!d) return;
      var x = cx + d.de * scale;
      var y = cy - d.dn * scale;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = s.color;
      ctx.font = '600 12px "Open Sans", Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(s.short, x + 11, y + 4);
    });

    // Side legend with Δ values
    var lx = w * 0.68;
    var ly = 40;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#252a2e';
    ctx.font = '700 13px "Open Sans", Arial, sans-serif';
    ctx.fillText('Pile ' + row.id + ' vs design', lx, ly);
    ly += 22;
    ctx.font = '11px "Open Sans", Arial, sans-serif';
    ctx.fillStyle = '#6a6e79';
    ctx.fillText('Center = design', lx, ly);
    ly += 20;

    function legendLine(label, color, d) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(lx + 6, ly - 3, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#252a2e';
      ctx.font = '600 12px "Open Sans", Arial, sans-serif';
      ctx.fillText(label, lx + 16, ly);
      ly += 16;
      if (d) {
        ctx.fillStyle = '#6a6e79';
        ctx.font = '11px "Open Sans", Arial, sans-serif';
        ctx.fillText(
          'ΔN ' +
            d.dn.toFixed(3) +
            '  ΔE ' +
            d.de.toFixed(3) +
            '  ΔZ ' +
            d.dz.toFixed(3) +
            '  H ' +
            d.horiz.toFixed(3) +
            ' ft',
          lx + 16,
          ly
        );
        ly += 22;
      } else {
        ctx.fillStyle = '#6a6e79';
        ctx.fillText('— not loaded for this pile set', lx + 16, ly);
        ly += 22;
      }
    }

    series.forEach(function (s) {
      legendLine(s.label, s.color, rowDelta(row, s.deltaKey));
    });

    return toDataUrl(canvas);
  }

  function buildPilePageImages(report, limits) {
    limits = limits || {};
    var maxPiles = limits.maxPiles != null ? limits.maxPiles : 250;
    var pages = [];
    var total = report.rows.length;
    var renderCount = Math.min(total, maxPiles);
    var canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 540;
    for (var i = 0; i < renderCount; i++) {
      pages.push({
        id: report.rows[i].id,
        row: report.rows[i],
        image: drawPileLanding(canvas, report.rows[i], report),
      });
    }
    return {
      pages: pages,
      truncated: renderCount < total,
      totalPiles: total,
      renderedPiles: renderCount,
    };
  }

  function toDataUrl(canvas) {
    try {
      return canvas.toDataURL('image/png');
    } catch (e) {
      return '';
    }
  }

  /**
   * Plan view (E vs N) colored by N–S row |ΔZ| vs spec,
   * plus sorted |ΔZ| bars with a horizontal spec line.
   */
  function drawPileToPileZ(planCanvas, barCanvas, ptp) {
    drawPileToPilePlan(planCanvas, ptp);
    drawPileToPileBars(barCanvas, ptp);
  }

  function drawPileToPilePlan(canvas, ptp) {
    if (!canvas) return;
    var ctx = clear(canvas);
    var w = canvas.width;
    var h = canvas.height;
    var pad = 44;
    ctx.fillStyle = '#f7f8fa';
    ctx.fillRect(0, 0, w, h);

    if (!ptp || !ptp.points || ptp.points.length < 2) {
      ctx.fillStyle = '#6a6e79';
      ctx.font = '13px "Open Sans", Arial, sans-serif';
      ctx.fillText('Need at least 2 piles with Z for pile-to-pile check.', 24, h / 2);
      return;
    }

    var pts = ptp.points;
    var byIndex = Object.create(null);
    var minN = Infinity;
    var maxN = -Infinity;
    var minE = Infinity;
    var maxE = -Infinity;
    for (var i = 0; i < pts.length; i++) {
      byIndex[pts[i].index] = pts[i];
      minN = Math.min(minN, pts[i].n);
      maxN = Math.max(maxN, pts[i].n);
      minE = Math.min(minE, pts[i].e);
      maxE = Math.max(maxE, pts[i].e);
    }
    var spanN = Math.max(maxN - minN, 1e-6);
    var spanE = Math.max(maxE - minE, 1e-6);
    var plotW = w - pad * 2;
    var plotH = h - pad * 2 - 18;
    var scale = Math.min(plotW / spanE, plotH / spanN) * 0.92;
    var cx = pad + plotW / 2;
    var cy = pad + plotH / 2;
    var midE = (minE + maxE) / 2;
    var midN = (minN + maxN) / 2;

    function toXY(p) {
      return {
        x: cx + (p.e - midE) * scale,
        y: cy - (p.n - midN) * scale,
      };
    }

    ctx.strokeStyle = '#e0e1e9';
    ctx.lineWidth = 1;
    ctx.strokeRect(pad, pad, plotW, plotH);

    // Draw N–S row edges: green within spec, red over
    var edges = ptp.edges || [];
    ctx.lineWidth = 1.5;
    for (i = 0; i < edges.length; i++) {
      var edge = edges[i];
      var pa = byIndex[edge.indexA];
      var pb = byIndex[edge.indexB];
      if (!pa || !pb) continue;
      var a = toXY(pa);
      var b = toXY(pb);
      ctx.strokeStyle = edge.pass ? 'rgba(0, 102, 56, 0.35)' : 'rgba(218, 33, 44, 0.7)';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    for (i = 0; i < pts.length; i++) {
      var p = pts[i];
      var xy = toXY(p);
      ctx.beginPath();
      ctx.fillStyle = p.pass ? '#006638' : '#da212c';
      ctx.arc(xy.x, xy.y, p.pass ? 4 : 5.5, 0, Math.PI * 2);
      ctx.fill();
      if (!p.pass) {
        ctx.strokeStyle = '#8a1018';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    ctx.fillStyle = '#6a6e79';
    ctx.font = '11px "Open Sans", Arial, sans-serif';
    ctx.fillText('E →', w - pad - 28, h - 10);
    ctx.save();
    ctx.translate(12, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('N →', 0, 0);
    ctx.restore();

    ctx.fillStyle = '#006638';
    ctx.beginPath();
    ctx.arc(pad + 8, h - 12, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#252a2e';
    ctx.fillText('Within spec', pad + 16, h - 8);
    ctx.fillStyle = '#da212c';
    ctx.beginPath();
    ctx.arc(pad + 110, h - 12, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#252a2e';
    ctx.fillText('Over spec (links = N–S in row)', pad + 118, h - 8);
  }

  function drawPileToPileBars(canvas, ptp) {
    if (!canvas) return;
    var ctx = clear(canvas);
    var w = canvas.width;
    var h = canvas.height;
    var padL = 48;
    var padR = 16;
    var padT = 28;
    var padB = 36;
    ctx.fillStyle = '#f7f8fa';
    ctx.fillRect(0, 0, w, h);

    if (!ptp || !ptp.points || ptp.points.length < 2) {
      ctx.fillStyle = '#6a6e79';
      ctx.font = '13px "Open Sans", Arial, sans-serif';
      ctx.fillText('No pile-to-pile |ΔZ| data.', 24, h / 2);
      return;
    }

    var sorted = (ptp.edges && ptp.edges.length ? ptp.edges : ptp.points)
      .slice()
      .sort(function (a, b) {
        return b.absDz - a.absDz;
      });
    var spec = ptp.specFt != null ? ptp.specFt : 0.02;
    var maxY = Math.max(
      spec * 1.5,
      ((sorted[0] && sorted[0].absDz) || 0) * 1.15,
      0.03
    );
    var plotW = w - padL - padR;
    var plotH = h - padT - padB;
    var n = sorted.length;
    var gap = n > 80 ? 0 : 1;
    var barW = Math.max(1, (plotW - gap * (n - 1)) / n);

    ctx.strokeStyle = '#cbcdd6';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + plotH);
    ctx.lineTo(padL + plotW, padT + plotH);
    ctx.stroke();

    // Spec line
    var specY = padT + plotH - (spec / maxY) * plotH;
    ctx.strokeStyle = '#e36c0a';
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(padL, specY);
    ctx.lineTo(padL + plotW, specY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#e36c0a';
    ctx.font = '11px "Open Sans", Arial, sans-serif';
    ctx.fillText('Spec ' + spec.toFixed(3) + ' ft', padL + 4, Math.max(padT + 12, specY - 4));

    for (var i = 0; i < n; i++) {
      var p = sorted[i];
      var bh = ((p.absDz || 0) / maxY) * plotH;
      var x = padL + i * (barW + gap);
      var y = padT + plotH - bh;
      ctx.fillStyle = p.pass ? '#006638' : '#da212c';
      ctx.fillRect(x, y, Math.max(barW, 1), Math.max(bh, 1));
    }

    ctx.fillStyle = '#6a6e79';
    ctx.font = '11px "Open Sans", Arial, sans-serif';
    ctx.fillText('0', padL - 28, padT + plotH + 4);
    ctx.fillText(maxY.toFixed(3), padL - 40, padT + 10);
    ctx.fillText(
      '|(ΔZ_ab−des)_i − (ΔZ_ab−des)_j| along N–S pairs (ft) — largest first',
      padL,
      h - 10
    );
  }

  return {
    drawBullseye: drawBullseye,
    drawZ: drawZ,
    bindZViewport: bindZViewport,
    hitTestZ: hitTestZ,
    buildZPageImages: buildZPageImages,
    drawPileLanding: drawPileLanding,
    buildPilePageImages: buildPilePageImages,
    drawPileToPileZ: drawPileToPileZ,
    toDataUrl: toDataUrl,
    computeMaxAbsZ: computeMaxAbsZ,
    seriesList: seriesList,
    Z_PX_PER_PILE: Z_PX_PER_PILE,
    Z_PDF_PILES_PER_PAGE: Z_PDF_PILES_PER_PAGE,
  };
})();
