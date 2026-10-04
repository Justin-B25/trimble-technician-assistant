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

  function toMeters(value, unit) {
    var n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    var info = coordUnitInfo(unit);
    if (info.id === 'm') return n;
    return n * info.toM;
  }

  function coordUnitInfo(u) {
    var s = String(u == null ? 'usft' : u).toLowerCase().replace(/\s+/g, '');
    if (s === 'm' || s === 'meter' || s === 'meters') return { id: 'm', label: 'm', toM: 1, decimals: 3 };
    if (s === 'ift' || s === 'intft' || s === 'internationalft' || s === 'ftintl') {
      return { id: 'ift', label: 'ft', toM: 0.3048, decimals: 4 };
    }
    if (s === 'in' || s === 'inch' || s === 'inches') return { id: 'in', label: 'in', toM: 0.0254, decimals: 2 };
    if (s === 'ft' || s === 'feet' || s === 'foot') return { id: 'ift', label: 'ft', toM: 0.3048, decimals: 4 };
    return { id: 'usft', label: 'US ft', toM: 1200 / 3937, decimals: 4 };
  }

  function fmt(n, digits) {
    if (n == null || !Number.isFinite(n)) return '—';
    var d = digits;
    if (d == null) d = coordUnitInfo(fmt.unit).decimals;
    return n.toFixed(d);
  }
  fmt.unit = 'usft';

  function pickSpecRow(heightM) {
    if (heightM == null || !Number.isFinite(heightM)) return TIP_SPECS[0];
    var best = TIP_SPECS[0], bestDist = Math.abs(heightM - best.heightM);
    for (var i = 1; i < TIP_SPECS.length; i++) {
      var d = Math.abs(heightM - TIP_SPECS[i].heightM);
      if (d < bestDist) { best = TIP_SPECS[i]; bestDist = d; }
    }
    return best;
  }

  function passCheck(d, tilt, specRow, toM) {
    if (!d || !specRow) return null;
    var sp = specRow.specs[tilt];
    if (!sp) return null;
    var scale = toM == null ? 1 : toM;
    var horizMm = d.horiz * scale * 1000, zMm = Math.abs(d.dz) * scale * 1000;
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

  function buildActivityRows(shots, bench, label, specRow, toM) {
    return TILTS.map(function (tilt) {
      var shot = shots[tilt] || null;
      var d = shot && bench ? delta(shot, bench) : null;
      return {
        activity: label, tilt: tilt,
        tiltLabel: tilt === 0 ? '0° Plumb' : tilt + '°',
        pointName: shot ? shot.name : '—', shot: shot, d: d,
        check: d ? passCheck(d, tilt, specRow, toM) : null,
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

  /**
   * Worksheet debrief answers (Page 3):
   * 1) Activity A within tip specs at 5° / 15° / 30°?
   * 2) Activity B (inverted) within tip specs?
   * 3) Largest Δ XY (mm) — which tilt / orientation?
   */
  function buildDebrief(tipDown, tipUp, toM) {
    function activityAnswer(rows, activityCode) {
      var needed = [5, 15, 30];
      var checked = [];
      var missing = [];
      var fails = [];
      for (var i = 0; i < needed.length; i++) {
        var tilt = needed[i];
        var row = null;
        for (var r = 0; r < rows.length; r++) {
          if (rows[r].tilt === tilt) { row = rows[r]; break; }
        }
        if (!row || !row.check) {
          missing.push(tilt + '°');
          continue;
        }
        checked.push(row);
        if (!row.check.pass) {
          fails.push(
            tilt +
              '° horiz ' +
              row.check.horizMm.toFixed(1) +
              ' mm (spec ' +
              row.check.specXY +
              ') / |ΔZ| ' +
              row.check.zMm.toFixed(1) +
              ' mm (spec ' +
              row.check.specZ +
              ')'
          );
        }
      }
      var answer = '—';
      var notes = '';
      if (!checked.length && missing.length) {
        answer = 'N';
        notes = 'Missing shots: ' + missing.join(', ');
      } else if (missing.length && fails.length) {
        answer = 'N';
        notes = 'Missing ' + missing.join(', ') + '; fail ' + fails.join('; ');
      } else if (missing.length) {
        answer = 'N';
        notes = 'Incomplete — missing ' + missing.join(', ') + '; available angles passed';
      } else if (fails.length) {
        answer = 'N';
        notes = fails.join('; ');
      } else {
        answer = 'Y';
        notes = '5° / 15° / 30° within tip specs (' + activityCode + ')';
      }
      return {
        activity: activityCode,
        answer: answer,
        notes: notes,
        pass: answer === 'Y',
        missing: missing,
        fails: fails,
        fillIn: answer + (notes ? ' — ' + notes : ''),
      };
    }

    var a = activityAnswer(tipDown, 'A');
    var b = activityAnswer(tipUp, 'B');

    var largest = null;
    function consider(rows, orientation) {
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (!row || !row.d) continue;
        var horizMm = row.d.horiz * (toM || 1) * 1000;
        if (!largest || horizMm > largest.horizMm) {
          largest = {
            horizMm: horizMm,
            tilt: row.tilt,
            tiltLabel: row.tiltLabel,
            orientation: orientation,
            pointName: row.pointName,
            fillIn:
              horizMm.toFixed(1) +
              ' mm / ' +
              row.tiltLabel +
              ' / ' +
              orientation,
          };
        }
      }
    }
    consider(tipDown, 'A');
    consider(tipUp, 'B');

    return {
      q1: a,
      q2: b,
      q3: largest
        ? largest
        : {
            horizMm: null,
            tilt: null,
            tiltLabel: '—',
            orientation: '—',
            pointName: '—',
            fillIn: '— (no tilted shots vs BENCH)',
          },
    };
  }

  function buildReport(points, opts) {
    opts = opts || {};
    var unit = coordUnitInfo(opts.coordUnit || 'usft');
    fmt.unit = unit.id;
    var heightM = toMeters(opts.rodHeight, opts.rodUnit || 'm');
    var specRow = pickSpecRow(heightM != null ? heightM : 0.2);
    var indexed = indexShots(points);
    var warnings = indexed.warnings.slice();
    if (!indexed.bench) warnings.push('No benchmark found. Name a point BENCH (or BENCHMARK / CP / KNOWN).');

    var tipDown = buildActivityRows(indexed.activityA, indexed.bench, 'Tip DOWN (Activity A)', specRow, unit.toM);
    var tipUp = buildActivityRows(indexed.activityB, indexed.bench, 'Tip UP (Activity B)', specRow, unit.toM);
    var compare = buildCompareRows(indexed.activityA, indexed.activityB);
    var debrief = buildDebrief(tipDown, tipUp, unit.toM);

    return {
      bench: indexed.bench, rodHeightM: heightM, rodHeightInput: opts.rodHeight,
      rodUnit: opts.rodUnit || 'm', specRow: specRow,
      coordUnit: unit.id, coordUnitLabel: unit.label, toM: unit.toM,
      tipDown: tipDown, tipUp: tipUp, compare: compare,
      summary: { tipDown: summarize(tipDown), tipUp: summarize(tipUp), compare: summarize(compare) },
      debrief: debrief,
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
    if (report.debrief) {
      lines.push('');
      lines.push(['DebriefQuestion','Answer','NotesOrFillIn'].join(','));
      lines.push(['1_ActivityA_within_specs_5_15_30', report.debrief.q1.answer, '"' + String(report.debrief.q1.fillIn).replace(/"/g, "'") + '"'].join(','));
      lines.push(['2_ActivityB_within_specs_5_15_30', report.debrief.q2.answer, '"' + String(report.debrief.q2.fillIn).replace(/"/g, "'") + '"'].join(','));
      lines.push(['3_Largest_dXY_mm_tilt_orientation', report.debrief.q3.horizMm != null ? report.debrief.q3.horizMm.toFixed(1) : '', '"' + String(report.debrief.q3.fillIn).replace(/"/g, "'") + '"'].join(','));
    }
    if (report.bench) {
      lines.push('');
      lines.push(['Benchmark', report.bench.name, report.bench.n, report.bench.e, report.bench.z].join(','));
    }
    lines.push(['RodHeight_m', report.rodHeightM != null ? report.rodHeightM : '', 'SpecRow', report.specRow.label, 'CoordUnit', report.coordUnitLabel || ''].join(','));
    return lines.join('\r\n');
  }

  function fmtMm(coordDelta, digits, toM) {
    if (coordDelta == null || !Number.isFinite(coordDelta)) return '—';
    var scale = toM == null ? coordUnitInfo(fmt.unit).toM : toM;
    return (coordDelta * scale * 1000).toFixed(digits == null ? 1 : digits);
  }

  return {
    TILTS: TILTS, TIP_SPECS: TIP_SPECS, buildReport: buildReport, buildDebrief: buildDebrief,
    pickSpecRow: pickSpecRow, toMeters: toMeters, coordUnitInfo: coordUnitInfo,
    delta: delta, fmt: fmt, fmtMm: fmtMm, rowsToCsv: rowsToCsv,
  };
})();
