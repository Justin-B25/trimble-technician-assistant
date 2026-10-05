/**
 * Batter math from Top Mount rim shots grouped by pile ID.
 * Bottom/Top centers = average of B1–B3 / T1–T3.
 * ΔN / ΔE / ΔXY / ΔZ / Batter = ΔXY÷ΔZ
 */
var BatterCalc = (function () {
  function avgPts(pts) {
    if (!pts || !pts.length) return null;
    var n = 0;
    var e = 0;
    var z = 0;
    for (var i = 0; i < pts.length; i++) {
      n += pts[i].n;
      e += pts[i].e;
      z += pts[i].z;
    }
    var c = pts.length;
    return { n: n / c, e: e / c, z: z / c, count: c };
  }

  function dist2d(a, b) {
    return Math.sqrt(Math.pow(a.n - b.n, 2) + Math.pow(a.e - b.e, 2));
  }

  function azimuthDeg(dn, de) {
    if (dn == null || de == null || !Number.isFinite(dn) || !Number.isFinite(de)) return null;
    if (Math.abs(dn) < 1e-12 && Math.abs(de) < 1e-12) return null;
    var az = (Math.atan2(de, dn) * 180) / Math.PI;
    if (az < 0) az += 360;
    return az;
  }

  function parseNum(v) {
    if (v == null || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  function pointAtZ(bottom, top, zCut) {
    if (!bottom || !top || zCut == null || !Number.isFinite(zCut)) return null;
    var dz = top.z - bottom.z;
    if (Math.abs(dz) < 1e-12) {
      return { n: top.n, e: top.e, z: zCut, t: null, extrapolated: true };
    }
    var t = (zCut - bottom.z) / dz;
    return {
      n: bottom.n + t * (top.n - bottom.n),
      e: bottom.e + t * (top.e - bottom.e),
      z: zCut,
      t: t,
      extrapolated: t < -0.02 || t > 1.02,
    };
  }

  function favorLabel(dn, de) {
    if (dn == null || de == null) return '—';
    var absN = Math.abs(dn);
    var absE = Math.abs(de);
    var eps = 1e-9;
    if (absN < eps && absE < eps) return 'Plumb (no plan offset)';
    var ns = absN < eps ? '' : dn > 0 ? 'N' : 'S';
    var ew = absE < eps ? '' : de > 0 ? 'E' : 'W';
    if (ns && ew) {
      if (absN >= absE * 2) return 'leans ' + ns;
      if (absE >= absN * 2) return 'leans ' + ew;
      return 'leans ' + ns + ew;
    }
    if (ns) return 'leans ' + ns;
    return 'leans ' + ew;
  }

  function chordOdEstimate(pts) {
    if (!pts || pts.length < 3) return null;
    // mean of pairwise plan distances ≈ chord of 120° on circle → OD = chord / (√3/2) = chord * 2/√3
    var chords = [];
    for (var i = 0; i < pts.length; i++) {
      for (var j = i + 1; j < pts.length; j++) {
        chords.push(dist2d(pts[i], pts[j]));
      }
    }
    if (!chords.length) return null;
    var sum = 0;
    for (var k = 0; k < chords.length; k++) sum += chords[k];
    var meanChord = sum / chords.length;
    var od = meanChord * (2 / Math.sqrt(3));
    return { meanChord: meanChord, od: od };
  }

  function groupByPile(points) {
    var piles = Object.create(null);
    for (var i = 0; i < (points || []).length; i++) {
      var p = points[i];
      if (!p || !p.parsed) continue;
      var id = p.parsed.pileId;
      if (!piles[id]) {
        piles[id] = { pileId: id, bottom: {}, top: {}, all: [] };
      }
      var slot = p.parsed.ring === 'T' ? piles[id].top : piles[id].bottom;
      if (slot[p.parsed.idx]) {
        // last wins
      }
      slot[p.parsed.idx] = p;
      piles[id].all.push(p);
    }
    return piles;
  }

  function computePile(pile, design) {
    design = design || {};
    var warnings = [];
    var bPts = [1, 2, 3]
      .map(function (i) {
        return pile.bottom[i];
      })
      .filter(Boolean);
    var tPts = [1, 2, 3]
      .map(function (i) {
        return pile.top[i];
      })
      .filter(Boolean);

    var missingB = [1, 2, 3].filter(function (i) {
      return !pile.bottom[i];
    });
    var missingT = [1, 2, 3].filter(function (i) {
      return !pile.top[i];
    });
    if (missingB.length) warnings.push('Missing bottom: B' + missingB.join(', B'));
    if (missingT.length) warnings.push('Missing top: T' + missingT.join(', T'));

    var bottom = avgPts(bPts);
    var top = avgPts(tPts);
    if (!bottom || !top || bPts.length < 3 || tPts.length < 3) {
      return {
        pileId: pile.pileId,
        ok: false,
        warnings: warnings.length ? warnings : ['Need B1–B3 and T1–T3'],
        bottomPts: bPts,
        topPts: tPts,
        bottom: bottom,
        top: top,
      };
    }

    var dn = top.n - bottom.n;
    var de = top.e - bottom.e;
    var dz = top.z - bottom.z;
    var dxy = Math.sqrt(dn * dn + de * de);
    var length3d = Math.sqrt(dn * dn + de * de + dz * dz);
    var batter = null;
    var angleDeg = null; // from vertical
    var inclineFromHorizontalDeg = null; // smart level along pile shaft
    if (Math.abs(dz) > 1e-12) {
      batter = dxy / Math.abs(dz);
      angleDeg = (Math.atan2(dxy, Math.abs(dz)) * 180) / Math.PI;
      inclineFromHorizontalDeg = 90 - angleDeg;
    } else {
      warnings.push('ΔZ ≈ 0 — cannot compute batter / inclination');
    }

    var botOd = chordOdEstimate(bPts);
    var topOd = chordOdEstimate(tPts);

    var vector = {
      from: 'bottom_center',
      to: 'top_center',
      dn: dn,
      de: de,
      dz: dz,
      dxy: dxy,
      length3d: length3d,
      asCoordinates: { dN: dn, dE: de, dZ: dz },
    };

    var az = azimuthDeg(dn, de);

    var inclination = {
      fromVerticalDeg: angleDeg,
      fromHorizontalDeg: inclineFromHorizontalDeg,
      smartLevelAlongPileDeg: inclineFromHorizontalDeg,
      smartLevelNote:
        inclineFromHorizontalDeg != null
          ? 'Place smart level along the tube. Expect ' +
            inclineFromHorizontalDeg.toFixed(2) +
            '° from horizontal (or ' +
            angleDeg.toFixed(2) +
            '° from vertical/plumb).'
          : 'Need ΔZ to compute inclination',
    };

    var designN = parseNum(design.n);
    var designE = parseNum(design.e);
    var designZ = parseNum(design.z);
    var designIncl = parseNum(design.inclinationFromVerticalDeg);
    var hasDesignXy = designN != null && designE != null;

    var cutoff;
    if (designZ != null) {
      cutoff = pointAtZ(bottom, top, designZ);
      if (cutoff && cutoff.extrapolated) {
        warnings.push('Design cut-off Z is outside the measured top/bottom range — XY is extrapolated along the pile axis');
      }
    } else {
      cutoff = { n: top.n, e: top.e, z: top.z, t: 1, extrapolated: false };
    }

    var dN = hasDesignXy && cutoff ? cutoff.n - designN : null;
    var dE = hasDesignXy && cutoff ? cutoff.e - designE : null;
    var dZTop = designZ != null ? top.z - designZ : null;
    var planMiss = dN != null && dE != null ? Math.sqrt(dN * dN + dE * dE) : null;
    var dIncl = designIncl != null && angleDeg != null ? angleDeg - designIncl : null;
    var cutFill = null;
    if (dZTop != null) {
      if (Math.abs(dZTop) < 1e-4) cutFill = 'ON GRADE';
      else if (dZTop > 0) cutFill = 'CUT';
      else cutFill = 'FILL';
    }

    var vsDesign = {
      hasXy: hasDesignXy,
      hasZ: designZ != null,
      hasIncl: designIncl != null,
      design: {
        n: designN,
        e: designE,
        z: designZ,
        inclinationFromVerticalDeg: designIncl,
      },
      cutoff: cutoff,
      dN: dN,
      dE: dE,
      dZ: dZTop,
      measuredTopZ: top.z,
      cutFill: cutFill,
      planMiss: planMiss,
      dInclinationDeg: dIncl,
    };

    return {
      pileId: pile.pileId,
      ok: true,
      warnings: warnings,
      bottomPts: bPts,
      topPts: tPts,
      bottom: bottom,
      top: top,
      bottomCenter: { n: bottom.n, e: bottom.e, z: bottom.z },
      topCenter: { n: top.n, e: top.e, z: top.z },
      cutoff: cutoff,
      vector: vector,
      inclination: inclination,
      azimuthDeg: az,
      vsDesign: vsDesign,
      dn: dn,
      de: de,
      dz: dz,
      dxy: dxy,
      length3d: length3d,
      batter: batter,
      angleDeg: angleDeg,
      inclineFromHorizontalDeg: inclineFromHorizontalDeg,
      favor: favorLabel(dn, de),
      bottomOd: botOd,
      topOd: topOd,
      measuredPosition: {
        bottom: { n: bottom.n, e: bottom.e, z: bottom.z },
        top: { n: top.n, e: top.e, z: top.z },
        // Cut-off without design Z = measured top-of-pile center
        cutoff: { n: top.n, e: top.e, z: top.z },
      },
      csvMeta: (function () {
        var th = [];
        var tilts = [];
        var pitches = [];
        var rolls = [];
        var auto = '';
        var leans = [];
        function collect(pts) {
          (pts || []).forEach(function (p) {
            if (p.targetHeight != null) th.push(Math.abs(p.targetHeight));
            if (p.tiltAngleDeg != null) tilts.push(p.tiltAngleDeg);
            if (p.pitchDeg != null) pitches.push(p.pitchDeg);
            if (p.rollDeg != null) rolls.push(p.rollDeg);
            if (p.leanDeg != null) leans.push(p.leanDeg);
            if (!auto && p.autoPoleHeight) auto = p.autoPoleHeight;
          });
        }
        collect(bPts);
        collect(tPts);
        function med(a) {
          if (!a.length) return null;
          a = a.slice().sort(function (x, y) { return x - y; });
          var m = Math.floor(a.length / 2);
          return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
        }
        function shotRow(p) {
          return {
            name: p.name,
            ring: p.parsed && p.parsed.ring,
            idx: p.parsed && p.parsed.idx,
            targetHeight: p.targetHeight,
            pitchDeg: p.pitchDeg,
            rollDeg: p.rollDeg,
            leanDeg: p.leanDeg,
            inverted: !!p.inverted,
            tiltAngleDeg: p.tiltAngleDeg,
          };
        }
        return {
          targetHeightAbs: med(th),
          tiltAngleDeg: med(tilts),
          pitchDeg: med(pitches),
          rollDeg: med(rolls),
          leanDeg: med(leans),
          autoPoleHeight: auto,
          shots: (bPts || []).map(shotRow).concat((tPts || []).map(shotRow)),
        };
      })(),
    };
  }

  function buildReport(points, design) {
    var groups = groupByPile(points);
    var ids = Object.keys(groups).sort(function (a, b) {
      var na = Number(a);
      var nb = Number(b);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return String(a).localeCompare(String(b));
    });
    var rows = ids.map(function (id) {
      return computePile(groups[id], design);
    });
    var okRows = rows.filter(function (r) {
      return r.ok;
    });

    function avg(key) {
      if (!okRows.length) return null;
      var s = 0;
      for (var i = 0; i < okRows.length; i++) s += okRows[i][key];
      return s / okRows.length;
    }

    return {
      rows: rows,
      okCount: okRows.length,
      pileCount: rows.length,
      pointCount: (points || []).length,
      avg: {
        dn: avg('dn'),
        de: avg('de'),
        dz: avg('dz'),
        dxy: avg('dxy'),
        batter: avg('batter'),
      },
      design: design || {},
    };
  }

  function fmt(n, digits) {
    if (n == null || !Number.isFinite(n)) return '—';
    return n.toFixed(digits == null ? 3 : digits);
  }

  function fmtBatter(b) {
    if (b == null || !Number.isFinite(b)) return '—';
    // show ratio and 1:V style
    var oneTo = b > 1e-9 ? 1 / b : null;
    var ratio = b.toFixed(4);
    if (oneTo != null && Number.isFinite(oneTo)) {
      return ratio + '  (≈ 1:' + oneTo.toFixed(1) + ')';
    }
    return ratio;
  }

  function rowsToCsv(report) {
    var header = [
      'PileID',
      'BottomCenter_N',
      'BottomCenter_E',
      'BottomCenter_Z',
      'TopCenter_N',
      'TopCenter_E',
      'TopCenter_Z',
      'Vector_dN_top_minus_bottom',
      'Vector_dE_top_minus_bottom',
      'Vector_dZ_top_minus_bottom',
      'Vector_plan_XY',
      'Vector_3D_length',
      'Incline_from_vertical_deg',
      'Incline_from_horizontal_deg_smart_level',
      'Batter_XY_over_Z',
      'Batter_Angle_deg',
      'Azimuth_from_North_deg',
      'Lean_Direction',
      'Cutoff_N',
      'Cutoff_E',
      'Cutoff_Z',
      'Design_N',
      'Design_E',
      'Design_Z',
      'Design_Inclination_from_vertical_deg',
      'Dev_dN_meas_minus_design',
      'Dev_dE_meas_minus_design',
      'Dev_dZ_top_minus_design',
      'CutFill',
      'Dev_plan_XY',
      'Dev_Inclination_deg',
      'Bottom_OD_est',
      'Top_OD_est',
      'Status',
      'Warnings',
    ];
    var lines = [header.join(',')];
    report.rows.forEach(function (r) {
      function nz(p, k) {
        return p && p[k] != null ? p[k] : '';
      }
      lines.push(
        [
          r.pileId,
          nz(r.bottom, 'n'),
          nz(r.bottom, 'e'),
          nz(r.bottom, 'z'),
          nz(r.top, 'n'),
          nz(r.top, 'e'),
          nz(r.top, 'z'),
          r.dn != null ? r.dn : '',
          r.de != null ? r.de : '',
          r.dz != null ? r.dz : '',
          r.dxy != null ? r.dxy : '',
          r.length3d != null ? r.length3d : '',
          r.angleDeg != null ? r.angleDeg : '',
          r.inclineFromHorizontalDeg != null ? r.inclineFromHorizontalDeg : '',
          r.batter != null ? r.batter : '',
          r.angleDeg != null ? r.angleDeg : '',
          r.azimuthDeg != null ? r.azimuthDeg : '',
          r.favor || '',
          r.cutoff ? r.cutoff.n : '',
          r.cutoff ? r.cutoff.e : '',
          r.cutoff ? r.cutoff.z : '',
          r.vsDesign && r.vsDesign.design.n != null ? r.vsDesign.design.n : '',
          r.vsDesign && r.vsDesign.design.e != null ? r.vsDesign.design.e : '',
          r.vsDesign && r.vsDesign.design.z != null ? r.vsDesign.design.z : '',
          r.vsDesign && r.vsDesign.design.inclinationFromVerticalDeg != null
            ? r.vsDesign.design.inclinationFromVerticalDeg
            : '',
          r.vsDesign && r.vsDesign.dN != null ? r.vsDesign.dN : '',
          r.vsDesign && r.vsDesign.dE != null ? r.vsDesign.dE : '',
          r.vsDesign && r.vsDesign.dZ != null ? r.vsDesign.dZ : '',
          r.vsDesign && r.vsDesign.cutFill ? r.vsDesign.cutFill : '',
          r.vsDesign && r.vsDesign.planMiss != null ? r.vsDesign.planMiss : '',
          r.vsDesign && r.vsDesign.dInclinationDeg != null ? r.vsDesign.dInclinationDeg : '',
          r.bottomOd ? r.bottomOd.od : '',
          r.topOd ? r.topOd.od : '',
          r.ok ? 'OK' : 'INCOMPLETE',
          (r.warnings || []).join('; ').replace(/,/g, ';'),
        ].join(',')
      );
    });
    return lines.join('\r\n');
  }

  function fmtCoord(p) {
    if (!p) return '—';
    return 'N ' + fmt(p.n) + '   E ' + fmt(p.e) + '   Z ' + fmt(p.z);
  }

  function fmtVector(r) {
    if (!r || r.dn == null) return '—';
    return 'ΔN ' + fmt(r.dn) + '   ΔE ' + fmt(r.de) + '   ΔZ ' + fmt(r.dz);
  }

  function fmtInclination(r) {
    if (!r || r.angleDeg == null) return '—';
    return (
      r.angleDeg.toFixed(2) +
      '° from vertical  ·  smart level along pile: ' +
      r.inclineFromHorizontalDeg.toFixed(2) +
      '° from horizontal'
    );
  }

  function fmtAzimuth(az) {
    if (az == null || !Number.isFinite(az)) return '— (plumb / no plan lean)';
    return az.toFixed(1) + '° from North (clockwise toward East)';
  }

  function fmtDeviation(vs) {
    if (!vs || !vs.hasXy) return 'Enter design N/E (Y/X) to compute ΔN / ΔE';
    return (
      'ΔN (Y) ' +
      fmt(vs.dN) +
      '   ΔE (X) ' +
      fmt(vs.dE) +
      '   plan miss ' +
      fmt(vs.planMiss)
    );
  }

  function fmtCutFill(vs) {
    if (!vs || !vs.hasZ || vs.dZ == null) return 'Enter design cut-off Z to compute cut / fill';
    var mag = Math.abs(vs.dZ);
    var line =
      'ΔZ ' +
      fmt(vs.dZ) +
      '  (measured top Z ' +
      fmt(vs.measuredTopZ) +
      ' − design ' +
      fmt(vs.design.z) +
      ')';
    if (vs.cutFill === 'ON GRADE') return line + '  ·  on grade';
    if (vs.cutFill === 'CUT') return line + '  ·  CUT ' + fmt(mag) + ' (top is high — cut down)';
    if (vs.cutFill === 'FILL') return line + '  ·  FILL ' + fmt(mag) + ' (top is low — short)';
    return line;
  }

  function fmtOd(est) {
    if (!est || est.od == null || !Number.isFinite(est.od)) return '—';
    var ft = est.od;
    var inches = ft * 12;
    return fmt(ft, 3) + ' US ft  (' + inches.toFixed(1) + ' in)  ·  tape check';
  }

  function fmtOdPair(bottomOd, topOd) {
    var b = fmtOd(bottomOd);
    var t = fmtOd(topOd);
    if (b === '—' && t === '—') return 'Need 3 rim shots at ~120° to estimate OD';
    return 'Bottom ' + b + '   ·   Top ' + t;
  }

  return {
    buildReport: buildReport,
    computePile: computePile,
    azimuthDeg: azimuthDeg,
    favorLabel: favorLabel,
    parseNum: parseNum,
    fmt: fmt,
    fmtBatter: fmtBatter,
    fmtCoord: fmtCoord,
    fmtVector: fmtVector,
    fmtInclination: fmtInclination,
    fmtAzimuth: fmtAzimuth,
    fmtDeviation: fmtDeviation,
    fmtCutFill: fmtCutFill,
    fmtOd: fmtOd,
    fmtOdPair: fmtOdPair,
    rowsToCsv: rowsToCsv,
  };
})();
