/**
 * ST30 Top Mount Exercise — tip-down / tip-up vs BENCH + up-vs-down compare.
 */
var TipDevCalc = (function () {
  var TILTS = [0, 5, 15, 30];
  var TIP_SPECS = [
    { heightM: 0.2, label: '0.2 m Top Mount', specs: { 0: [0, 0], 5: [0, 1], 15: [1, 1], 30: [1, 1] } },
    { heightM: 1.6, label: '1.6 m rod', specs: { 0: [0, 0], 5: [3, 1], 15: [5, 1], 30: [8, 2] } },
    { heightM: 2.0, label: '2.0 m rod', specs: { 0: [0, 0], 5: [4, 1], 15: [7, 1], 30: [11, 3] } },
  ];

  function delta(meas, bench) {
    if (!meas || !bench) return null;
    var dn = meas.n - bench.n, de = meas.e - bench.e, dz = meas.z - bench.z;
    return { dn: dn, de: de, dz: dz, horiz: Math.sqrt(dn * dn + de * de) };
  }

  function fmt(n, digits) {
    if (n == null || !Number.isFinite(n)) return '—';
    return n.toFixed(digits == null ? 3 : digits);
  }

  function fmtMm(meters, digits) {
    if (meters == null || !Number.isFinite(meters)) return '—';
    return (meters * 1000).toFixed(digits == null ? 1 : digits);
  }

  function toMeters(value, unit) {
    var n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    var u = String(unit || 'm').toLowerCase();
    if (u === 'ft' || u === 'usft' || u === 'us ft') return n * 0.3048;
    if (u === 'in' || u === 'inch') return n * 0.0254;
    return n;
  }

  function pickSpecRow(heightM) {
    if (heightM == null || !Number.isFinite(heightM)) return TIP_SPECS[0];
    var best = TIP_SPECS[0], bestDist = Math.abs(heightM - best.heightM);
    for (var i = 1; i < TIP_SPECS.length; i++) {
      var d = Math.abs(heightM - TIP_SPECS[i].heightM);
      if (d < bestDist) { best = TIP_SPECS[i]; bestDist = d; }
    }
    return best;
  }

  function passCheck(d, tilt, specRow) {
    if (!d || !specRow) return null;
    var sp = specRow.specs[tilt];
    if (!sp) return null;
    var horizMm = d.horiz * 1000, zMm = Math.abs(d.dz) * 1000;
    return {
      passXY: horizMm <= sp[0] + 0.5,
      passZ: zMm <= sp[1] + 0.5,
      pass: horizMm <= sp[0] + 0.5 && zMm <= sp[1] + 0.5,
      specXY: sp[0], specZ: sp[1], horizMm: horizMm, zMm: zMm,
    };
  }

  function indexShots(points) {
    var bench = null, a = Object.create(null), b = Object.create(null), warnings = [];
    for (var i = 0; i < (points || []).length; i++) {
      var p = points[i];
      if (!p || !p.parsed) continue;
      if (p.parsed.kind === 'bench') {
        if (bench) warnings.push('Multiple benchmarks — using last: ' + p.name);
        bench = p; continue;
      }
      if (p.parsed.kind === 'shot') {
        var bucket = p.parsed.activity === 'B' ? b : a;
        if (bucket[p.parsed.tilt]) warnings.push('Duplicate ' + p.parsed.label + ' — using last');
        bucket[p.parsed.tilt] = p;
      }
    }
    return { bench: bench, activityA: a, activityB: b, warnings: warnings };
  }

  function buildActivityRows(shots, bench, label, specRow) {
    return TILTS.map(function (tilt) {
      var shot = shots[tilt] || null;
      var d = shot && bench ? delta(shot, bench) : null;
      return {
        activity: label, tilt: tilt,
        tiltLabel: tilt === 0 ? '0° Plumb' : tilt + '°',
        pointName: shot ? shot.name : '—', shot: shot, d: d,
        check: d ? passCheck(d, tilt, specRow) : null,
      };
    });
  }

  function buildCompareRows(aShots, bShots) {
    return TILTS.map(function (tilt) {
      var a = aShots[tilt] || null, b = bShots[tilt] || null;
      return {
        tilt: tilt, tiltLabel: tilt === 0 ? '0° Plumb' : tilt + '°',
        tipDownName: a ? a.name : '—', tipUpName: b ? b.name : '—',
        tipDown: a, tipUp: b, d: a && b ? delta(b, a) : null,
      };
    });
  }

  function summarize(rows) {
    var list = rows.filter(function (r) { return r.d; });
    if (!list.length) return null;
    var sumH = 0, sumZ = 0, maxH = 0, maxHTilt = null;
    for (var i = 0; i < list.length; i++) {
      sumH += list[i].d.horiz; sumZ += Math.abs(list[i].d.dz);
      if (list[i].d.horiz >= maxH) { maxH = list[i].d.horiz; maxHTilt = list[i].tiltLabel; }
    }
    return { count: list.length, avgHoriz: sumH / list.length, avgAbsZ: sumZ / list.length, maxHoriz: maxH, maxHorizTilt: maxHTilt };
  }

  function buildReport(points, opts) {
    opts = opts || {};
    var heightM = toMeters(opts.rodHeight, opts.rodUnit || 'm');
    var specRow = pickSpecRow(heightM != null ? heightM : 0.2);
    var indexed = indexShots(points);
    var warnings = indexed.warnings.slice();
    if (!indexed.bench) warnings.push('No benchmark found. Name a point BENCH (or BENCHMARK / CP / KNOWN).');

    var tipDown = buildActivityRows(indexed.activityA, indexed.bench, 'Tip DOWN (Activity A)', specRow);
    var tipUp = buildActivityRows(indexed.activityB, indexed.bench, 'Tip UP (Activity B)', specRow);
    var compare = buildCompareRows(indexed.activityA, indexed.activityB);

    return {
      bench: indexed.bench, rodHeightM: heightM, rodHeightInput: opts.rodHeight,
      rodUnit: opts.rodUnit || 'm', specRow: specRow,
      tipDown: tipDown, tipUp: tipUp, compare: compare,
      summary: { tipDown: summarize(tipDown), tipUp: summarize(tipUp), compare: summarize(compare) },
      warnings: warnings, pointCount: (points || []).length,
    };
  }

  function rowsToCsv(report) {
    var lines = [['Section','Tilt','Point','N','E','Z','dN','dE','dZ','Horiz','SpecXY_mm','SpecZ_mm','Pass'].join(',')];
    function add(section, rows) {
      rows.forEach(function (r) {
        lines.push([
          section, r.tiltLabel, r.pointName,
          r.shot ? r.shot.n : '', r.shot ? r.shot.e : '', r.shot ? r.shot.z : '',
          r.d ? r.d.dn : '', r.d ? r.d.de : '', r.d ? r.d.dz : '', r.d ? r.d.horiz : '',
          r.check ? r.check.specXY : '', r.check ? r.check.specZ : '',
          r.check ? (r.check.pass ? 'Y' : 'N') : '',
        ].join(','));
      });
    }
    add('TipDOWN_vs_BENCH', report.tipDown);
    add('TipUP_vs_BENCH', report.tipUp);
    lines.push('');
    lines.push(['Section','Tilt','TipDown','TipUp','dN_UP-DOWN','dE_UP-DOWN','dZ_UP-DOWN','Horiz'].join(','));
    report.compare.forEach(function (r) {
      lines.push([
        'TipUP_vs_TipDOWN', r.tiltLabel, r.tipDownName, r.tipUpName,
        r.d ? r.d.dn : '', r.d ? r.d.de : '', r.d ? r.d.dz : '', r.d ? r.d.horiz : '',
      ].join(','));
    });
    if (report.bench) {
      lines.push('');
      lines.push(['Benchmark', report.bench.name, report.bench.n, report.bench.e, report.bench.z].join(','));
    }
    lines.push(['RodHeight_m', report.rodHeightM != null ? report.rodHeightM : '', 'SpecRow', report.specRow.label].join(','));
    return lines.join('\r\n');
  }

  return {
    TILTS: TILTS, TIP_SPECS: TIP_SPECS, buildReport: buildReport, pickSpecRow: pickSpecRow,
    toMeters: toMeters, delta: delta, fmt: fmt, fmtMm: fmtMm, rowsToCsv: rowsToCsv,
  };
})();
