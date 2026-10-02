/**
 * Siteworks CSV parser for battered-pile rim shots.
 * Point names: {PileID}T1|T2|T3 (top) and {PileID}B1|B2|B3 (bottom).
 * Example: 1001T1, 1001T2, 1001T3, 1001B1, 1001B2, 1001B3
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
    // fuzzy contains
    for (var n = 0; n < names.length; n++) {
      var want = names[n].toLowerCase();
      for (var h = 0; h < lower.length; h++) {
        if (lower[h].indexOf(want) >= 0) return h;
      }
    }
    return -1;
  }

  /**
   * Parse point name → { pileId, ring: 'T'|'B', idx: 1|2|3 }
   */
  function parsePointName(raw) {
    if (raw == null) return null;
    var s = String(raw).trim();
    if (!s) return null;
    // Strip common Siteworks suffixes
    s = s.replace(/_stk$/i, '');
    var m = s.match(/^(.+)([TtBb])([123])$/);
    if (!m) return null;
    return {
      pileId: m[1],
      ring: m[2].toUpperCase(),
      idx: Number(m[3]),
      raw: String(raw).trim(),
      key: m[2].toUpperCase() + m[3],
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

  /**
   * Accepts:
   * - Headered Siteworks export (Point Name, Northing, Easting, Elevation)
   * - Headerless PointID,N,E,Z
   * Returns map of rawName → { name, n, e, z, parsed }
   */
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
    var start = 0;

    if (hasHeader) {
      iName = headerIndex(headers, ['Point Name', 'PointName', 'Name', 'Point ID', 'PointID', 'Code']);
      iN = headerIndex(headers, ['Northing', 'N']);
      iE = headerIndex(headers, ['Easting', 'E']);
      iZ = headerIndex(headers, ['Elevation', 'Elev', 'Z', 'Height']);
      start = 1;
      if (iName < 0 || iN < 0 || iE < 0 || iZ < 0) {
        // Fall back to positional if columns look numeric after header
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
      });
    }

    if (skipped.length) {
      warnings.push(
        sourceName +
          ': ignored ' +
          skipped.length +
          ' point(s) not matching {PileID}T1–T3 / B1–B3 (e.g. ' +
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
