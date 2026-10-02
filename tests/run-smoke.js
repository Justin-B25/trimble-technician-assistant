/**
 * Smoke tests for PD25 and CTL calculator modules.
 * Run: npm test   (requires Node.js)
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var failed = 0;

function loadGlobalScript(filePath, exportName) {
  var code = fs.readFileSync(filePath, 'utf8');
  var sandbox = { console: console, Math: Math, Date: Date, parseFloat: parseFloat, isNaN: isNaN };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: filePath });
  if (exportName && !sandbox[exportName]) {
    throw new Error('Expected global ' + exportName + ' from ' + filePath);
  }
  return sandbox;
}

function assert(condition, message) {
  if (!condition) {
    console.error('FAIL:', message);
    failed++;
    return;
  }
  console.log('OK:', message);
}

function testCtl() {
  var sandbox = loadGlobalScript(path.join(root, 'measure-up/ctl/calc.js'), 'MeasureUpCalc');
  var csv = fs.readFileSync(path.join(__dirname, 'fixtures/ctl-min.csv'), 'utf8');
  var result = sandbox.MeasureUpCalc.calculateForWeb(
    csv,
    'US FT',
    0.03,
    'CTL',
    'Manual',
    '8.5',
    'PNEZ',
    'Manual',
    '6.2',
    0.03,
    '',
    '',
    '',
    ''
  );
  assert(result && result.calculations, 'CTL returns calculations');
  var width = result.calculations['Attachment Width'];
  assert(
    typeof width === 'number' || (typeof width === 'string' && !isNaN(parseFloat(width))),
    'CTL computes attachment width'
  );
}

function testPd25() {
  var guideSandbox = loadGlobalScript(path.join(root, 'groundworks/pd25/guide-data.js'), 'PD25_GUIDE');
  var calcSandbox = {
    console: console,
    Math: Math,
    Date: Date,
    parseFloat: parseFloat,
    isNaN: isNaN,
    PD25_GUIDE: guideSandbox.PD25_GUIDE,
  };
  vm.createContext(calcSandbox);
  vm.runInContext(
    fs.readFileSync(path.join(root, 'groundworks/pd25/calc.js'), 'utf8'),
    calcSandbox,
    { filename: 'calc.js' }
  );
  var csv = fs.readFileSync(path.join(__dirname, 'fixtures/pd25-min.csv'), 'utf8');
  var analysis = calcSandbox.PD25Calc.analyzeCsv(csv, 'US FT', {
    rodEnteredInSiteworks: true,
    shotWithRod: true,
  });
  assert(analysis.status === 'ok', 'PD25 analysis status ok');
  assert(analysis.groundworks && analysis.groundworks.G6, 'PD25 produces G6 groundworks value');
  assert(!analysis.groundworks.B5, 'PD25 default path does not compute B5 from CSV');

  var missingMt = calcSandbox.PD25Calc.analyzeCsv(csv, 'METRIC', {
    rodEnteredInSiteworks: true,
    shotWithRod: true,
    b5Method: 'measure',
    xPinHorizontalOffset: '0.086',
  });
  assert(missingMt.status === 'ok', 'PD25 without MT still computes using OEM defaults');
  assert(!missingMt.groundworks.B5, 'PD25 without MT does not invent measured B5');
  assert(
    missingMt.warnings &&
      missingMt.warnings.some(function (w) {
        return /MT/i.test(w) && /prepopulated|OEM/i.test(w);
      }),
    'PD25 without MT warns and falls back to OEM'
  );

  var mtCsv = fs.readFileSync(path.join(__dirname, 'fixtures/pd25-mt.csv'), 'utf8');
  var measured = calcSandbox.PD25Calc.analyzeCsv(mtCsv, 'METRIC', {
    rodEnteredInSiteworks: true,
    shotWithRod: true,
    b5Method: 'measure',
    xPinHorizontalOffset: '0.086',
  });
  assert(measured.status === 'ok', 'PD25 measure B5 status ok');
  assert(measured.groundworks && measured.groundworks.B5, 'PD25 measure path produces B5');
  var b5Val = parseFloat(measured.groundworks.B5.value);
  assert(b5Val < 0, 'PD25 measured B5 is negative');
  assert(Math.abs(b5Val - -1.056) < 0.002, 'PD25 measured B5 ≈ −1.056 m for fixture');
  assert(
    measured.intermediate &&
      Math.abs(measured.intermediate.offsetConstants.horizontal - 0.086) < 1e-9,
    'PD25 measure path uses typed X-pin horizontal offset'
  );

  var zeroOffset = calcSandbox.PD25Calc.analyzeCsv(mtCsv, 'METRIC', {
    rodEnteredInSiteworks: true,
    shotWithRod: true,
    b5Method: 'measure',
    xPinHorizontalOffset: '0',
  });
  assert(zeroOffset.status === 'ok', 'PD25 measure B5 allows zero horizontal offset');
  assert(
    zeroOffset.intermediate &&
      Math.abs(zeroOffset.intermediate.offsetConstants.horizontal) < 1e-12,
    'PD25 zero offset is applied'
  );

  var penzLayout = calcSandbox.PD25Calc.detectCsvLayout([['ML', '200', '100', '10']], 'PENZ');
  assert(penzLayout.idxE === 1 && penzLayout.idxN === 2, 'PD25 PENZ column order');
  var pnezLayout = calcSandbox.PD25Calc.detectCsvLayout([['ML', '100', '200', '10']], 'PNEZ');
  assert(pnezLayout.idxN === 1 && pnezLayout.idxE === 2, 'PD25 PNEZ column order');
}

function testGwCsvFormatter() {
  var sandbox = loadGlobalScript(path.join(root, 'groundworks/csv-formatter/formatter.js'), 'GwCsvFormatter');
  var fmt = sandbox.GwCsvFormatter;
  var flexCsv = fs.readFileSync(path.join(__dirname, 'fixtures/gw-flex-input.csv'), 'utf8');
  var result = fmt.processCsv(flexCsv, {
    fieldConstants: { Z: '962' },
  });

  assert(result.ok, 'GW formatter validates flex input');
  assert(result.pileCount === 3, 'GW formatter reads three piles');
  assert(result.outputDelimiter === ';', 'GW output uses semicolon delimiter');
  assert(result.outputCsv.indexOf('ID;X;Y;Z;Orientation;Inclination;Rotation;Length') === 0, 'GW header row');
  assert(result.outputCsv.indexOf('P1;100.5;200.25;962') !== -1, 'GW maps first pile coordinates');

  var tbcCsv = fs.readFileSync(path.join(__dirname, 'fixtures/gw-tbc-input.csv'), 'utf8');
  var tbcResult = fmt.processCsv(tbcCsv);
  assert(tbcResult.ok, 'GW formatter accepts TBC header input');
  assert(tbcResult.outputRecords[0].ID === 'A1', 'GW maps TBC Name to ID');
  assert(tbcResult.outputRecords[0].Orientation === '45', 'GW maps Heading to Orientation');

  var aliasParsed = fmt.parseCsvText('pile id;easting;northing;height;depth\nB1;10;20;30;12\n');
  var aliasRecords = fmt.toGroundworksRecords(aliasParsed.header, aliasParsed.records);
  assert(aliasRecords[0].ID === 'B1', 'GW coerces pile id alias');
  assert(aliasRecords[0].Length === '12', 'GW coerces depth alias to Length');

  var dupCsv = 'ID,X,Y,Z,Length\nD1,1,2,3,15\nD1,4,5,6,15\n';
  var dupResult = fmt.processCsv(dupCsv, { validateOnly: true });
  assert(!dupResult.ok, 'GW flags duplicate IDs');
  assert(dupResult.issues.some(function (i) { return i.indexOf('duplicate') !== -1; }), 'GW duplicate issue message');

  var swCsv = fs.readFileSync(path.join(__dirname, 'fixtures/gw-siteworks-export.csv'), 'utf8');
  var swRaw = fmt.parseCsvRaw(swCsv);
  var swSource = fmt.buildSourceTable(swRaw, { hasHeaderRow: true });
  var swMapping = fmt.guessColumnMapping(swSource.columns);
  assert(swMapping.ID === 0, 'Siteworks export maps point names to ID');
  var swMapped = fmt.processWithMapping(swSource, swMapping, { fieldConstants: { Length: '15' } });
  assert(swMapped.pileCount === 6, 'Siteworks export yields six piles');
  assert(swMapped.outputRecords[0].ID === 'ML', 'Siteworks first pile ID preserved');
  assert(swMapped.outputRecords[0].X === '5000', 'Siteworks northing maps to X');
  assert(swMapped.outputRecords[0].Y === '1000', 'Siteworks easting maps to Y');
  assert(swMapped.outputRecords[0].Z === '100.709', 'Siteworks elevation maps to Z');
  assert(swMapped.inputUnits === 'US FT', 'GW formatter defaults to US FT');
  var swMetric = fmt.processWithMapping(swSource, swMapping, {
    fieldConstants: { Length: '15' },
    inputUnits: 'METRIC',
  });
  assert(swMetric.inputUnits === 'METRIC', 'GW formatter records METRIC input units');
  var swIntl = fmt.processWithMapping(swSource, swMapping, {
    fieldConstants: { Length: '15' },
    inputUnits: 'INTL FT',
  });
  assert(swIntl.inputUnits === 'INTL FT', 'GW formatter records International FT input units');
  assert(fmt.linearUnitSuffix('INTL FT') === "Int'l ft", 'GW formatter International FT suffix');
  assert(fmt.linearUnitSuffix('US FT') === 'US ft', 'GW formatter US FT suffix');

  var noLengthParsed = fmt.parseCsvRaw('id,x,y,z\nA,1,2,3\n');
  var noLengthSource = fmt.buildSourceTable(noLengthParsed, { hasHeaderRow: true });
  var noLengthMapping = { ID: 0, X: 1, Y: 2, Z: 3 };
  var noLengthResult = fmt.processWithMapping(noLengthSource, noLengthMapping, {});
  assert(noLengthResult.outputRecords[0].Length === '0', 'GW defaults missing Length to 0');

  var ignored = fmt.parseIgnoreRows('1,2...4,7');
  assert(ignored[1] && ignored[2] && ignored[3] && ignored[4] && ignored[7], 'Ignore rows parses singles and ranges');
  var swSkip = fmt.buildSourceTable(swRaw, { hasHeaderRow: true, ignoreRows: '7' });
  assert(swSkip.dataRows.length === 5, 'Ignore rows removes a data row from export');
}

function testBatterCalculator() {
  var parserSandbox = loadGlobalScript(
    path.join(root, 'dealer-training/batter-calculator/js/parsers.js'),
    'BatterParsers'
  );
  var calcSandbox = {
    console: console,
    Math: Math,
    Date: Date,
    Number: Number,
    String: String,
    Object: Object,
    Array: Array,
    parseFloat: parseFloat,
    isNaN: isNaN,
    BatterParsers: parserSandbox.BatterParsers,
  };
  vm.createContext(calcSandbox);
  vm.runInContext(
    fs.readFileSync(path.join(root, 'dealer-training/batter-calculator/js/calc.js'), 'utf8'),
    calcSandbox,
    { filename: 'calc.js' }
  );

  var parsed = parserSandbox.BatterParsers.parsePointName('1001T2');
  assert(parsed && parsed.pileId === '1001' && parsed.ring === 'T' && parsed.idx === 2, 'Batter parses 1001T2');
  assert(!parserSandbox.BatterParsers.parsePointName('CP100'), 'Batter rejects non-rim names');

  var csv = fs.readFileSync(path.join(__dirname, 'fixtures/batter-siteworks.csv'), 'utf8');
  var loaded = parserSandbox.BatterParsers.parseSiteworksCsv(csv, 'batter-siteworks.csv');
  assert(loaded.points.length === 12, 'Batter fixture loads 12 rim points');

  var report = calcSandbox.BatterCalc.buildReport(loaded.points);
  assert(report.pileCount === 2, 'Batter finds two pile IDs');
  assert(report.okCount === 2, 'Batter both piles OK');

  var p1001 = report.rows.filter(function (r) {
    return r.pileId === '1001';
  })[0];
  assert(p1001 && p1001.ok, 'Pile 1001 computed');
  assert(Math.abs(p1001.dn - 6) < 0.01, 'Pile 1001 ΔN ≈ 6');
  assert(Math.abs(p1001.de) < 0.01, 'Pile 1001 ΔE ≈ 0');
  assert(Math.abs(p1001.dxy - 6) < 0.01, 'Pile 1001 ΔXY ≈ 6');
  assert(Math.abs(p1001.dz - 47.624) < 0.01, 'Pile 1001 ΔZ ≈ 47.624');
  assert(p1001.batter > 0.12 && p1001.batter < 0.13, 'Pile 1001 batter ≈ 0.126');
  assert(/N/.test(p1001.favor), 'Pile 1001 leans N');

  var csvOut = calcSandbox.BatterCalc.rowsToCsv(report);
  assert(csvOut.indexOf('Delta_N') !== -1 && csvOut.indexOf('1001') !== -1, 'Batter CSV export includes ΔN + pile ID');
}

function testExcavator() {
  var sandbox = loadGlobalScript(path.join(root, 'measure-up/excavator/calc.js'), 'ExcavatorMeasureUpCalc');
  var csv = fs.readFileSync(path.join(__dirname, 'fixtures/ctl-min.csv'), 'utf8');
  var result = sandbox.ExcavatorMeasureUpCalc.calculateForWeb(
    csv,
    'US FT',
    0.03,
    'Manual',
    '8.5',
    'PNEZ',
    'Manual',
    '6.2',
    0.03
  );
  assert(result && result.calculations, 'Excavator returns calculations');
  assert(
    result.calculations['Receiver bracket bolt to pivot point'] != null,
    'Excavator computes machine measurement'
  );
  assert(
    result.calculations['Attachment Width'] === '8.500',
    'Excavator manual attachment width'
  );
}

console.log('--- CTL measure-up ---');
try {
  testCtl();
} catch (err) {
  failed++;
  console.error('FAIL: CTL threw', err.message);
}

console.log('--- Excavator measure-up ---');
try {
  testExcavator();
} catch (err) {
  failed++;
  console.error('FAIL: Excavator threw', err.message);
}

console.log('--- PD25 calculator ---');
try {
  testPd25();
} catch (err) {
  failed++;
  console.error('FAIL: PD25 threw', err.message);
}

console.log('--- Groundworks CSV formatter ---');
try {
  testGwCsvFormatter();
} catch (err) {
  failed++;
  console.error('FAIL: GW CSV formatter threw', err.message);
}

console.log('--- Battered pile / batter calculator ---');
try {
  testBatterCalculator();
} catch (err) {
  failed++;
  console.error('FAIL: Batter calculator threw', err.message);
}

if (failed) {
  console.error('\n' + failed + ' smoke test(s) failed.');
  process.exit(1);
}
console.log('\nAll smoke tests passed.');
