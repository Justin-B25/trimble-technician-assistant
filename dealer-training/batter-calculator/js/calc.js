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

  function computePile(pile) {
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
    var batter = null;
    var angleDeg = null;
    if (Math.abs(dz) > 1e-12) {
      batter = dxy / Math.abs(dz);
      angleDeg = (Math.atan2(dxy, Math.abs(dz)) * 180) / Math.PI;
    } else {
      warnings.push('ΔZ ≈ 0 — cannot compute batter ratio');
    }

    var botOd = chordOdEstimate(bPts);
    var topOd = chordOdEstimate(tPts);

    return {
      pileId: pile.pileId,
      ok: true,
      warnings: warnings,
      bottomPts: bPts,
      topPts: tPts,
      bottom: bottom,
      top: top,
      dn: dn,
      de: de,
      dz: dz,
      dxy: dxy,
      batter: batter,
      angleDeg: angleDeg,
      favor: favorLabel(dn, de),
      bottomOd: botOd,
      topOd: topOd,
    };
  }

  function buildReport(points) {
    var groups = groupByPile(points);
    var ids = Object.keys(groups).sort(function (a, b) {
      var na = Number(a);
      var nb = Number(b);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return String(a).localeCompare(String(b));
    });
    var rows = ids.map(function (id) {
      return computePile(groups[id]);
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
      'Bottom_N',
      'Bottom_E',
      'Bottom_Z',
      'Top_N',
      'Top_E',
      'Top_Z',
      'Delta_N',
      'Delta_E',
      'Delta_XY',
      'Delta_Z',
      'Batter_XY_over_Z',
      'Batter_Angle_deg',
      'Lean_Direction',
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
          r.dxy != null ? r.dxy : '',
          r.dz != null ? r.dz : '',
          r.batter != null ? r.batter : '',
          r.angleDeg != null ? r.angleDeg : '',
          r.favor || '',
          r.bottomOd ? r.bottomOd.od : '',
          r.topOd ? r.topOd.od : '',
          r.ok ? 'OK' : 'INCOMPLETE',
          (r.warnings || []).join('; ').replace(/,/g, ';'),
        ].join(',')
      );
    });
    return lines.join('\r\n');
  }

  return {
    buildReport: buildReport,
    computePile: computePile,
    favorLabel: favorLabel,
    fmt: fmt,
    fmtBatter: fmtBatter,
    rowsToCsv: rowsToCsv,
  };
})();
