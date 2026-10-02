/**
 * Siteworks CSV parser for ST30 Top Mount Exercise (Activities A/B).
 * BENCH | TM_UP_0Plumb/5/15/30 | TM_FLIP_0Plumb/5/15/30
 */
var TipDevParsers = (function () {
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
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { inQuotes = true; i++; continue; }
      if (c === ',') { row.push(field); field = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      field += c; i++;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function headerIndex(headers, names) {
    var lower = headers.map(function (h) { return String(h || '').trim().toLowerCase(); });
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

  function normalizeTiltToken(tok) {
    var t = String(tok || '').trim().toUpperCase().replace(/°/g, '').replace(/\s+/g, '');
    if (t === '0PLUMB' || t === 'PLUMB' || t === '0P' || t === '0') return 0;
    if (t === '5' || t === '5DEG' || t === '05') return 5;
    if (t === '15' || t === '15DEG') return 15;
    if (t === '30' || t === '30DEG') return 30;
    var m = t.match(/^(\d+)/);
    if (m) {
      var n = Number(m[1]);
      if (n === 0 || n === 5 || n === 15 || n === 30) return n;
    }
    return null;
  }

  function parsePointName(raw) {
    if (raw == null) return null;
    var s = String(raw).trim().replace(/_stk$/i, '');
    if (!s) return null;
    var up = s.toUpperCase();
    if (up === 'BENCH' || up === 'BENCHMARK' || up === 'CP' || up === 'KNOWN' || up === 'CONTROL' || up === 'REF') {
      return { kind: 'bench', raw: s };
    }
    var m = up.match(/^(TM_UP|TM_FLIP|ACTIVITY_A|ACTIVITY_B|TIP_DOWN|TIP_UP)[_\-]?(.+)$/);
    if (!m) return null;
    var tilt = normalizeTiltToken(m[2]);
    if (tilt == null) return null;
    var activity = (m[1] === 'TM_FLIP' || m[1] === 'ACTIVITY_B' || m[1] === 'TIP_UP') ? 'B' : 'A';
    return {
      kind: 'shot',
      activity: activity,
      tilt: tilt,
      label: (activity === 'A' ? 'TM_UP_' : 'TM_FLIP_') + (tilt === 0 ? '0Plumb' : String(tilt)),
      raw: s,
    };
  }

  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(new Error('Failed to read ' + file.name)); };
      reader.readAsText(file);
    });
  }

  function parseSiteworksCsv(text, sourceName) {
    var rows = parseCsvText(text);
    var points = [];
    var warnings = [];
    var skipped = [];
    if (!rows.length) return { points: points, warnings: ['Empty file: ' + sourceName], skipped: skipped };

    var headers = rows[0].map(function (h) { return String(h || '').trim(); });
    var hasHeader = /point|name|id|north|east|elev/i.test(headers[0] || '') ||
      headerIndex(headers, ['Point Name', 'Northing', 'Easting', 'Elevation']) >= 0;
    var iName = 0, iN = 1, iE = 2, iZ = 3, start = 0;
    if (hasHeader) {
      iName = headerIndex(headers, ['Point Name', 'PointName', 'Name', 'Point ID', 'PointID', 'Code']);
      iN = headerIndex(headers, ['Northing', 'N']);
      iE = headerIndex(headers, ['Easting', 'E']);
      iZ = headerIndex(headers, ['Elevation', 'Elev', 'Z', 'Height']);
      start = 1;
      if (iName < 0 || iN < 0 || iE < 0 || iZ < 0) {
        iName = 0; iN = 1; iE = 2; iZ = 3;
        warnings.push(sourceName + ': using columns 1–4 (Name, N, E, Z)');
      }
    }

    for (var r = start; r < rows.length; r++) {
      var cells = rows[r];
      if (!cells || !cells.length) continue;
      var name = String(cells[iName] || '').trim();
      if (!name) continue;
      var n = toNum(cells[iN]), e = toNum(cells[iE]), z = toNum(cells[iZ]);
      if (n == null || e == null || z == null) {
        warnings.push(sourceName + ': skipped ' + name + ' (incomplete N/E/Z)');
        continue;
      }
      var parsed = parsePointName(name);
      if (!parsed) { skipped.push(name); continue; }
      points.push({ name: name, n: n, e: e, z: z, parsed: parsed, source: sourceName });
    }
    if (skipped.length) {
      warnings.push(sourceName + ': ignored ' + skipped.length + ' unmatched name(s)');
    }
    return { points: points, warnings: warnings, skipped: skipped };
  }

  async function loadCsvFiles(files) {
    var all = [], warnings = [], filesUsed = [];
    for (var i = 0; i < files.length; i++) {
      var text = await readFileAsText(files[i]);
      var result = parseSiteworksCsv(text, files[i].name);
      filesUsed.push(files[i].name);
      warnings = warnings.concat(result.warnings || []);
      all = all.concat(result.points || []);
    }
    return { points: all, warnings: warnings, files: filesUsed };
  }

  return {
    parsePointName: parsePointName,
    parseSiteworksCsv: parseSiteworksCsv,
    loadCsvFiles: loadCsvFiles,
    toNum: toNum,
  };
})();
