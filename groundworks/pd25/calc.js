/**
 * PD25 COGO / Groundworks value extraction (phases 4–5).
 * Replicates Siteworks offset line, CENTER REF, Down & Out, and Inverse per OEM guide.
 */
var PD25Calc = (function () {
  var COGO = PD25_GUIDE.cogo;

  function parseSurveyCsv(text) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    var rows = [];
    var row = [];
    var cell = '';
    var inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      var next = text[i + 1];
      if (inQuotes) {
        if (c === '"' && next === '"') {
          cell += '"';
          i++;
        } else if (c === '"') inQuotes = false;
        else cell += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ',') {
        row.push(cell);
        cell = '';
      } else if (c === '\r') {
      } else if (c === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else cell += c;
    }
    if (cell.length || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows.filter(function (r) {
      return r.some(function (v) {
        return String(v).trim() !== '';
      });
    });
  }

  /** Canonical survey IDs → Siteworks export names (matched case-insensitive). */
  var POINT_ALIASES = {
    ML: ['ML'],
    MR: ['MR'],
    MF: ['MF', 'MASTFOOT', 'MAST FOOT'],
    MB: ['MB'],
    H: ['H', 'HEADING'],
    HC: ['HC', 'HAMMER CENTER', 'HAMMERCENTER', 'HF', 'MHF', 'HAMMERFACE', 'HAMMER FACE'],
    MT: ['MT', 'MAST TILT', 'MASTTILT', 'MAST_TILT'],
    LINEPT1: ['LINEPT1', 'LINE PT1', 'LINE PT 1', 'LINE_PT1'],
    LINEPT2: ['LINEPT2', 'LINE PT2', 'LINE PT 2', 'LINE_PT2'],
    'CENTER REF': ['CENTER REF', 'CENTERREF', 'CENTER_REF'],
  };

  function normalizeName(name) {
    return String(name || '')
      .toUpperCase()
      .trim()
      .replace(/\s+/g, ' ');
  }

  function aliasList(canonicalId) {
    var key = normalizeName(canonicalId);
    return POINT_ALIASES[key] || [key];
  }

  function detectCsvLayout(rows, csvFormat) {
    if (!rows.length) throw new Error('CSV file is empty.');

    function headerScore(row) {
      var score = 0;
      row.forEach(function (cell) {
        var h = String(cell).toLowerCase().trim();
        if (!h) return;
        if (h.includes('name') || h.includes('point') || h === 'pt') score++;
        if (h.includes('north') || h === 'n' || h === 'y') score++;
        if (h.includes('east') || h === 'e' || h === 'x') score++;
        if (h.includes('elev') || h === 'z' || h.includes('alt') || h.includes('height') || h === 'hgt')
          score++;
      });
      return score;
    }

    var hasHeader = headerScore(rows[0]) >= 2;
    var idxName = 0;
    var idxN = 1;
    var idxE = 2;
    var idxZ = 3;

    if (hasHeader) {
      var headers = rows[0].map(function (h) {
        return String(h).toLowerCase().trim();
      });
      idxName = headers.findIndex(function (h) {
        return h.includes('name') || h === 'pt' || h.includes('point');
      });
      idxN = headers.findIndex(function (h) {
        return h.includes('north') || h === 'n' || h === 'y';
      });
      idxE = headers.findIndex(function (h) {
        return h.includes('east') || h === 'e' || h === 'x';
      });
      idxZ = headers.findIndex(function (h) {
        return (
          h.includes('elev') ||
          h === 'z' ||
          h.includes('alt') ||
          h.includes('height') ||
          h === 'hgt'
        );
      });
      if (idxName === -1 || idxN === -1 || idxE === -1 || idxZ === -1) {
        throw new Error(
          'CSV header row found but could not locate Point Name, Northing, Easting, and Elevation columns.'
        );
      }
      return { hasHeader: true, dataStart: 1, idxName: idxName, idxN: idxN, idxE: idxE, idxZ: idxZ };
    }

    var format = csvFormat === 'PENZ' ? 'PENZ' : 'PNEZ';
    idxName = 0;
    idxZ = 3;
    if (format === 'PNEZ') {
      idxN = 1;
      idxE = 2;
    } else {
      idxE = 1;
      idxN = 2;
    }

    return {
      hasHeader: false,
      dataStart: 0,
      idxName: idxName,
      idxN: idxN,
      idxE: idxE,
      idxZ: idxZ,
      csvFormat: format,
    };
  }

  function rowToPoint(row, layout) {
    if (!row || !row[layout.idxName]) return null;
    var n = parseFloat(row[layout.idxN]);
    var e = parseFloat(row[layout.idxE]);
    var z = parseFloat(row[layout.idxZ]);
    if (isNaN(n) || isNaN(e) || isNaN(z)) return null;
    return {
      n: n,
      e: e,
      z: z,
      name: normalizeName(row[layout.idxName]),
      csvName: String(row[layout.idxName]).trim(),
    };
  }

  function findPoint(rows, canonicalId, layout) {
    if (!layout) layout = detectCsvLayout(rows);
    var targets = aliasList(canonicalId).map(normalizeName);

    for (var i = layout.dataStart; i < rows.length; i++) {
      var pt = rowToPoint(rows[i], layout);
      if (pt && targets.indexOf(pt.name) !== -1) return pt;
    }
    return null;
  }

  function constantsForUnits(units) {
    var metric = units === 'METRIC';
    return {
      horizontal: metric ? COGO.offsetLine.horizontalM : COGO.offsetLine.horizontalFt,
      vertical: metric ? COGO.offsetLine.verticalM : COGO.offsetLine.verticalFt,
      centerRefDist: metric ? COGO.centerRef.distanceM : COGO.centerRef.distanceFt,
      unitLabel: metric ? 'm' : 'ft',
    };
  }

  function cogoConstantsForCoords(coordUnits) {
    return constantsForUnits(coordUnits);
  }

  /** Round a groundworks distance in the job's coordinate units (m or US survey ft). */
  function formatGroundworksValue(valueNative) {
    return Math.round(valueNative * 1000) / 1000;
  }

  function applyGroundworksDisplay(results) {
    Object.keys(results).forEach(function (key) {
      var row = results[key];
      if (row && row.value != null) row.value = formatGroundworksValue(row.value);
    });
  }

  function bearingRad(dN, dE) {
    return Math.atan2(dE, dN);
  }

  function offsetByBearing(pt, bearingRadVal, horiz, vertZ) {
    return {
      n: pt.n + horiz * Math.cos(bearingRadVal),
      e: pt.e + horiz * Math.sin(bearingRadVal),
      z: pt.z + vertZ,
    };
  }

  function horizDist(a, b) {
    return Math.hypot(b.n - a.n, b.e - a.e);
  }

  function horizDist3D(a, b) {
    return Math.hypot(b.n - a.n, b.e - a.e, b.z - a.z);
  }

  /**
   * Siteworks offset line — mirrors COGO in two steps on ML and MR:
   *   1) Horizontal offset perpendicular to ML→MR (right positive)
   *   2) Vertical offset on that horizontally shifted line (up positive)
   * Optional overrides.horizontal / overrides.vertical replace OEM constants (measure-B5 path).
   */
  function buildOffsetLine(ml, mr, coordUnits, overrides) {
    var c = cogoConstantsForCoords(coordUnits);
    overrides = overrides || {};
    var horizontal =
      overrides.horizontal != null && !isNaN(overrides.horizontal)
        ? Number(overrides.horizontal)
        : c.horizontal;
    var vertical =
      overrides.vertical != null && !isNaN(overrides.vertical)
        ? Number(overrides.vertical)
        : c.vertical;
    var dN = mr.n - ml.n;
    var dE = mr.e - ml.e;
    var mlToMr = bearingRad(dN, dE);
    var rightBearing = mlToMr + Math.PI / 2;

    var mlHoriz = offsetByBearing(ml, rightBearing, horizontal, 0);
    var mrHoriz = offsetByBearing(mr, rightBearing, horizontal, 0);

    return {
      linePt1: {
        n: mlHoriz.n,
        e: mlHoriz.e,
        z: mlHoriz.z + vertical,
      },
      linePt2: {
        n: mrHoriz.n,
        e: mrHoriz.e,
        z: mrHoriz.z + vertical,
      },
      bearingMlMrDeg: (mlToMr * 180) / Math.PI,
      constants: {
        horizontal: horizontal,
        vertical: vertical,
        centerRefDist: c.centerRefDist,
        unitLabel: c.unitLabel,
      },
    };
  }

  function buildCenterRef(linePt1, linePt2, coordUnits) {
    var c = cogoConstantsForCoords(coordUnits);
    var dN = linePt2.n - linePt1.n;
    var dE = linePt2.e - linePt1.e;
    var bearing = bearingRad(dN, dE);
    return offsetByBearing(linePt1, bearing, c.centerRefDist, 0);
  }

  /**
   * Y-pivot reference: midpoint of ML/MR (mast X-slide pin targets at reference position).
   */
  function yPivotCenter(ml, mr) {
    return {
      n: (ml.n + mr.n) / 2,
      e: (ml.e + mr.e) / 2,
      z: (ml.z + mr.z) / 2,
    };
  }

  /**
   * Siteworks Down & Out from CENTER REF — baseline CENTER REF → Line PT2.
   * G6/G2 = |Down|; G5/G1 = |Out| (matches Siteworks Down & Out from Baseline UI).
   */
  function antennaOffsetsFromCenterRef(centerRef, linePt2, antenna) {
    var dno = downAndOutFromBaseline(centerRef, linePt2, antenna);
    return {
      down: dno.down,
      out: dno.out,
      g6g2: Math.abs(dno.down),
      g5g1: Math.abs(dno.out),
    };
  }

  function inverseVertical(fromPt, toPt) {
    return toPt.z - fromPt.z;
  }

  /** Siteworks-style inverse: slope (3D), horizontal, and vertical components. */
  function inverseDistance(fromPt, toPt) {
    var dN = toPt.n - fromPt.n;
    var dE = toPt.e - fromPt.e;
    var dZ = toPt.z - fromPt.z;
    return {
      slope: Math.hypot(dN, dE, dZ),
      horizontal: Math.hypot(dN, dE),
      vertical: dZ,
    };
  }

  /**
   * Siteworks Down & Out from CENTER REF with baseline toward Line PT2.
   * down = signed along baseline; out = signed left of baseline (matches Siteworks Out on ECM).
   */
  function downAndOutFromBaseline(centerRef, linePt2, target) {
    var dN = linePt2.n - centerRef.n;
    var dE = linePt2.e - centerRef.e;
    var len = Math.hypot(dN, dE);
    if (len < 1e-12) return { down: 0, out: 0 };
    var uN = dN / len;
    var uE = dE / len;
    var lN = -uE;
    var lE = uN;
    var vN = target.n - centerRef.n;
    var vE = target.e - centerRef.e;
    return {
      down: vN * uN + vE * uE,
      out: vN * lN + vE * lE,
    };
  }

  function distance3d(a, b) {
    return Math.hypot(b.n - a.n, b.e - a.e, b.z - a.z);
  }

  function fmt(n, places) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toFixed(places == null ? 3 : places);
  }

  function comparePoints(calc, ref, tol) {
    if (!calc || !ref) return null;
    return {
      horizDelta: horizDist(calc, ref),
      vertDelta: calc.z - ref.z,
      withinTol: horizDist(calc, ref) <= tol && Math.abs(calc.z - ref.z) <= tol,
    };
  }

  /**
   * Match Siteworks 3-decimal coordinate storage on computed COGO points.
   * Northing truncates; easting and elevation round (reverse-verified on ECM).
   */
  function snapSiteworksCoord(pt) {
    if (!pt) return pt;
    return {
      n: Math.trunc(pt.n * 1000) / 1000,
      e: Math.round(pt.e * 1000) / 1000,
      z: Math.round(pt.z * 1000) / 1000,
      name: pt.name,
      csvName: pt.csvName,
    };
  }

  /** Metric jobs: Siteworks rounds all COGO coordinates to 3 decimal meters. */
  function snapMetricCoord(pt) {
    if (!pt) return pt;
    return {
      n: Math.round(pt.n * 1000) / 1000,
      e: Math.round(pt.e * 1000) / 1000,
      z: Math.round(pt.z * 1000) / 1000,
      name: pt.name,
      csvName: pt.csvName,
    };
  }

  function snapCogoPoint(pt, coordUnits) {
    if (!pt) return pt;
    return coordUnits === 'METRIC' ? snapMetricCoord(pt) : snapSiteworksCoord(pt);
  }

  function defaultRodPostHeight(units) {
    return units === 'METRIC' ? COGO.rodPostHeight.metricM : COGO.rodPostHeight.usft;
  }

  function apcOffsetZephyr3(units) {
    return units === 'METRIC' ? COGO.apcOffsetZephyr3Rugged.metricM : COGO.apcOffsetZephyr3Rugged.usft;
  }

  /** @deprecated Use defaultRodPostHeight — kept for app.js */
  function defaultRodHeight(units) {
    return defaultRodPostHeight(units);
  }

  function totalApcSubtractFromPost(rodPostHeight, units) {
    return rodPostHeight + apcOffsetZephyr3(units);
  }

  /** Lower measured Z to APC when rod height was not entered in Siteworks. */
  function applyApcCorrection(pt, rodSubtract) {
    if (!rodSubtract || rodSubtract <= 0) return pt;
    return {
      n: pt.n,
      e: pt.e,
      z: pt.z - rodSubtract,
      name: pt.name,
      csvName: pt.csvName,
    };
  }

  function g7Vertical(mbApc, ml) {
    return Math.abs(inverseVertical(mbApc, ml));
  }

  /**
   * Move measured HC shot to hammer center along HC → Y-pivot (ML/MR) direction.
   * Positive offset = shot is ahead of center (farther from ML/MR than jaw center).
   * Zero = shot is at hammer center. Negative = shot is between center and ML/MR.
   */
  function correctHcToHammerCenter(hc, pivot, faceOffset) {
    var offset = parseFloat(faceOffset);
    if (!hc || isNaN(offset) || offset === 0) {
      return { measured: hc, center: hc, offsetApplied: 0 };
    }

    var dN = pivot.n - hc.n;
    var dE = pivot.e - hc.e;
    var len = Math.hypot(dN, dE);
    if (len < 1e-9) {
      return { measured: hc, center: hc, offsetApplied: 0 };
    }

    var uN = dN / len;
    var uE = dE / len;
    return {
      measured: hc,
      center: {
        n: hc.n + offset * uN,
        e: hc.e + offset * uE,
        z: hc.z,
        name: hc.name,
        csvName: hc.csvName,
      },
      offsetApplied: offset,
    };
  }

  function analyzeCsv(csvString, units, surveyOptions) {
    surveyOptions = surveyOptions || {};
    var displayMetric = units === 'METRIC';
    var displayConstants = constantsForUnits(units);
    var rodEnteredInSiteworks = !!surveyOptions.rodEnteredInSiteworks;
    var shotWithRod = surveyOptions.shotWithRod !== false;
    var rodPostHeight = 0;
    var apcOffsetAdded = 0;
    var rodSubtractNative = 0;
    var rows = parseSurveyCsv(csvString);
    if (!rows.length) throw new Error('CSV file is empty.');

    var layout = detectCsvLayout(rows, surveyOptions.csvFormat);

    var coreRequired = ['ML', 'MR', 'MB', 'H'];
    var points = {};
    var missing = [];
    var warnings = [];

    coreRequired.forEach(function (id) {
      var pt = findPoint(rows, id, layout);
      if (pt) points[id] = pt;
      else missing.push(id);
    });

    var mf = findPoint(rows, 'MF', layout);
    if (mf) points.MF = mf;
    else {
      warnings.push('MF not in CSV — T5 (CENTER REF to mast foot vertical) will be skipped.');
    }

    var hc = findPoint(rows, 'HC', layout);
    if (hc) points.HC = hc;
    else {
      warnings.push('HC not in CSV — T1 (CENTER REF to hammer center) will be skipped.');
    }

    var b5Method = surveyOptions.b5Method === 'measure' ? 'measure' : 'default';
    var mt = findPoint(rows, 'MT', layout);
    if (mt) points.MT = mt;
    if (b5Method === 'measure' && !mt) {
      // No MT in CSV — keep computing with OEM / prepopulated COGO (same as default path).
      warnings.push(
        'MT (Mast Tilt) was not found in the CSV. Using prepopulated OEM B5 and antenna offsets. ' +
          'To measure B5, resect to the rear, shoot MT, and re-import the CSV.'
      );
      b5Method = 'default';
    }

    var refLinePt1 = findPoint(rows, 'LINEPT1', layout);
    var refLinePt2 = findPoint(rows, 'LINEPT2', layout);
    var refCenter = findPoint(rows, 'CENTER REF', layout);

    if (missing.length) {
      return {
        points: points,
        missing: missing,
        warnings: warnings,
        units: units,
        status: 'incomplete',
        message: 'Missing required points: ' + missing.join(', ') + '. Need ML, MR, MB, and H from Siteworks.',
        b5Method: b5Method,
      };
    }

    var coordUnits = units;
    if (shotWithRod && !rodEnteredInSiteworks) {
      var parsedRod = parseFloat(surveyOptions.rodHeight);
      rodPostHeight =
        !isNaN(parsedRod) && parsedRod > 0 ? parsedRod : defaultRodPostHeight(coordUnits);
      apcOffsetAdded = apcOffsetZephyr3(coordUnits);
      rodSubtractNative = totalApcSubtractFromPost(rodPostHeight, coordUnits);
    }

    var pivot = yPivotCenter(points.ML, points.MR);
    var offsetOverrides = null;
    var measuredB5 = null;
    var xPinHorizontalOffset = null;

    if (b5Method === 'measure') {
      var parsedHoriz = parseFloat(surveyOptions.xPinHorizontalOffset);
      if (isNaN(parsedHoriz)) {
        return {
          points: points,
          missing: [],
          warnings: warnings,
          units: units,
          status: 'incomplete',
          message:
            'Enter a horizontal offset from the ML/MR flange-face line to the X-pin center (0 is allowed if ML/MR are on the pin centerline).',
          b5Method: b5Method,
        };
      }
      xPinHorizontalOffset = parsedHoriz;
      var pinZ = pivot.z;
      var verticalUp = points.MT.z - pinZ;
      measuredB5 = pinZ - points.MT.z;
      if (measuredB5 >= 0) {
        warnings.push(
          'Measured B5 is not negative — Mast Tilt (MT) is at or below the X-pin center elevation. On PD25, MT should be above the mast pivot; check the MT shot and resection.'
        );
      }
      offsetOverrides = {
        horizontal: xPinHorizontalOffset,
        vertical: verticalUp,
      };
    }

    var offset = buildOffsetLine(points.ML, points.MR, coordUnits, offsetOverrides);
    var linePt1 = offset.linePt1;
    var linePt2 = offset.linePt2;
    var centerRef = buildCenterRef(linePt1, linePt2, coordUnits);

    /**
     * Prefer Siteworks COGO points from CSV in prepopulated mode.
     * Measure-B5 mode always uses calculator COGO so G* match measured MT/B5.
     */
    var useCsvCogo = b5Method !== 'measure';
    var dnoCenterRef =
      useCsvCogo && refCenter ? refCenter : snapCogoPoint(centerRef, coordUnits);
    var dnoLinePt2 =
      useCsvCogo && refLinePt2 ? refLinePt2 : snapCogoPoint(linePt2, coordUnits);
    if (useCsvCogo && refLinePt1) linePt1 = refLinePt1;

    var mbApc = applyApcCorrection(points.MB, rodSubtractNative);
    var hApc = applyApcCorrection(points.H, rodSubtractNative);

    var tol = units === 'METRIC' ? 0.002 : 0.01;
    var validation = {
      linePt1: comparePoints(linePt1, refLinePt1, tol),
      linePt2: comparePoints(linePt2, refLinePt2, tol),
      centerRef: comparePoints(centerRef, refCenter, tol),
      hasReferencePoints: !!(refLinePt1 || refLinePt2 || refCenter),
    };

    var mbOff = antennaOffsetsFromCenterRef(dnoCenterRef, dnoLinePt2, mbApc);
    var hOff = antennaOffsetsFromCenterRef(dnoCenterRef, dnoLinePt2, hApc);

    var g7Signed = inverseVertical(mbApc, points.ML);
    var g7Value = g7Vertical(mbApc, points.ML);

    var hcCorrection = null;
    var hcCenter = null;
    var hammerCenter = null;
    var hcFaceOffset = surveyOptions.hcFaceOffset;
    if (hcFaceOffset != null && hcFaceOffset !== '') {
      var faceParsed = parseFloat(hcFaceOffset);
      if (isNaN(faceParsed)) hcFaceOffset = 0;
    }

    if (points.HC) {
      hcCorrection = correctHcToHammerCenter(points.HC, pivot, hcFaceOffset);
      hcCenter = hcCorrection.center;
      hammerCenter = hcCenter;
    }

    var results = {
      G6: {
        label: 'Moving base antenna — Down from CENTER REF',
        value: mbOff.g6g2,
        source: 'Down & Out from Baseline — CENTER REF → Line PT2, MB APC',
      },
      G5: {
        label: 'Moving base antenna — Out from CENTER REF',
        value: mbOff.g5g1,
        source: 'Down & Out from Baseline — CENTER REF → Line PT2, MB APC',
      },
      G2: {
        label: 'Heading antenna — Down from CENTER REF',
        value: hOff.g6g2,
        source: 'Down & Out from Baseline — CENTER REF → Line PT2, H APC',
      },
      G1: {
        label: 'Heading antenna — Out from CENTER REF',
        value: hOff.g5g1,
        source: 'Down & Out from Baseline — CENTER REF → Line PT2, H APC',
      },
      G7: {
        label: 'Vertical — Moving Base APC to ML (Y pivot pin center)',
        value: g7Value,
        signedInverse: g7Signed,
        source:
          'Inverse vertical — MB APC → ML' +
          (rodSubtractNative > 0
            ? ' (post height ' +
              formatGroundworksValue(rodPostHeight) +
              ' ' +
              displayConstants.unitLabel +
              ' + ' +
              formatGroundworksValue(apcOffsetAdded) +
              ' ' +
              displayConstants.unitLabel +
              ' APC offset subtracted from MB/H)'
            : ''),
      },
    };

    if (measuredB5 != null) {
      results.B5 = {
        label: 'Y pivot pin center to X tilt pin (Mast Tilt)',
        value: measuredB5,
        signedInverse: measuredB5,
        source:
          'Measured (BETA) — X-pin center elev − MT elev (flange→pin horizontal ' +
          formatGroundworksValue(xPinHorizontalOffset) +
          ' ' +
          displayConstants.unitLabel +
          ')',
      };
    }

    if (hammerCenter) {
      var t1Horiz = horizDist(dnoCenterRef, hammerCenter);
      var t1Dno = downAndOutFromBaseline(dnoCenterRef, dnoLinePt2, hammerCenter);
      results.T1 = {
        label: 'Horizontal distance — CENTER REF (Y pivot line) to hammer center',
        value: t1Horiz,
        signedOut: t1Dno.out,
        signedDown: t1Dno.down,
        vertical: hammerCenter.z - centerRef.z,
        source:
          'Plan distance — CENTER REF → corrected HC (hammer center)' +
          (hcCorrection && hcCorrection.offsetApplied
            ? ' (face offset ' +
              formatGroundworksValue(hcCorrection.offsetApplied) +
              ' ' +
              displayConstants.unitLabel +
              ' toward ML/MR applied)'
            : ''),
      };
    }

    if (points.MF) {
      var t5Signed = dnoCenterRef.z - points.MF.z;
      results.T5 = {
        label: 'Vertical — CENTER REF to mast foot (MF)',
        value: t5Signed,
        signedInverse: t5Signed,
        source: 'Inverse vertical — CENTER REF elevation − MF elevation',
      };
    }

    applyGroundworksDisplay(results);

    var okMessage =
      b5Method === 'measure'
        ? 'Survey parsed. B5 measured from MT (BETA — verify vs OEM); G1, G2, G5, and G6 rebuilt from measured CENTER REF.'
        : validation.hasReferencePoints
          ? 'Survey parsed. Computed COGO points compared to optional reference points in CSV.'
          : 'Survey parsed. G1, G2, G5, G6, and G7 calculated from ML, MR, MB, and H.';
    if (b5Method !== 'measure') {
      okMessage +=
        (hammerCenter ? ' T1 included from HC.' : '') + (points.MF ? ' T5 included from MF.' : '');
    } else {
      okMessage +=
        (hammerCenter ? ' T1 included from HC.' : '') + (points.MF ? ' T5 included from MF.' : '');
    }

    return {
      points: points,
      missing: [],
      warnings: warnings,
      units: units,
      coordUnits: coordUnits,
      unitLabel: displayConstants.unitLabel,
      status: 'ok',
      message: okMessage,
      b5Method: b5Method,
      intermediate: {
        linePt1: linePt1,
        linePt2: linePt2,
        centerRef: centerRef,
        dnoCenterRef: dnoCenterRef,
        dnoLinePt2: dnoLinePt2,
        yPivotCenter: pivot,
        mt: points.MT || null,
        measuredB5: measuredB5,
        xPinHorizontalOffset: xPinHorizontalOffset,
        hcMeasured: points.HC || null,
        hcCenter: hcCenter,
        hcFaceOffset: hcCorrection ? hcCorrection.offsetApplied : 0,
        offsetConstants: {
          horizontal: offset.constants.horizontal,
          vertical: offset.constants.vertical,
          centerRefDist: offset.constants.centerRefDist,
          bearingMlMrDeg: offset.bearingMlMrDeg,
        },
      },
      validation: validation,
      groundworks: results,
      rodCorrection: {
        shotWithRod: shotWithRod,
        rodEnteredInSiteworks: rodEnteredInSiteworks,
        rodPostHeight: formatGroundworksValue(rodPostHeight),
        apcOffsetAdded: formatGroundworksValue(apcOffsetAdded),
        rodSubtract: formatGroundworksValue(rodSubtractNative),
        unitLabel: displayConstants.unitLabel,
      },
    };
  }

  return {
    analyzeCsv: analyzeCsv,
    parseSurveyCsv: parseSurveyCsv,
    detectCsvLayout: detectCsvLayout,
    findPoint: findPoint,
    buildOffsetLine: buildOffsetLine,
    buildCenterRef: buildCenterRef,
    defaultRodPostHeight: defaultRodPostHeight,
    defaultRodHeight: defaultRodHeight,
    apcOffsetZephyr3: apcOffsetZephyr3,
    applyApcCorrection: applyApcCorrection,
    correctHcToHammerCenter: correctHcToHammerCenter,
    g7Vertical: g7Vertical,
    leftBackFromCenterRef: antennaOffsetsFromCenterRef,
    antennaOffsetsFromCenterRef: antennaOffsetsFromCenterRef,
    yPivotCenter: yPivotCenter,
    inverseVertical: inverseVertical,
    inverseDistance: inverseDistance,
    downAndOutFromBaseline: downAndOutFromBaseline,
    distance3d: distance3d,
  };
})();
