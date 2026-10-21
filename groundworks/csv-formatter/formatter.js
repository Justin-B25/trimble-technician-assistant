/**
 * Validate and format pile/point CSV files for Trimble Groundworks v2.0+ direct import.
 */
var GwCsvFormatter = (function () {
  'use strict';

  var TBC_HEADER = [
    'Name',
    'Easting',
    'Northing',
    'Height',
    'Inclination',
    'Inc heading',
    'Heading',
    'Cross size',
    'Along size',
    'Length',
    'Type',
    'Is Placed',
    'Placed Easting',
    'Placed Northing',
    'Placed Height',
    'Placed Inclination',
    'Placed Inclination heading',
    'Placed Heading',
  ];

  var GROUNDWORKS_HEADER = ['ID', 'X', 'Y', 'Z', 'Orientation', 'Inclination', 'Rotation', 'Length'];

  var LINEAR_FIELDS = ['X', 'Y', 'Z', 'Length'];
  var MAX_VALIDATION_ISSUES = 100;
  var NUMERIC_SAMPLE_ROWS = 400;

  function normalizeInputUnits(units) {
    var raw = String(units || '').trim().toUpperCase();
    if (raw === 'METRIC') return 'METRIC';
    if (raw === 'INTL FT' || raw === 'INTERNATIONAL FT') return 'INTL FT';
    return 'US FT';
  }

  function inputUnitLabel(units) {
    var normalized = normalizeInputUnits(units);
    if (normalized === 'METRIC') return 'm';
    if (normalized === 'INTL FT') return 'international ft';
    return 'US survey ft';
  }

  function linearUnitSuffix(units) {
    var normalized = normalizeInputUnits(units);
    if (normalized === 'METRIC') return 'm';
    if (normalized === 'INTL FT') return "Int'l ft";
    return 'US ft';
  }

  function formatLinearValue(value) {
    var str = String(value || '').trim();
    if (!str) return '';
    var num = parseFloat(str);
    if (isNaN(num)) return str;
    return String(Math.round(num * 1000) / 1000);
  }

  function applyInputUnits(records) {
    records.forEach(function (rec) {
      LINEAR_FIELDS.forEach(function (field) {
        if (rec[field]) rec[field] = formatLinearValue(rec[field]);
      });
    });
  }

  var NUMERIC_FIELDS_TBC = {
    Easting: true,
    Northing: true,
    Height: true,
    Inclination: true,
    'Inc heading': true,
    Heading: true,
    'Cross size': true,
    'Along size': true,
    Length: true,
    Type: true,
    'Is Placed': true,
    'Placed Easting': true,
    'Placed Northing': true,
    'Placed Height': true,
    'Placed Inclination': true,
    'Placed Inclination heading': true,
    'Placed Heading': true,
  };

  function normalizeHeader(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  function detectDelimiter(sample) {
    var commas = (sample.match(/,/g) || []).length;
    var semis = (sample.match(/;/g) || []).length;
    return semis > commas ? ';' : ',';
  }

  function parseCsvText(text) {
    if (!text) throw new Error('CSV file is empty.');
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    if (!text.trim()) throw new Error('CSV file is empty.');

    var delimiter = detectDelimiter(text.split(/\r?\n/)[0] || '');
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
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === delimiter) {
        row.push(cell);
        cell = '';
      } else if (c === '\r') {
      } else if (c === '\n') {
        row.push(cell);
        if (row.some(function (v) { return String(v).trim() !== ''; })) rows.push(row);
        row = [];
        cell = '';
      } else cell += c;
    }
    if (cell.length || row.length) {
      row.push(cell);
      if (row.some(function (v) { return String(v).trim() !== ''; })) rows.push(row);
    }
    if (!rows.length) throw new Error('CSV has no rows.');

    var header = rows[0].map(function (h) { return String(h).trim(); });
    var records = [];
    for (var r = 1; r < rows.length; r++) {
      var dataRow = rows[r];
      if (!dataRow.some(function (v) { return String(v).trim() !== ''; })) continue;
      var padded = dataRow.slice();
      while (padded.length < header.length) padded.push('');
      var rec = {};
      for (var h = 0; h < header.length; h++) {
        rec[header[h]] = String(padded[h] != null ? padded[h] : '').trim();
      }
      records.push(rec);
    }
    return { header: header, records: records, delimiter: delimiter, rows: rows };
  }

  function parseCsvRaw(text) {
    var parsed = parseCsvText(text);
    return {
      delimiter: parsed.delimiter,
      rows: parsed.rows,
    };
  }

  function columnLabel(index, headerValue) {
    var label = String(headerValue || '').trim();
    if (label) return label;
    return 'Column ' + (index + 1);
  }

  function isNumericValue(value) {
    if (value === '' || value == null) return false;
    return !isNaN(parseFloat(String(value).trim()));
  }

  function columnNumericRatio(column, dataRows) {
    var numeric = 0;
    var total = 0;
    var limit = dataRows.length > NUMERIC_SAMPLE_ROWS ? NUMERIC_SAMPLE_ROWS : dataRows.length;
    var r;
    for (r = 0; r < limit; r++) {
      var row = dataRows[r];
      var value = String(row[column.index] != null ? row[column.index] : '').trim();
      if (!value) continue;
      total++;
      if (isNumericValue(value)) numeric++;
    }
    if (!total) return 0;
    return numeric / total;
  }

  function pushValidationIssue(issues, message) {
    if (issues.length >= MAX_VALIDATION_ISSUES) {
      issues.truncated = true;
      return false;
    }
    issues.push(message);
    return true;
  }

  function finishValidationIssues(issues, totalRows) {
    if (issues.truncated) {
      issues.push(
        'Validation stopped after ' +
          MAX_VALIDATION_ISSUES +
          ' issue(s). Fix these and re-run preview (' +
          totalRows +
          ' row(s) in file).'
      );
    }
    return issues;
  }

  var FIELD_ALIASES = {
    ID: ['id', 'name', 'point', 'point name', 'pile', 'pile id', 'pt', 'code', 'label', 'point id'],
    X: ['x', 'easting', 'east', 'longitude', 'grid e'],
    Y: ['y', 'northing', 'north', 'latitude', 'grid n'],
    Z: ['z', 'elevation', 'elev', 'height', 'el', 'altitude'],
    Orientation: ['orientation', 'heading', 'azimuth', 'bearing'],
    Inclination: ['inclination', 'tilt', 'pitch'],
    Rotation: ['rotation', 'roll', 'inc heading', 'inclination heading'],
    Length: ['length', 'depth', 'embedment', 'pile length'],
  };

  function parseIgnoreRows(spec) {
    var ignored = {};
    if (!spec || !String(spec).trim()) return ignored;

    String(spec)
      .split(',')
      .map(function (part) {
        return part.trim();
      })
      .filter(Boolean)
      .forEach(function (part) {
        if (/\.\.\./.test(part)) {
          var nums = part
            .split(/\.\.\.+/)
            .map(function (value) {
              return parseInt(value.trim(), 10);
            })
            .filter(function (value) {
              return !isNaN(value) && value > 0;
            });
          if (nums.length >= 2) {
            var lo = Math.min(nums[0], nums[nums.length - 1]);
            var hi = Math.max(nums[0], nums[nums.length - 1]);
            var i;
            for (i = lo; i <= hi; i++) ignored[i] = true;
          }
          return;
        }
        if (/^\d+\s*-\s*\d+$/.test(part)) {
          var bounds = part.split('-').map(function (value) {
            return parseInt(value.trim(), 10);
          });
          var low = Math.min(bounds[0], bounds[1]);
          var high = Math.max(bounds[0], bounds[1]);
          var j;
          for (j = low; j <= high; j++) {
            if (j > 0) ignored[j] = true;
          }
          return;
        }
        var rowNum = parseInt(part, 10);
        if (!isNaN(rowNum) && rowNum > 0) ignored[rowNum] = true;
      });

    return ignored;
  }

  function resolveIgnoredRows(spec, hasHeaderRow) {
    var ignored = parseIgnoreRows(spec);
    if (hasHeaderRow) ignored[1] = true;
    return ignored;
  }

  function ignoredRowsList(ignored) {
    return Object.keys(ignored || {})
      .map(function (key) {
        return parseInt(key, 10);
      })
      .filter(function (value) {
        return !isNaN(value) && value > 0;
      })
      .sort(function (a, b) {
        return a - b;
      });
  }

  function formatIgnoreRowsList(ignored) {
    return ignoredRowsList(ignored).join(', ');
  }

  function buildSourceTable(parsed, options) {
    options = options || {};
    var rows = parsed.rows;
    if (!rows || !rows.length) throw new Error('CSV has no rows.');

    var hasHeaderRow = options.hasHeaderRow !== false;
    var ignored = resolveIgnoredRows(options.ignoreRows, hasHeaderRow);
    var ignoredList = ignoredRowsList(ignored);
    var maxCols = 0;
    rows.forEach(function (row) {
      maxCols = Math.max(maxCols, row.length);
    });

    var headerRow = hasHeaderRow ? rows[0] : null;
    var dataRows = [];
    rows.forEach(function (row, index) {
      var fileRowNum = index + 1;
      if (ignored[fileRowNum]) return;
      if (hasHeaderRow && index === 0) return;
      if (
        !row.some(function (cell) {
          return String(cell || '').trim() !== '';
        })
      ) {
        return;
      }
      dataRows.push(row);
    });

    var columns = [];
    var c;
    for (c = 0; c < maxCols; c++) {
      var rawHeader = headerRow ? String(headerRow[c] != null ? headerRow[c] : '') : '';
      var headerText = rawHeader.trim();
      var label = headerText || 'Column ' + (c + 1);
      var samples = [];
      var r;
      for (r = 0; r < dataRows.length && samples.length < 3; r++) {
        var sample = String(dataRows[r][c] != null ? dataRows[r][c] : '').trim();
        if (sample) samples.push(sample);
      }
      columns.push({
        index: c,
        label: label,
        headerText: headerText,
        rawHeader: rawHeader,
        samples: samples,
        numericRatio: 0,
      });
    }

    columns.forEach(function (col) {
      col.numericRatio = columnNumericRatio(col, dataRows);
    });

    return {
      columns: columns,
      dataRows: dataRows,
      hasHeaderRow: hasHeaderRow,
      delimiter: parsed.delimiter,
      ignoredRows: ignoredList,
      totalFileRows: rows.length,
    };
  }

  function guessColumnMapping(columns) {
    var mapping = {};
    var used = {};

    function claim(field, colIndex) {
      if (colIndex == null || used[colIndex]) return false;
      mapping[field] = colIndex;
      used[colIndex] = true;
      return true;
    }

    GROUNDWORKS_HEADER.forEach(function (field) {
      var aliases = FIELD_ALIASES[field] || [];
      var i;
      for (i = 0; i < columns.length; i++) {
        if (used[i]) continue;
        var labelNorm = normalizeHeader(columns[i].headerText || columns[i].label);
        if (!labelNorm) continue;
        var matched = aliases.some(function (alias) {
          if (!alias) return false;
          // Require meaningful overlap — empty labelNorm would match every alias via indexOf('').
          return (
            labelNorm === alias ||
            (alias.length >= 2 && labelNorm.indexOf(alias) !== -1) ||
            (labelNorm.length >= 2 && alias.indexOf(labelNorm) !== -1)
          );
        });
        if (matched) claim(field, i);
      }
    });

    return mapping;
  }

  function recordsFromMapping(dataRows, mapping, options) {
    options = options || {};
    var fieldConstants = options.fieldConstants || {};
    var records = [];

    dataRows.forEach(function (row) {
      var rec = {};
      GROUNDWORKS_HEADER.forEach(function (field) {
        var colIndex = mapping[field];
        var value = '';
        if (colIndex != null && colIndex !== '') {
          value = String(row[colIndex] != null ? row[colIndex] : '').trim();
        }
        if (!value) {
          var constant = fieldConstants[field];
          if (constant != null && String(constant).trim() !== '') {
            value = String(constant).trim();
          }
        }
        rec[field] = value;
      });
      if (!String(rec.ID || '').trim()) return;
      records.push(rec);
    });

    applyGroundworksDefaults(records);
    applyInputUnits(records);
    return records;
  }

  function processWithMapping(sourceTable, mapping, options) {
    options = options || {};
    var gwRecords = recordsFromMapping(sourceTable.dataRows, mapping, options);
    var issues = validateGroundworksRecords(gwRecords);
    var result = {
      ok: issues.length === 0 && !issues.truncated,
      issues: issues,
      pileCount: gwRecords.length,
      groundworksRecords: gwRecords,
      mapping: mapping,
      inputUnits: normalizeInputUnits(options.inputUnits),
      inputUnitLabel: inputUnitLabel(options.inputUnits),
    };

    if (options.validateOnly) return result;

    result.outputHeader = GROUNDWORKS_HEADER;
    result.outputRecords = gwRecords;
    result.outputDelimiter = ';';
    result.outputCsv = recordsToCsv(GROUNDWORKS_HEADER, gwRecords, ';');
    return result;
  }

  function isHeaderRow(header, expected) {
    var normalized = {};
    header.forEach(function (h) {
      normalized[normalizeHeader(h)] = true;
    });
    var matches = 0;
    expected.forEach(function (col) {
      if (normalized[normalizeHeader(col)]) matches++;
    });
    return matches >= 4;
  }

  function coerceGroundworksRecord(raw, index) {
    var lookup = {};
    Object.keys(raw).forEach(function (k) {
      lookup[normalizeHeader(k)] = String(raw[k] || '').trim();
    });

    function pick(names, defaultVal) {
      var i;
      var list = Array.isArray(names) ? names : [names];
      defaultVal = defaultVal === undefined ? '0' : String(defaultVal);
      for (i = 0; i < list.length; i++) {
        var key = normalizeHeader(list[i]);
        if (lookup[key] !== undefined && lookup[key] !== '') return lookup[key];
      }
      return defaultVal;
    }

    return {
      ID: pick(['id', 'name', 'pile id', 'pile'], String(index)),
      X: pick(['x', 'easting']),
      Y: pick(['y', 'northing']),
      Z: pick(['z', 'height', 'elevation', 'cut-off elevation']),
      Orientation: pick(['orientation', 'heading'], '0'),
      Inclination: pick(['inclination'], '0'),
      Rotation: pick(['rotation', 'inc heading', 'inclination heading'], '0'),
      Length: pick(['length', 'depth', 'embedment']),
    };
  }

  function toGroundworksRecords(header, rawRecords) {
    if (isHeaderRow(header, GROUNDWORKS_HEADER)) {
      var normalizedHeader = header.map(normalizeHeader);
      return rawRecords.map(function (raw) {
        var remapped = {};
        GROUNDWORKS_HEADER.forEach(function (gwCol) {
          var key = normalizeHeader(gwCol);
          var idx = normalizedHeader.indexOf(key);
          if (idx !== -1) remapped[gwCol] = String(raw[header[idx]] || '').trim();
          else if (gwCol === 'Orientation' || gwCol === 'Inclination' || gwCol === 'Rotation') remapped[gwCol] = '0';
          else remapped[gwCol] = '';
        });
        return remapped;
      });
    }
    return rawRecords.map(function (raw, i) {
      return coerceGroundworksRecord(raw, i + 1);
    });
  }

  function groundworksToTbc(records) {
    return records.map(function (rec) {
      return {
        Name: rec.ID,
        Easting: rec.X,
        Northing: rec.Y,
        Height: rec.Z,
        Inclination: rec.Inclination || '0',
        'Inc heading': rec.Rotation || '0',
        Heading: rec.Orientation || '0',
        'Cross size': '2',
        'Along size': '2',
        Length: rec.Length,
        Type: '1',
        'Is Placed': '0',
        'Placed Easting': '0',
        'Placed Northing': '0',
        'Placed Height': '0',
        'Placed Inclination': '0',
        'Placed Inclination heading': '0',
        'Placed Heading': '0',
      };
    });
  }

  function validateGroundworksRecords(records) {
    var issues = [];
    issues.truncated = false;
    var seen = {};
    var idx;

    for (idx = 0; idx < records.length; idx++) {
      if (issues.length >= MAX_VALIDATION_ISSUES) {
        issues.truncated = true;
        break;
      }
      var rec = records[idx];
      var rowNum = idx + 1;
      var id = String(rec.ID || '').trim();
      if (!id) {
        if (!pushValidationIssue(issues, 'Row ' + rowNum + ': missing ID')) break;
        continue;
      }
      if (seen[id]) {
        if (!pushValidationIssue(issues, 'Row ' + rowNum + ': duplicate ID \'' + id + '\'')) break;
      }
      seen[id] = true;

      var field;
      for (field = 0; field < 3; field++) {
        var coordField = ['X', 'Y', 'Z'][field];
        var value = String(rec[coordField] || '').trim();
        if (!value) {
          if (!pushValidationIssue(issues, 'Row ' + rowNum + ' (' + id + '): missing ' + coordField)) break;
        } else if (isNaN(parseFloat(value))) {
          if (
            !pushValidationIssue(
              issues,
              'Row ' + rowNum + ' (' + id + '): ' + coordField + ' is not numeric (' + value + ')'
            )
          ) {
            break;
          }
        }
      }
      if (issues.length >= MAX_VALIDATION_ISSUES) {
        issues.truncated = true;
        break;
      }

      var lengthValue = String(rec.Length || '').trim();
      if (lengthValue && isNaN(parseFloat(lengthValue))) {
        if (
          !pushValidationIssue(
            issues,
            'Row ' + rowNum + ' (' + id + '): Length is not numeric (' + lengthValue + ')'
          )
        ) {
          break;
        }
      }

      for (field = 0; field < 3; field++) {
        var angleField = ['Orientation', 'Inclination', 'Rotation'][field];
        var angleValue = String(rec[angleField] || '').trim();
        if (!angleValue) continue;
        if (isNaN(parseFloat(angleValue))) {
          if (
            !pushValidationIssue(
              issues,
              'Row ' + rowNum + ' (' + id + '): ' + angleField + ' is not numeric (' + angleValue + ')'
            )
          ) {
            break;
          }
        }
      }
      if (issues.length >= MAX_VALIDATION_ISSUES) {
        issues.truncated = true;
        break;
      }
    }

    return finishValidationIssues(issues, records.length);
  }

  function coerceTbcRecord(raw, index) {
    var lookup = {};
    Object.keys(raw).forEach(function (k) {
      lookup[normalizeHeader(k)] = String(raw[k] || '').trim();
    });

    function pick(names, defaultVal) {
      var i;
      var list = Array.isArray(names) ? names : [names];
      defaultVal = defaultVal === undefined ? '0' : String(defaultVal);
      for (i = 0; i < list.length; i++) {
        var key = normalizeHeader(list[i]);
        if (lookup[key] !== undefined && lookup[key] !== '') return lookup[key];
      }
      return defaultVal;
    }

    return {
      Name: pick(['name', 'id', 'pile id', 'pile'], String(index)),
      Easting: pick(['easting', 'x']),
      Northing: pick(['northing', 'y']),
      Height: pick(['height', 'z', 'elevation', 'cut-off elevation']),
      Inclination: pick(['inclination'], '0'),
      'Inc heading': pick(['inc heading', 'inclination heading'], '0'),
      Heading: pick(['heading', 'orientation'], '0'),
      'Cross size': pick(['cross size', 'diameter'], '2'),
      'Along size': pick(['along size'], '2'),
      Length: pick(['length', 'depth', 'embedment']),
      Type: pick(['type', 'pile type'], '1'),
      'Is Placed': pick(['is placed'], '0'),
      'Placed Easting': pick(['placed easting'], '0'),
      'Placed Northing': pick(['placed northing'], '0'),
      'Placed Height': pick(['placed height'], '0'),
      'Placed Inclination': pick(['placed inclination'], '0'),
      'Placed Inclination heading': pick(['placed inclination heading'], '0'),
      'Placed Heading': pick(['placed heading'], '0'),
    };
  }

  function toTbcRecords(header, rawRecords) {
    if (isHeaderRow(header, TBC_HEADER)) {
      var normalizedHeader = header.map(normalizeHeader);
      return rawRecords.map(function (raw) {
        var remapped = {};
        TBC_HEADER.forEach(function (tbcCol) {
          var key = normalizeHeader(tbcCol);
          var idx = normalizedHeader.indexOf(key);
          if (idx !== -1) remapped[tbcCol] = String(raw[header[idx]] || '').trim();
          else remapped[tbcCol] = '';
        });
        return remapped;
      });
    }
    return rawRecords.map(function (raw, i) {
      return coerceTbcRecord(raw, i + 1);
    });
  }

  function validateTbcRecords(records) {
    var issues = [];
    issues.truncated = false;
    var seen = {};
    var idx;

    for (idx = 0; idx < records.length; idx++) {
      if (issues.length >= MAX_VALIDATION_ISSUES) {
        issues.truncated = true;
        break;
      }
      var rec = records[idx];
      var rowNum = idx + 1;
      var name = String(rec.Name || '').trim();
      if (!name) {
        if (!pushValidationIssue(issues, 'Row ' + rowNum + ': missing Name/ID')) break;
        continue;
      }
      if (seen[name]) {
        if (!pushValidationIssue(issues, 'Row ' + rowNum + ': duplicate Name \'' + name + '\'')) break;
      }
      seen[name] = true;

      var field;
      for (field = 0; field < 3; field++) {
        var coordField = ['Easting', 'Northing', 'Height'][field];
        var value = String(rec[coordField] || '').trim();
        if (!value) {
          if (!pushValidationIssue(issues, 'Row ' + rowNum + ' (' + name + '): missing ' + coordField)) break;
        } else if (isNaN(parseFloat(value))) {
          if (
            !pushValidationIssue(
              issues,
              'Row ' + rowNum + ' (' + name + '): ' + coordField + ' is not numeric (' + value + ')'
            )
          ) {
            break;
          }
        }
      }
      if (issues.length >= MAX_VALIDATION_ISSUES) {
        issues.truncated = true;
        break;
      }

      var tbcLength = String(rec.Length || '').trim();
      if (tbcLength && isNaN(parseFloat(tbcLength))) {
        if (
          !pushValidationIssue(
            issues,
            'Row ' + rowNum + ' (' + name + '): Length is not numeric (' + tbcLength + ')'
          )
        ) {
          break;
        }
      }

      var numericFields = Object.keys(NUMERIC_FIELDS_TBC);
      var nf;
      for (nf = 0; nf < numericFields.length; nf++) {
        field = numericFields[nf];
        if (field === 'Name') continue;
        value = String(rec[field] || '').trim();
        if (!value) continue;
        if (['Easting', 'Northing', 'Height', 'Length'].indexOf(field) !== -1) continue;
        if (isNaN(parseFloat(value))) {
          if (
            !pushValidationIssue(
              issues,
              'Row ' + rowNum + ' (' + name + '): ' + field + ' is not numeric (' + value + ')'
            )
          ) {
            break;
          }
        }
      }
      if (issues.length >= MAX_VALIDATION_ISSUES) {
        issues.truncated = true;
        break;
      }
    }

    return finishValidationIssues(issues, records.length);
  }

  function tbcToGroundworks(records) {
    return records.map(function (rec) {
      return {
        ID: rec.Name,
        X: rec.Easting,
        Y: rec.Northing,
        Z: rec.Height,
        Orientation: rec.Heading || '0',
        Inclination: rec.Inclination || '0',
        Rotation: rec['Inc heading'] || '0',
        Length: rec.Length,
      };
    });
  }

  function escapeCsvCell(value, delimiter) {
    var str = String(value == null ? '' : value);
    if (str.indexOf('"') !== -1 || str.indexOf(delimiter) !== -1 || str.indexOf('\n') !== -1) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function recordsToCsv(header, records, delimiter) {
    var lines = [header.join(delimiter)];
    records.forEach(function (rec) {
      lines.push(
        header
          .map(function (col) {
            return escapeCsvCell(rec[col] != null ? rec[col] : '', delimiter);
          })
          .join(delimiter)
      );
    });
    return lines.join('\n') + '\n';
  }

  function defaultOutputName(inputName) {
    var base = String(inputName || 'piles.csv').replace(/\.[^.]+$/, '');
    return base + '_groundworks.csv';
  }

  function applyFieldConstants(records, fieldConstants) {
    if (!fieldConstants) return;
    records.forEach(function (rec) {
      GROUNDWORKS_HEADER.forEach(function (field) {
        if (!String(rec[field] || '').trim()) {
          var constant = fieldConstants[field];
          if (constant != null && String(constant).trim() !== '') {
            rec[field] = String(constant).trim();
          }
        }
      });
    });
  }

  function applyGroundworksDefaults(records) {
    records.forEach(function (rec) {
      ['Orientation', 'Inclination', 'Rotation', 'Length'].forEach(function (field) {
        if (!String(rec[field] || '').trim()) rec[field] = '0';
      });
    });
  }

  function applyTbcDefaults(records, options) {
    options = options || {};
    var defaultLength = options.defaultLength != null ? options.defaultLength : options.defaultDepth;
    records.forEach(function (rec) {
      if (!String(rec.Length || '').trim()) {
        rec.Length = defaultLength != null ? String(defaultLength) : '0';
      }
      if (!String(rec.Height || '').trim() && options.defaultHeight != null) {
        rec.Height = String(options.defaultHeight);
      }
    });
  }

  /**
   * @param {string} csvText - raw file contents
   * @param {object} options - { defaultLength, defaultHeight, validateOnly }
   */
  function processCsv(csvText, options) {
    options = options || {};
    var parsed = parseCsvText(csvText);
    var useTbcPath = isHeaderRow(parsed.header, TBC_HEADER);
    var gwRecords;
    var tbcRecords;
    var issues;

    if (useTbcPath) {
      tbcRecords = toTbcRecords(parsed.header, parsed.records);
      applyTbcDefaults(tbcRecords, options);
      gwRecords = tbcToGroundworks(tbcRecords);
      applyInputUnits(gwRecords);
      issues = validateTbcRecords(tbcRecords);
    } else {
      gwRecords = toGroundworksRecords(parsed.header, parsed.records);
      applyFieldConstants(gwRecords, options.fieldConstants);
      applyGroundworksDefaults(gwRecords);
      applyInputUnits(gwRecords);
      issues = validateGroundworksRecords(gwRecords);
      tbcRecords = groundworksToTbc(gwRecords);
    }

    var result = {
      ok: issues.length === 0 && !issues.truncated,
      issues: issues,
      pileCount: gwRecords.length,
      inputDelimiter: parsed.delimiter,
      tbcRecords: tbcRecords,
      groundworksRecords: gwRecords,
      inputUnits: normalizeInputUnits(options.inputUnits),
      inputUnitLabel: inputUnitLabel(options.inputUnits),
    };

    if (options.validateOnly) return result;

    result.outputHeader = GROUNDWORKS_HEADER;
    result.outputRecords = gwRecords;
    result.outputDelimiter = ';';
    result.outputCsv = recordsToCsv(GROUNDWORKS_HEADER, gwRecords, ';');
    return result;
  }

  return {
    TBC_HEADER: TBC_HEADER,
    GROUNDWORKS_HEADER: GROUNDWORKS_HEADER,
    parseCsvText: parseCsvText,
    parseCsvRaw: parseCsvRaw,
    parseIgnoreRows: parseIgnoreRows,
    resolveIgnoredRows: resolveIgnoredRows,
    ignoredRowsList: ignoredRowsList,
    formatIgnoreRowsList: formatIgnoreRowsList,
    buildSourceTable: buildSourceTable,
    guessColumnMapping: guessColumnMapping,
    recordsFromMapping: recordsFromMapping,
    processWithMapping: processWithMapping,
    processCsv: processCsv,
    recordsToCsv: recordsToCsv,
    defaultOutputName: defaultOutputName,
    normalizeInputUnits: normalizeInputUnits,
    inputUnitLabel: inputUnitLabel,
    linearUnitSuffix: linearUnitSuffix,
    formatLinearValue: formatLinearValue,
    applyInputUnits: applyInputUnits,
    toTbcRecords: toTbcRecords,
    toGroundworksRecords: toGroundworksRecords,
    validateTbcRecords: validateTbcRecords,
    validateGroundworksRecords: validateGroundworksRecords,
    tbcToGroundworks: tbcToGroundworks,
    groundworksToTbc: groundworksToTbc,
  };
})();
