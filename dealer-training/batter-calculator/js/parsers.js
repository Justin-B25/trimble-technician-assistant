/**
 * Siteworks CSV parser for battered-pile rim shots (single pile lab).
 * Preferred names: B1 B2 B3 (bottom) and T1 T2 T3 (top).
 * Legacy {PileID}B1 / {PileID}T1 still accepted and folded into one pile.
 */
var BatterParsers = (function () {
  function toNum(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    var s = String(v).trim().replace(/,/g, '');
    if (!s) return null;
    var n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function parseCsvText(text) {
    var rows = [];
    var i = 0;
    var field = '';
    var row = [];
    var inQuotes = false;
    text = String(text || '').replace(/^\uFEFF/, '');
    while (i < text.length) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i++;
          continue;
        }
        field += c;
        i++;
        continue;
      }
      if (c === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (c === ',') {
        row.push(field);
        field = '';
        i++;
        continue;
      }
      if (c === '\r') {
        i++;
        continue;
      }
      if (c === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        i++;
        continue;
      }
      field += c;
      i++;
    }
    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  function headerIndex(headers, names) {
    var lower = headers.map(function (h) {
      return String(h || '')
        .trim()
        .toLowerCase();
    });
    for (var i = 0; i < names.length; i++) {
      var idx = lower.indexOf(names[i].toLowerCase());
      if (idx >= 0) return idx;
    }
    for (var n = 0; n < names.length; n++) {
      var want = names[n].toLowerCase();
      for (var h = 0; h < lower.length; h++) {
        if (lower[h].indexOf(want) >= 0) return h;
      }
    }
    return -1;
  }

  function headerExact(headers, names) {
    var lower = headers.map(function (h) {
      return String(h || '')
        .trim()
        .toLowerCase();
    });
    for (var i = 0; i < names.length; i++) {
      var idx = lower.indexOf(names[i].toLowerCase());
      if (idx >= 0) return idx;
    }
    return -1;
  }

  function parseAngle(v) {
    if (v == null || v === '') return null;
    var s = String(v)
      .trim()
      .replace(/°/g, '')
      .replace(/\u00b0/g, '')
      .replace(/[^\d.+\-eE]/g, '');
    if (!s) return null;
    var n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * Parse point name → { pileId, ring: 'T'|'B', idx: 1|2|3 }
   * Station 4 uses a single pile; all matches fold to pileId "1".
   */
  function parsePointName(raw) {
    if (raw == null) return null;
    var s = String(raw).trim();
    if (!s) return null;
    s = s.replace(/_stk$/i, '');

    // Preferred: B1 / T2
    var m = s.match(/^([TtBb])([123])$/);
    if (m) {
      return {
        pileId: '1',
        ring: m[1].toUpperCase(),
        idx: Number(m[2]),
        raw: String(raw).trim(),
        key: m[1].toUpperCase() + m[2],
      };
    }

    // Legacy: 1001B1 / PILE1T3 — fold into the single lab pile
    var m2 = s.match(/^(.+)([TtBb])([123])$/);
    if (!m2) return null;
    return {
      pileId: '1',
      ring: m2[2].toUpperCase(),
      idx: Number(m2[3]),
      raw: String(raw).trim(),
      key: m2[2].toUpperCase() + m2[3],
    };
  }

  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(String(reader.result || ''));
      };
      reader.onerror = function () {
        reject(new Error('Failed to read ' + file.name));
      };
      reader.readAsText(file);
    });
  }

  function parseSiteworksCsv(text, sourceName) {
    var rows = parseCsvText(text);
    var points = [];
    var warnings = [];
    var skipped = [];
    if (!rows.length) {
      return { points: points, warnings: ['Empty file: ' + sourceName], skipped: skipped };
    }

    var headers = rows[0].map(function (h) {
      return String(h || '').trim();
    });
    var hasHeader =
      /point|name|id|north|east|elev/i.test(headers[0] || '') ||
      headerIndex(headers, ['Point Name', 'Northing', 'Easting', 'Elevation']) >= 0;

    var iName = -1;
    var iN = -1;
    var iE = -1;
    var iZ = -1;
    var iTh = -1;
    var iTilt = -1;
    var iPitch = -1;
    var iRoll = -1;
    var iAuto = -1;
    var start = 0;

    if (hasHeader) {
      iName = headerIndex(headers, ['Point Name', 'PointName', 'Name', 'Point ID', 'PointID', 'Code']);
      iN = headerIndex(headers, ['Northing', 'N']);
      iE = headerIndex(headers, ['Easting', 'E']);
      iZ = headerIndex(headers, ['Elevation', 'Elev', 'Z', 'Height']);
      iTh = headerExact(headers, ['Target Height']);
      iTilt = headerExact(headers, ['Tilt Angle']);
      iPitch = headerExact(headers, ['Pitch']);
      iRoll = headerExact(headers, ['Roll']);
      iAuto = headerExact(headers, ['Auto Pole Height']);
      start = 1;
      if (iName < 0 || iN < 0 || iE < 0 || iZ < 0) {
        iName = 0;
        iN = 1;
        iE = 2;
        iZ = 3;
        warnings.push(
          sourceName + ': could not match all header names — using columns 1–4 (Name, N, E, Z)'
        );
      }
    } else {
      iName = 0;
      iN = 1;
      iE = 2;
      iZ = 3;
    }

    for (var r = start; r < rows.length; r++) {
      var cells = rows[r];
      if (!cells || !cells.length) continue;
      var name = String(cells[iName] || '').trim();
      if (!name) continue;
      var n = toNum(cells[iN]);
      var e = toNum(cells[iE]);
      var z = toNum(cells[iZ]);
      if (n == null || e == null || z == null) {
        warnings.push(sourceName + ': skipped ' + name + ' (incomplete N/E/Z)');
        continue;
      }
      var parsed = parsePointName(name);
      if (!parsed) {
        skipped.push(name);
        continue;
      }
      points.push({
        name: name,
        n: n,
        e: e,
        z: z,
        parsed: parsed,
        source: sourceName,
        targetHeight: iTh >= 0 ? toNum(cells[iTh]) : null,
        tiltAngleDeg: iTilt >= 0 ? parseAngle(cells[iTilt]) : null,
        pitchDeg: iPitch >= 0 ? parseAngle(cells[iPitch]) : null,
        rollDeg: iRoll >= 0 ? parseAngle(cells[iRoll]) : null,
        autoPoleHeight: iAuto >= 0 ? String(cells[iAuto] || '').trim() : '',
      });
    }

    if (skipped.length) {
      warnings.push(
        sourceName +
          ': ignored ' +
          skipped.length +
          ' point(s) not matching B1–B3 / T1–T3 (e.g. ' +
          skipped.slice(0, 3).join(', ') +
          (skipped.length > 3 ? '…' : '') +
          ')'
      );
    }

    return { points: points, warnings: warnings, skipped: skipped };
  }

  async function loadCsvFiles(files) {
    var allPoints = [];
    var warnings = [];
    var filesUsed = [];
    for (var i = 0; i < files.length; i++) {
      var text = await readFileAsText(files[i]);
      var result = parseSiteworksCsv(text, files[i].name);
      filesUsed.push(files[i].name);
      warnings = warnings.concat(result.warnings || []);
      allPoints = allPoints.concat(result.points || []);
    }
    return { points: allPoints, warnings: warnings, files: filesUsed };
  }

  return {
    parsePointName: parsePointName,
    parseSiteworksCsv: parseSiteworksCsv,
    loadCsvFiles: loadCsvFiles,
    toNum: toNum,
  };
})();
