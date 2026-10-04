/**
 * ST30 Top Mount Exercise — tip-down vs UP0, tip-up vs DOWN0 (+ up-vs-down compare).
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
    if (!Number.isFinite(n)) return null;
    var info = coordUnitInfo(unit);
    if (info.id === 'm') return n;
    return n * info.toM;
  }

  function toMetersPositive(value, unit) {
    var m = toMeters(value, unit);
    if (m == null || m <= 0) return null;
    return m;
  }

  function coordUnitInfo(u) {
    var s = String(u == null ? 'usft' : u).toLowerCase().replace(/\s+/g, '');
    if (s === 'm' || s === 'meter' || s === 'meters') return { id: 'm', label: 'm', toM: 1, decimals: 3 };
    if (s === 'ift' || s === 'intft' || s === 'internationalft' || s === 'ftintl') {
      return { id: 'ift', label: 'ft', toM: 0.3048, decimals: 4 };
    }
    if (s === 'in' || s === 'inch' || s === 'inches') return { id: 'in', label: 'in', toM: 0.0254, decimals: 2 };
    if (s === 'ft' || s === 'feet' || s === 'foot') return { id: 'ift', label: 'ft', toM: 0.3048, decimals: 4 };
    // Siteworks US Survey Feet
    return { id: 'usft', label: 'US ft', toM: 1200 / 3937, decimals: 4 };
  }

  /** Convert a parsed CSV point's linear fields from CSV units → meters. */
  function pointToMeters(p, unit) {
    if (!p) return null;
    var scale = coordUnitInfo(unit).toM;
    return {
      name: p.name,
      n: p.n * scale,
      e: p.e * scale,
      z: p.z * scale,
      parsed: p.parsed,
      source: p.source,
      targetHeight: p.targetHeight != null ? p.targetHeight * scale : null,
      tiltAngleDeg: p.tiltAngleDeg,
      pitchDeg: p.pitchDeg,
      rollDeg: p.rollDeg,
      autoPoleHeight: p.autoPoleHeight,
      csvUnit: coordUnitInfo(unit).id,
      unit: 'm',
    };
  }

  function pointsToMeters(points, unit) {
    return (points || []).map(function (p) {
      return pointToMeters(p, unit);
    });
  }

  function fmt(n, digits) {
    if (n == null || !Number.isFinite(n)) return '—';
    var d = digits == null ? 3 : digits;
    return n.toFixed(d);
  }
  fmt.unit = 'm';

  /** Format a meter delta as mm for ST30 tip-spec comparison. */
  function fmtMm(meters, digits) {
    if (meters == null || !Number.isFinite(meters)) return '—';
    return (meters * 1000).toFixed(digits == null ? 1 : digits);
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

  /** d is already in meters. Specs are mm. */
  function passCheck(d, tilt, specRow) {
    if (!d || !specRow) return null;
    var sp = specRow.specs[tilt];
    if (!sp) return null;
    var horizMm = d.horiz * 1000;
    var zMm = Math.abs(d.dz) * 1000;
    return {
      passXY: horizMm <= sp[0] + 0.5,
      passZ: zMm <= sp[1] + 0.5,
      pass: horizMm <= sp[0] + 0.5 && zMm <= sp[1] + 0.5,
      specXY: sp[0],
      specZ: sp[1],
      horizMm: horizMm,
      zMm: zMm,
    };
  }

  function hasTilted(shots) {
    return !!(shots && (shots[5] || shots[15] || shots[30]));
  }

  function indexShots(points) {
    var a = Object.create(null);
    var b = Object.create(null);
    var warnings = [];
    for (var i = 0; i < (points || []).length; i++) {
      var p = points[i];
      if (!p || !p.parsed) continue;
      // 4A / 4B / BENCH accepted so they don't clutter unmatched warnings;
      // tip deltas always use UP0 / DOWN0 as the activity origin.
      if (p.parsed.kind === 'bench') continue;
      if (p.parsed.kind === 'shot') {
        var bucket = p.parsed.activity === 'B' ? b : a;
        if (bucket[p.parsed.tilt]) warnings.push('Duplicate ' + p.parsed.label + ' — using last');
        bucket[p.parsed.tilt] = p;
      }
    }
    var benchA = a[0] || null;
    var benchB = b[0] || null;
    if (hasTilted(a) && !benchA) {
      warnings.push('Activity A: missing UP0 — cannot relate UP5/UP15/UP30. Shoot UP0 first on the same mark.');
    }
    if (hasTilted(b) && !benchB) {
      warnings.push('Activity B: missing DOWN0 — cannot relate DOWN5/DOWN15/DOWN30. Shoot DOWN0 first on the same mark.');
    }
    var refs = [];
    if (benchA) refs.push(benchA);
    if (benchB) refs.push(benchB);
    var display =
      benchA || benchB
        ? {
            name: [benchA && benchA.name, benchB && benchB.name].filter(Boolean).join(' / '),
            n: (benchA || benchB).n,
            e: (benchA || benchB).e,
            z: (benchA || benchB).z,
            benches: refs,
            forA: benchA,
            forB: benchB,
          }
        : null;
    return {
      bench: display,
      benchA: benchA,
      benchB: benchB,
      activityA: a,
      activityB: b,
      warnings: warnings,
    };
  }

  function buildActivityRows(shots, bench, label, specRow) {
    return TILTS.map(function (tilt) {
      var shot = shots[tilt] || null;
      var isOrigin = tilt === 0 && shot && bench && shot === bench;
      var d = shot && bench ? delta(shot, bench) : null;
      return {
        activity: label, tilt: tilt,
        tiltLabel: tilt === 0 ? '0° Plumb (origin)' : tilt + '°',
        pointName: shot ? shot.name : '—',
        shot: shot,
        d: d,
        isOrigin: !!isOrigin,
        targetHeight: shot && shot.targetHeight != null ? shot.targetHeight : null,
        tiltAngleDeg: shot && shot.tiltAngleDeg != null ? shot.tiltAngleDeg : null,
        pitchDeg: shot && shot.pitchDeg != null ? shot.pitchDeg : null,
        rollDeg: shot && shot.rollDeg != null ? shot.rollDeg : null,
        check: d ? passCheck(d, tilt, specRow) : null,
      };
    });
  }

  function medianAbs(nums) {
    var vals = (nums || []).filter(function (n) { return n != null && Number.isFinite(n); })
      .map(function (n) { return Math.abs(n); })
      .sort(function (a, b) { return a - b; });
    if (!vals.length) return null;
    var mid = Math.floor(vals.length / 2);
    return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
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
    // Exclude 0° origin (always ~0 vs itself) so averages reflect tilted shots only
    var list = rows.filter(function (r) { return r.d && r.tilt !== 0; });
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
  function buildDebrief(tipDown, tipUp) {
    function activityAnswer(rows, activityCode) {
      var needed = [5, 15, 30];
      var checked = [];
      var missing = [];
      var notesBits = [];
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
        notesBits.push(
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
      var answer = '—';
      var notes = '';
      if (!checked.length && missing.length) {
        notes = 'Missing shots: ' + missing.join(', ');
      } else if (missing.length) {
        notes = 'Incomplete — missing ' + missing.join(', ') + '; ' + notesBits.join('; ');
      } else {
        notes = notesBits.join('; ');
      }
      // Y/N is filled on the field worksheet by the student — calculator only reports mm vs specs.
      return {
        activity: activityCode,
        answer: '—',
        notes: notes,
        pass: null,
        missing: missing,
        fails: [],
        fillIn: notes || '—',
      };
    }

    var a = activityAnswer(tipDown, 'A');
    var b = activityAnswer(tipUp, 'B');

    var largest = null;
    function consider(rows, orientation) {
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (!row || !row.d || row.tilt === 0) continue;
        var horizMm = row.d.horiz * 1000;
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
            fillIn: '— (no tilted shots vs UP0/DOWN0)',
          },
    };
  }

  function medianHeightForActivity(metricPoints, activity) {
    var vals = [];
    var autoPole = '';
    (metricPoints || []).forEach(function (p) {
      if (!p || !p.parsed || p.parsed.kind !== 'shot') return;
      if (p.parsed.activity !== activity) return;
      if (p.targetHeight != null) vals.push(p.targetHeight);
      if (!autoPole && p.autoPoleHeight) autoPole = p.autoPoleHeight;
    });
    return { medianM: medianAbs(vals), autoPole: autoPole };
  }

  function resolveActivityRod(opts, csvMedianM, fallbackM, label) {
    var rodUnit = opts.rodUnit || 'm';
    var fromCsv = false;
    var input = opts.rodHeight;
    if (opts.useCsvRodHeight && csvMedianM != null) {
      input = csvMedianM;
      rodUnit = 'm';
      fromCsv = true;
    }
    var heightM = toMetersPositive(input, rodUnit);
    if (heightM == null) heightM = fallbackM;
    var specRow = pickSpecRow(heightM);
    return {
      label: label,
      rodHeightInput: input != null && input !== '' ? input : heightM,
      rodUnit: rodUnit,
      rodHeightM: heightM,
      rodFromCsv: fromCsv,
      csvRodHeightM: csvMedianM,
      specRow: specRow,
    };
  }

  function buildReport(points, opts) {
    opts = opts || {};
    var csvUnit = coordUnitInfo(opts.coordUnit || 'usft');
    // Always compute in meters so tip deltas compare directly to ST30 mm specs
    fmt.unit = 'm';
    var metricPoints = pointsToMeters(points, csvUnit.id);
    var indexed = indexShots(metricPoints);
    var warnings = indexed.warnings.slice();
    if (!indexed.benchA && !indexed.benchB) {
      warnings.push('No 0° origin found. Name plumb shots UP0 (Activity A) and/or DOWN0 (Activity B).');
    }
    if (csvUnit.id !== 'm') {
      warnings.push(
        'CSV linear values treated as ' +
          csvUnit.label +
          ' → converted to meters (× ' +
          csvUnit.toM.toFixed(9) +
          '). Tip deltas shown in mm.'
      );
    }

    var csvA = medianHeightForActivity(metricPoints, 'A');
    var csvB = medianHeightForActivity(metricPoints, 'B');
    // Activity A = UP* (tip DOWN / rod upright). Activity B = DOWN* (tip UP / Top Mount).
    var rodA = resolveActivityRod(
      {
        rodHeight: opts.rodHeightA,
        rodUnit: opts.rodUnitA || opts.rodUnit || 'm',
        useCsvRodHeight: opts.useCsvRodHeight,
      },
      csvA.medianM,
      1.55,
      'Activity A (UP*)'
    );
    var rodB = resolveActivityRod(
      {
        rodHeight: opts.rodHeightB,
        rodUnit: opts.rodUnitB || opts.rodUnit || 'm',
        useCsvRodHeight: opts.useCsvRodHeight,
      },
      csvB.medianM,
      0.145,
      'Activity B (DOWN*)'
    );

    warnings.push(
      rodA.label +
        ' rod ' +
        rodA.rodHeightM.toFixed(3) +
        ' m → ' +
        rodA.specRow.label +
        (rodA.rodFromCsv ? ' (CSV Target Height)' : '')
    );
    warnings.push(
      rodB.label +
        ' rod ' +
        rodB.rodHeightM.toFixed(3) +
        ' m → ' +
        rodB.specRow.label +
        (rodB.rodFromCsv ? ' (CSV Target Height)' : '')
    );
    if (csvA.autoPole || csvB.autoPole) {
      warnings.push(
        'Auto Pole Height: ' +
          [csvA.autoPole, csvB.autoPole].filter(Boolean).filter(function (v, i, a) {
            return a.indexOf(v) === i;
          }).join(' · ')
      );
    }

    var tipDown = buildActivityRows(
      indexed.activityA,
      indexed.benchA,
      'Tip DOWN (Activity A)',
      rodA.specRow
    );
    var tipUp = buildActivityRows(
      indexed.activityB,
      indexed.benchB,
      'Tip UP (Activity B)',
      rodB.specRow
    );
    var compare = buildCompareRows(indexed.activityA, indexed.activityB);
    var debrief = buildDebrief(tipDown, tipUp);

    return {
      bench: indexed.bench,
      rodA: rodA,
      rodB: rodB,
      // Legacy single-rod fields (Activity A) for older UI bits
      rodHeightM: rodA.rodHeightM,
      rodHeightInput: rodA.rodHeightInput,
      rodUnit: rodA.rodUnit,
      rodFromCsv: rodA.rodFromCsv || rodB.rodFromCsv,
      csvRodHeight: csvA.medianM != null ? csvA.medianM : csvB.medianM,
      autoPoleHeight: csvA.autoPole || csvB.autoPole || '',
      specRow: rodA.specRow,
      specRowA: rodA.specRow,
      specRowB: rodB.specRow,
      csvUnit: csvUnit.id,
      csvUnitLabel: csvUnit.label,
      coordUnit: 'm',
      coordUnitLabel: 'm (from ' + csvUnit.label + ' CSV)',
      toM: 1,
      tipDown: tipDown,
      tipUp: tipUp,
      compare: compare,
      summary: { tipDown: summarize(tipDown), tipUp: summarize(tipUp), compare: summarize(compare) },
      debrief: debrief,
      warnings: warnings,
      pointCount: (metricPoints || []).length,
    };
  }

  function rowsToCsv(report) {
    var lines = [[
      'Section', 'Tilt', 'Point', 'N_m', 'E_m', 'Z_m',
      'dN_mm', 'dE_mm', 'dZ_mm', 'Horiz_mm', 'SpecXY_mm', 'SpecZ_mm',
    ].join(',')];
    function add(section, rows) {
      rows.forEach(function (r) {
        lines.push([
          section, r.tiltLabel, r.pointName,
          r.shot ? r.shot.n : '', r.shot ? r.shot.e : '', r.shot ? r.shot.z : '',
          r.d ? r.d.dn * 1000 : '', r.d ? r.d.de * 1000 : '', r.d ? r.d.dz * 1000 : '',
          r.d ? r.d.horiz * 1000 : '',
          r.check ? r.check.specXY : '', r.check ? r.check.specZ : '',
        ].join(','));
      });
    }
    add('TipDOWN_vs_UP0', report.tipDown);
    add('TipUP_vs_DOWN0', report.tipUp);
    lines.push('');
    lines.push(['Section', 'Tilt', 'TipDown', 'TipUp', 'dN_mm', 'dE_mm', 'dZ_mm', 'Horiz_mm'].join(','));
    report.compare.forEach(function (r) {
      lines.push([
        'TipUP_vs_TipDOWN', r.tiltLabel, r.tipDownName, r.tipUpName,
        r.d ? r.d.dn * 1000 : '', r.d ? r.d.de * 1000 : '', r.d ? r.d.dz * 1000 : '',
        r.d ? r.d.horiz * 1000 : '',
      ].join(','));
    });
    if (report.debrief) {
      lines.push('');
      lines.push(['DebriefQuestion','Answer','NotesOrFillIn'].join(','));
      lines.push(['1_ActivityA_within_specs_5_15_30', report.debrief.q1.answer, '"' + String(report.debrief.q1.fillIn).replace(/"/g, "'") + '"'].join(','));
      lines.push(['2_ActivityB_within_specs_5_15_30', report.debrief.q2.answer, '"' + String(report.debrief.q2.fillIn).replace(/"/g, "'") + '"'].join(','));
      lines.push(['3_Largest_dXY_mm_tilt_orientation', report.debrief.q3.horizMm != null ? report.debrief.q3.horizMm.toFixed(1) : '', '"' + String(report.debrief.q3.fillIn).replace(/"/g, "'") + '"'].join(','));
    }
    if (report.bench && report.bench.benches && report.bench.benches.length) {
      lines.push('');
      report.bench.benches.forEach(function (bp) {
        lines.push(['Origin_0deg', bp.name, bp.n, bp.e, bp.z].join(','));
      });
    } else if (report.bench) {
      lines.push('');
      lines.push(['Origin_0deg', report.bench.name, report.bench.n, report.bench.e, report.bench.z].join(','));
    }
    if (report.rodA) {
      lines.push([
        'RodHeightA_m', report.rodA.rodHeightM,
        'SpecRowA', report.rodA.specRow.label,
      ].join(','));
    }
    if (report.rodB) {
      lines.push([
        'RodHeightB_m', report.rodB.rodHeightM,
        'SpecRowB', report.rodB.specRow.label,
      ].join(','));
    }
    lines.push(['CoordUnit', report.coordUnitLabel || ''].join(','));
    return lines.join('\r\n');
  }

  return {
    TILTS: TILTS,
    TIP_SPECS: TIP_SPECS,
    buildReport: buildReport,
    buildDebrief: buildDebrief,
    pickSpecRow: pickSpecRow,
    toMeters: toMetersPositive,
    coordUnitInfo: coordUnitInfo,
    pointsToMeters: pointsToMeters,
    delta: delta,
    fmt: fmt,
    fmtMm: fmtMm,
    rowsToCsv: rowsToCsv,
  };
})();
