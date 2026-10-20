/**
 * Parsers for Design CSV, Measured stakeout CSV, and machine quality:
 * Groundworks Quality Metrics XLSX/CSV (TBC export) and on-machine PileQual XML.
 * Supports multiple files per source type; merges into Map by normalized pile ID.
 */
var PileParsers = (function () {
  /** US survey feet per meter (Trimble Civil / US site coords). */
  var METERS_TO_US_FT = 3937 / 1200;
  function normalizeId(raw) {
    if (raw == null) return '';
    var s = String(raw).trim();
    if (!s) return '';
    // Strip stakeout suffix e.g. 5170_stk / 5170_STK
    s = s.replace(/_stk$/i, '');
    // Excel often emits 5017.0 for integer IDs
    if (/^\d+\.0+$/.test(s)) s = String(parseInt(s, 10));
    return s;
  }

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

  function readFileAsArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = function () {
        reject(new Error('Failed to read ' + file.name));
      };
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Design: headerless PointID,Northing,Easting,Elevation[,...]
   * Also accepts a header row if first cell looks like a label.
   */
  function parseDesignCsv(text, sourceName) {
    var rows = parseCsvText(text);
    var map = Object.create(null);
    var warnings = [];
    var start = 0;
    if (rows.length && /point|id|name/i.test(String(rows[0][0] || ''))) {
      start = 1;
    }
    for (var r = start; r < rows.length; r++) {
      var cells = rows[r];
      if (!cells || !cells.length) continue;
      var id = normalizeId(cells[0]);
      if (!id) continue;
      var n = toNum(cells[1]);
      var e = toNum(cells[2]);
      var z = toNum(cells[3]);
      if (n == null || e == null || z == null) {
        warnings.push(sourceName + ': skipped row ' + (r + 1) + ' (incomplete N/E/Z)');
        continue;
      }
      if (map[id]) {
        warnings.push(sourceName + ': duplicate design ID ' + id + ' (last wins)');
      }
      map[id] = { id: id, n: n, e: e, z: z, source: sourceName };
    }
    return { map: map, warnings: warnings, count: Object.keys(map).length };
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
    return -1;
  }

  /**
   * Measured stakeout CSV with Point Name + Northing/Easting/Elevation.
   * Normalizes Point Name by stripping _stk.
   */
  function parseMeasuredCsv(text, sourceName) {
    var rows = parseCsvText(text);
    var map = Object.create(null);
    var warnings = [];
    if (!rows.length) return { map: map, warnings: ['Empty measured file: ' + sourceName], count: 0 };

    var headers = rows[0].map(function (h) {
      return String(h || '').trim();
    });
    var iName = headerIndex(headers, ['Point Name', 'PointName', 'Name', 'Point ID', 'PointID']);
    var iN = headerIndex(headers, ['Northing', 'N']);
    var iE = headerIndex(headers, ['Easting', 'E']);
    var iZ = headerIndex(headers, ['Elevation', 'Elev', 'Z', 'Height']);
    var iHPrec = headerIndex(headers, ['Horizontal Precision', 'Horiz Precision', 'H Precision']);
    var iVPrec = headerIndex(headers, ['Vertical Precision', 'Vert Precision', 'V Precision']);
    var iPrecType = headerIndex(headers, ['Precision Type', 'Solution Type', 'Fix Type']);
    var iPdop = headerIndex(headers, ['PDOP']);
    var iHdop = headerIndex(headers, ['HDOP']);
    var iVdop = headerIndex(headers, ['VDOP']);
    var iTilt = headerIndex(headers, ['Tilt Angle', 'Tilt']);
    if (iName < 0 || iN < 0 || iE < 0 || iZ < 0) {
      return {
        map: map,
        warnings: [sourceName + ': missing Point Name / Northing / Easting / Elevation columns'],
        count: 0,
      };
    }

    for (var r = 1; r < rows.length; r++) {
      var cells = rows[r];
      if (!cells || !cells.length) continue;
      var id = normalizeId(cells[iName]);
      if (!id) continue;
      var n = toNum(cells[iN]);
      var e = toNum(cells[iE]);
      var z = toNum(cells[iZ]);
      if (n == null || e == null || z == null) {
        warnings.push(sourceName + ': skipped ' + id + ' (incomplete N/E/Z)');
        continue;
      }
      if (map[id]) {
        warnings.push(sourceName + ': duplicate measured ID ' + id + ' (last wins)');
      }
      var gnss = {
        hPrec: iHPrec >= 0 ? toNum(cells[iHPrec]) : null,
        vPrec: iVPrec >= 0 ? toNum(cells[iVPrec]) : null,
        precType: iPrecType >= 0 ? String(cells[iPrecType] || '').trim() || null : null,
        pdop: iPdop >= 0 ? toNum(cells[iPdop]) : null,
        hdop: iHdop >= 0 ? toNum(cells[iHdop]) : null,
        vdop: iVdop >= 0 ? toNum(cells[iVdop]) : null,
        tilt: iTilt >= 0 ? toNum(cells[iTilt]) : null,
      };
      map[id] = {
        id: id,
        n: n,
        e: e,
        z: z,
        source: sourceName,
        rawName: String(cells[iName] || '').trim(),
        gnss: gnss,
      };
    }
    return { map: map, warnings: warnings, count: Object.keys(map).length };
  }

  function sheetToAoA(workbook) {
    var sheetName = workbook.SheetNames[0];
    for (var i = 0; i < workbook.SheetNames.length; i++) {
      if (/quality\s*metrics/i.test(workbook.SheetNames[i])) {
        sheetName = workbook.SheetNames[i];
        break;
      }
    }
    var sheet = workbook.Sheets[sheetName];
    return {
      name: sheetName,
      rows: XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }),
    };
  }

  function cellStr(rows, r, c) {
    if (!rows[r] || rows[r][c] == null) return '';
    return String(rows[r][c]).trim();
  }

  /**
   * Locate As-Built Top of Pile Northing/Easting/Elevation columns by header text.
   * Works across LIGHT BLUE (with Splices) and DARK GREEN / YELLOW layouts.
   */
  function findAsBuiltTopCols(rows) {
    var r0 = rows[0] || [];
    var r1 = rows[1] || [];
    var r2 = rows[2] || [];
    var maxCol = Math.max(r0.length, r1.length, r2.length);

    var asBuiltStart = -1;
    for (var c = 0; c < maxCol; c++) {
      if (/as[-\s]?built\s*pile/i.test(cellStr(rows, 0, c))) {
        asBuiltStart = c;
        break;
      }
    }
    if (asBuiltStart < 0) asBuiltStart = 0;

    var topCol = -1;
    for (c = asBuiltStart; c < maxCol; c++) {
      if (/^top\s*of\s*pile$/i.test(cellStr(rows, 1, c))) {
        topCol = c;
        break;
      }
    }
    if (topCol < 0) {
      // Fallback: any Top of Pile after mid-sheet
      for (c = Math.floor(maxCol / 2); c < maxCol; c++) {
        if (/^top\s*of\s*pile$/i.test(cellStr(rows, 1, c))) {
          topCol = c;
          break;
        }
      }
    }
    if (topCol < 0) return null;

    var nCol = -1;
    var eCol = -1;
    var zCol = -1;
    for (c = topCol; c < topCol + 6 && c < maxCol; c++) {
      var h = cellStr(rows, 2, c).toLowerCase();
      if (h === 'northing' && nCol < 0) nCol = c;
      else if (h === 'easting' && eCol < 0) eCol = c;
      else if ((h === 'elevation' || h === 'elev') && zCol < 0) zCol = c;
    }
    if (nCol < 0 || eCol < 0 || zCol < 0) return null;
    return { n: nCol, e: eCol, z: zCol, topCol: topCol, asBuiltStart: asBuiltStart };
  }

  function findPileIdCol(rows) {
    for (var c = 0; c < 5; c++) {
      if (/pile\s*id/i.test(cellStr(rows, 0, c))) return c;
    }
    return 0;
  }

  /**
   * Shared path for Quality Metrics grid (XLSX sheet or TBC CSV export).
   * Uses As-Built Top of Pile Northing / Easting / Elevation.
   */
  function parseMachineQualityRows(rows, sourceName, sheetName) {
    var map = Object.create(null);
    var warnings = [];

    if (!rows || rows.length < 4) {
      return { map: map, warnings: [sourceName + ': not enough rows'], count: 0 };
    }

    var cols = findAsBuiltTopCols(rows);
    if (!cols) {
      return {
        map: map,
        warnings: [
          sourceName + ': could not find As-Built Top of Pile Northing/Easting/Elevation headers',
        ],
        count: 0,
      };
    }

    var idCol = findPileIdCol(rows);
    for (var r = 3; r < rows.length; r++) {
      var row = rows[r];
      if (!row) continue;
      var id = normalizeId(row[idCol]);
      if (!id) continue;
      var n = toNum(row[cols.n]);
      var e = toNum(row[cols.e]);
      var z = toNum(row[cols.z]);
      if (n == null || e == null || z == null) {
        warnings.push(sourceName + ': skipped pile ' + id + ' (incomplete As-Built Top N/E/Z)');
        continue;
      }
      if (map[id]) {
        warnings.push(sourceName + ': duplicate machine ID ' + id + ' (last wins)');
      }
      map[id] = {
        id: id,
        n: n,
        e: e,
        z: z,
        source: sourceName,
        sheet: sheetName || null,
        cols: cols,
        format: 'quality-metrics',
      };
    }
    return { map: map, warnings: warnings, count: Object.keys(map).length, cols: cols };
  }

  function parseMachineXlsx(arrayBuffer, sourceName) {
    if (typeof XLSX === 'undefined') {
      return {
        map: Object.create(null),
        warnings: [
          sourceName +
            ': SheetJS (XLSX) library not loaded — check internet connection when opening this HTML, then reload.',
        ],
        count: 0,
      };
    }
    var workbook = XLSX.read(arrayBuffer, { type: 'array' });
    var parsed = sheetToAoA(workbook);
    return parseMachineQualityRows(parsed.rows, sourceName, parsed.name);
  }

  /** TBC / WorksManager Quality Metrics CSV (same 3-row header as the XLSX). */
  function parseMachineCsv(text, sourceName) {
    var rows = parseCsvText(text);
    return parseMachineQualityRows(rows, sourceName, 'csv');
  }

  function xmlLocalName(node) {
    if (!node || !node.nodeName) return '';
    return String(node.nodeName).replace(/^.*:/, '');
  }

  function xmlChild(parent, name) {
    if (!parent || !parent.childNodes) return null;
    for (var i = 0; i < parent.childNodes.length; i++) {
      var ch = parent.childNodes[i];
      if (ch.nodeType === 1 && xmlLocalName(ch).toLowerCase() === name.toLowerCase()) {
        return ch;
      }
    }
    return null;
  }

  function xmlChildren(parent, name) {
    var out = [];
    if (!parent || !parent.childNodes) return out;
    for (var i = 0; i < parent.childNodes.length; i++) {
      var ch = parent.childNodes[i];
      if (ch.nodeType === 1 && xmlLocalName(ch).toLowerCase() === name.toLowerCase()) {
        out.push(ch);
      }
    }
    return out;
  }

  function xmlPoint(el) {
    if (!el) return null;
    var xEl = xmlChild(el, 'PointX');
    var yEl = xmlChild(el, 'PointY');
    var zEl = xmlChild(el, 'PointZ');
    var x = toNum(xEl && xEl.textContent);
    var y = toNum(yEl && yEl.textContent);
    var z = toNum(zEl && zEl.textContent);
    if (x == null || y == null || z == null) return null;
    return { x: x, y: y, z: z };
  }

  /**
   * Groundworks on-machine PileQual XML (no TBC report needed).
   * Tablet stores SI meters: PointX→Northing, PointY→Easting.
   * As-Built Top ≈ StartPoint N/E + EndPoint Z (matches TBC Quality Metrics CSV).
   */
  function parseMachinePileQualXml(text, sourceName) {
    var map = Object.create(null);
    var warnings = [];
    var doc;
    try {
      doc = new DOMParser().parseFromString(String(text || ''), 'application/xml');
    } catch (err) {
      return {
        map: map,
        warnings: [sourceName + ': failed to parse XML'],
        count: 0,
      };
    }
    if (doc.querySelector('parsererror')) {
      return {
        map: map,
        warnings: [sourceName + ': invalid XML'],
        count: 0,
      };
    }

    var root = doc.documentElement;
    if (!root || !/pilequal/i.test(xmlLocalName(root))) {
      warnings.push(sourceName + ': root is not PileQual — parsing pile nodes anyway');
    }

    var pileNodes = doc.getElementsByTagName('Pile');
    if (!pileNodes.length) {
      // Case / namespace fallback
      var all = doc.getElementsByTagName('*');
      pileNodes = [];
      for (var i = 0; i < all.length; i++) {
        if (xmlLocalName(all[i]) === 'Pile') pileNodes.push(all[i]);
      }
    }

    var scale = METERS_TO_US_FT;
    var sample = null;
    for (var p = 0; p < pileNodes.length; p++) {
      var pileEl = pileNodes[p];
      var id = normalizeId(pileEl.getAttribute('id') || pileEl.getAttribute('name'));
      if (!id) continue;

      var splices = xmlChildren(pileEl, 'Splice');
      var splice = splices.length ? splices[splices.length - 1] : xmlChild(pileEl, 'Splice');
      if (!splice) {
        warnings.push(sourceName + ': pile ' + id + ' has no Splice — skipped');
        continue;
      }

      var start = xmlPoint(xmlChild(splice, 'StartPoint'));
      var end = xmlPoint(xmlChild(splice, 'EndPoint'));
      if (!start) {
        warnings.push(sourceName + ': pile ' + id + ' missing StartPoint — skipped');
        continue;
      }

      // Heuristic: large XY already look like site feet — leave as-is.
      if (!sample) {
        sample = start;
        if (Math.abs(start.x) > 10000 || Math.abs(start.y) > 10000) {
          scale = 1;
          warnings.push(
            sourceName +
              ': coordinates look like feet already — no m→ft conversion applied'
          );
        } else {
          warnings.push(
            sourceName +
              ': PileQual XML in meters — converted to US survey feet (PointX=N, PointY=E; Top Z from EndPoint)'
          );
        }
      }

      var n = start.x * scale;
      var e = start.y * scale;
      var z = (end && end.z != null ? end.z : start.z) * scale;

      if (map[id]) {
        warnings.push(sourceName + ': duplicate machine ID ' + id + ' (last wins)');
      }
      map[id] = {
        id: id,
        n: n,
        e: e,
        z: z,
        source: sourceName,
        format: 'pilequal-xml',
        scale: scale,
      };
    }

    return { map: map, warnings: warnings, count: Object.keys(map).length };
  }

  function machineFileKind(fileName) {
    var n = String(fileName || '').toLowerCase();
    if (n.endsWith('.xml')) return 'xml';
    if (n.endsWith('.csv')) return 'csv';
    if (n.endsWith('.xlsx') || n.endsWith('.xls')) return 'xlsx';
    return 'unknown';
  }

  async function parseMachineFile(file) {
    var kind = machineFileKind(file.name);
    if (kind === 'xml') {
      var xmlText = await readFileAsText(file);
      return parseMachinePileQualXml(xmlText, file.name);
    }
    if (kind === 'csv') {
      var csvText = await readFileAsText(file);
      return parseMachineCsv(csvText, file.name);
    }
    if (kind === 'xlsx') {
      var buf = await readFileAsArrayBuffer(file);
      return parseMachineXlsx(buf, file.name);
    }
    return {
      map: Object.create(null),
      warnings: [
        file.name +
          ': unsupported machine file type — use Quality Metrics .xlsx/.csv or PileQual .xml',
      ],
      count: 0,
    };
  }

  function mergeMaps(parts) {
    var out = Object.create(null);
    var warnings = [];
    var files = [];
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      files.push(part.fileName);
      warnings = warnings.concat(part.warnings || []);
      var keys = Object.keys(part.map);
      for (var k = 0; k < keys.length; k++) {
        var id = keys[k];
        if (out[id]) {
          warnings.push('Merged duplicate ID ' + id + ' across files (last wins: ' + part.fileName + ')');
        }
        out[id] = part.map[id];
      }
    }
    return { map: out, warnings: warnings, files: files, count: Object.keys(out).length };
  }

  async function loadDesignFiles(files) {
    var parts = [];
    for (var i = 0; i < files.length; i++) {
      var text = await readFileAsText(files[i]);
      var result = parseDesignCsv(text, files[i].name);
      parts.push({ map: result.map, warnings: result.warnings, fileName: files[i].name });
    }
    return mergeMaps(parts);
  }

  async function loadMeasuredFiles(files) {
    var parts = [];
    for (var i = 0; i < files.length; i++) {
      var text = await readFileAsText(files[i]);
      var result = parseMeasuredCsv(text, files[i].name);
      parts.push({ map: result.map, warnings: result.warnings, fileName: files[i].name });
    }
    return mergeMaps(parts);
  }

  async function loadMachineFiles(files) {
    var parts = [];
    for (var i = 0; i < files.length; i++) {
      var result = await parseMachineFile(files[i]);
      parts.push({ map: result.map, warnings: result.warnings, fileName: files[i].name });
    }
    return mergeMaps(parts);
  }

  return {
    normalizeId: normalizeId,
    parseDesignCsv: parseDesignCsv,
    parseMeasuredCsv: parseMeasuredCsv,
    parseMachineXlsx: parseMachineXlsx,
    parseMachineCsv: parseMachineCsv,
    parseMachinePileQualXml: parseMachinePileQualXml,
    loadDesignFiles: loadDesignFiles,
    loadMeasuredFiles: loadMeasuredFiles,
    loadMachineFiles: loadMachineFiles,
    readFileAsText: readFileAsText,
    readFileAsArrayBuffer: readFileAsArrayBuffer,
  };
})();
