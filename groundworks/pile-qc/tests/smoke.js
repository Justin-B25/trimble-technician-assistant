/**
 * Pile QC smoke tests — run with Node:
 *   node groundworks/pile-qc/tests/smoke.js
 *
 * Loads parsers.js + qc.js (browser IIFEs) and exercises join, PTP, drive compare,
 * and quoted CSV drive-log parsing against sample files.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');
var SAMPLES = path.join(ROOT, 'samples');
var TEST1 = path.join(SAMPLES, 'test1-full-down-pressure');

function loadIife(filePath, sandbox) {
  var code = fs.readFileSync(filePath, 'utf8');
  vm.runInNewContext(code, sandbox, { filename: filePath });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function almostEqual(a, b, eps) {
  eps = eps == null ? 1e-9 : eps;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= eps;
}

var sandbox = {
  console: console,
  Number: Number,
  Math: Math,
  String: String,
  Object: Object,
  Array: Array,
  JSON: JSON,
  parseInt: parseInt,
  isFinite: isFinite,
  Infinity: Infinity,
  NaN: NaN,
  Error: Error,
  TypeError: TypeError,
  RegExp: RegExp,
  Date: Date,
};
sandbox.global = sandbox;
sandbox.window = sandbox;
sandbox.self = sandbox;

loadIife(path.join(ROOT, 'js', 'parsers.js'), sandbox);
loadIife(path.join(ROOT, 'js', 'qc.js'), sandbox);

var PileParsers = sandbox.PileParsers;
var PileQC = sandbox.PileQC;
assert(PileParsers && PileQC, 'PileParsers / PileQC globals missing');

var passed = 0;
function ok(name) {
  passed++;
  console.log('  ok  ' + name);
}

console.log('Pile QC smoke tests\n');

// --- Quoted CSV ---
(function () {
  var matrix = PileParsers.parseCsvText(
    'a,b,c\n1,"hello, world",3\n4,"say ""hi""",6\n'
  );
  assert(matrix.length === 3, 'csv row count');
  assert(matrix[1][1] === 'hello, world', 'quoted comma field');
  assert(matrix[2][1] === 'say "hi"', 'escaped quotes');
  ok('parseCsvText quoted fields');
})();

// --- Drive log CSV (quoted notes + unit hint) ---
(function () {
  var csv =
    'PileID,GROUNDWORKS CUT/FILL (FT),MCH REMAINING (FT),NOTES\n' +
    '1126,0.09,0.16,"tall, wet"\n' +
    '1127,0.05,0.0,\n';
  var parsed = PileParsers.parseDriveLogCsv(csv);
  assert(parsed.rows.length === 2, 'drive rows');
  assert(parsed.rows[0].id === '1126', 'drive id');
  assert(almostEqual(parsed.rows[0].gwRemainingFt, 0.09), 'gw rem');
  assert(parsed.rows[0].notes === 'tall, wet', 'quoted notes survive');
  assert(parsed.unitHint === true, 'unit hint feet from (FT)');
  ok('parseDriveLogCsv');
})();

// --- Template sample ---
(function () {
  var text = fs.readFileSync(path.join(SAMPLES, 'DRIVE-LOG-TEMPLATE.csv'), 'utf8');
  var parsed = PileParsers.parseDriveLogCsv(text);
  assert(parsed.rows.length >= 1, 'template has rows');
  assert(parsed.unitHint === true, 'template unit hint feet');
  ok('DRIVE-LOG-TEMPLATE.csv');
})();

// --- Design + GNSS join (Test 1) ---
(function () {
  var designText = fs.readFileSync(
    path.join(TEST1, 'TEST 1 AND 2 DESIGNED COORDINATES.csv'),
    'utf8'
  );
  var gnssText = fs.readFileSync(
    path.join(TEST1, 'TEST 1 FULL DOWNPRESSURE GNSS.csv'),
    'utf8'
  );
  var design = PileParsers.parseDesignCsv(designText, 'design');
  var gnss = PileParsers.parseMeasuredCsv(gnssText, 'gnss');
  assert(design.count > 0, 'design count');
  assert(gnss.count > 0, 'gnss count');

  var report = PileQC.buildReport(
    { design: design.map, gnss: gnss.map, uts: null, machine: null },
    { excludeIds: [] }
  );
  assert(report.counts.common > 0, 'common piles > 0');
  assert(report.counts.common <= design.count, 'common <= design');
  assert(report.hasGnss === true, 'hasGnss');
  assert(report.avg.gnssVsDesign != null, 'gnss vs design avg');
  assert(report.avg.gnssVsDesign.dz != null, 'mean ΔZ');

  var oneId = report.rows[0].id;
  var reportEx = PileQC.buildReport(
    { design: design.map, gnss: gnss.map, uts: null, machine: null },
    { excludeIds: [oneId] }
  );
  assert(reportEx.counts.excluded === 1, 'exclude count');
  assert(reportEx.counts.common === report.counts.common - 1, 'exclude shrinks sample');
  assert(
    reportEx.reviewRows.length === report.reviewRows.length,
    'reviewRows keeps excluded piles'
  );
  ok('buildReport join + exclude (Test 1 design∩GNSS)');
})();

// --- PTP N–S residual ---
(function () {
  var designMap = {
    A: { n: 100, e: 10, z: 50 },
    B: { n: 110, e: 10, z: 50.01 },
    C: { n: 120, e: 10, z: 50.02 },
  };
  var asBuilt = {
    A: { n: 100, e: 10, z: 50.1 },
    B: { n: 110, e: 10, z: 50.12 },
    C: { n: 120, e: 10, z: 50.2 },
  };
  // residuals: A 0.1, B 0.11, C 0.18 → |ΔΔZ| A-B=0.01, B-C=0.07
  var ptp = PileQC.buildPileToPileZ({
    designMap: designMap,
    asBuiltMap: asBuilt,
    asBuiltSource: 'gnss',
    specFt: 0.02,
    excludeIds: [],
  });
  assert(!ptp.error, 'ptp no error: ' + (ptp.error || ''));
  assert(ptp.edges && ptp.edges.length >= 2, 'ptp edges');
  assert(ptp.failCount >= 1 || ptp.pairFailCount >= 1, 'expect over-spec');
  ok('buildPileToPileZ');
})();

// --- Drive screen compare ---
(function () {
  var designMap = { '1': { n: 0, e: 0, z: 100 }, '2': { n: 0, e: 0, z: 100 } };
  var asBuilt = { '1': { n: 0, e: 0, z: 100.2 }, '2': { n: 0, e: 0, z: 100.1 } };
  var driveRows = [
    { id: '1', gwRemainingFt: 0.2, machineDisplayedRaw: 0.24 },
    { id: '2', gwRemainingFt: 0.05, machineDisplayedRaw: 0.12 },
  ];
  var cmp = PileQC.buildDriveScreenCompare({
    designMap: designMap,
    asBuiltMap: asBuilt,
    asBuiltSource: 'uts',
    machineUnit: 'feet',
    driveRows: driveRows,
    excludeIds: [],
  });
  assert(cmp.withTruth === 2, 'drive withTruth');
  assert(almostEqual(cmp.rows[0].truthDz, 0.2), 'truth ΔZ pile 1');
  assert(almostEqual(cmp.rows[0].errGw, 0), 'pile 1 GW exact');
  assert(cmp.gwCloser + cmp.machineCloser + cmp.ties === 2, 'closer counts');
  assert(cmp.meanAbsErrGw != null, 'meanAbsErrGw');
  assert(!('guidanceRemainingFt' in cmp.rows[0]), 'no dual guidance field');
  assert(!('meanAbsErrGuidance' in cmp), 'no dual meanAbsErrGuidance');
  ok('buildDriveScreenCompare');
})();

// --- Test 1 / Test 3 drive log samples parse ---
(function () {
  var t1 = fs.readFileSync(
    path.join(TEST1, 'TEST 1 GROUNDWORKS VS MACHINE DISPLAYED DRIVE LOG.csv'),
    'utf8'
  );
  var p1 = PileParsers.parseDriveLogCsv(t1);
  assert(p1.rows.length > 10, 'test1 drive rows');
  ok('Test 1 drive-log sample parse (' + p1.rows.length + ' piles)');

  var t3path = path.join(
    SAMPLES,
    'test3-full-downforce-sick-imu',
    'TEST 3 FULL DOWNFORCE SICK IMU GW VS MCH.csv'
  );
  if (fs.existsSync(t3path)) {
    var t3 = fs.readFileSync(t3path, 'utf8');
    var p3 = PileParsers.parseDriveLogCsv(t3);
    assert(p3.rows.length > 0, 'test3 drive rows');
    assert(p3.rows[0].gwRemainingFt != null, 'test3 has GW rem');
    assert(p3.unitHint === true, 'test3 feet hint from CutFillFt headers');
    ok('Test 3 drive-log sample parse (' + p3.rows.length + ' piles)');
  }
})();

console.log('\n' + passed + ' checks passed');
