#!/usr/bin/env node
/**
 * Verify the dealer-facing app has no internal-package leaks before GitHub Pages deploy.
 * Run: node scripts/verify-dealer-deploy.js
 */
'use strict';

var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var failed = 0;

function fail(message) {
  console.error('FAIL:', message);
  failed++;
}

function ok(message) {
  console.log('OK:', message);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

// Internal tools must not live at dealer paths
if (exists('bench-crane')) {
  fail('bench-crane/ still exists at repo root — use trimble-internal/bench-crane/');
} else {
  ok('bench-crane/ not at repo root');
}

if (exists('groundworks/csv-formatter/index.html')) {
  ok('groundworks/csv-formatter/ present (BETA dealer tool)');
} else {
  fail('groundworks/csv-formatter/ missing — BETA CSV formatter should be on dealer path');
}

if (exists('groundworks/pile-qc/index.html')) {
  ok('groundworks/pile-qc/ present (Pile QC / Deviation Calculator)');
} else {
  fail('groundworks/pile-qc/ missing — Pile QC tool should be on dealer path');
}

if (!exists('trimble-internal/index.html')) {
  fail('trimble-internal/index.html missing');
} else {
  ok('trimble-internal package present');
}

// Dealer hub must not reference internal package
var hubNav = read('assets/hub-nav.js');
if (/trimble-internal|isTrimblePersonnel|hubHidden|bench-crane/i.test(hubNav)) {
  fail('assets/hub-nav.js still references internal-only wiring');
} else {
  ok('hub-nav.js is dealer-facing (BETA CSV formatter allowed)');
}

var dealerIndex = read('index.html');
if (/trimble-internal\.js|trimbleInternalHeaderMount|tmc-access|tmcAccessModal/i.test(dealerIndex)) {
  fail('index.html still references internal/TMC UI');
} else {
  ok('index.html is dealer-only');
}

var gwHub = read('groundworks/index.html');
if (/csv-formatter/i.test(gwHub) && !/BETA/i.test(gwHub)) {
  fail('groundworks/index.html CSV formatter missing BETA label');
} else if (/csv-formatter/i.test(gwHub)) {
  ok('groundworks/index.html lists CSV Formatter (BETA)');
} else {
  fail('groundworks/index.html missing CSV formatter tile');
}

if (/pile-qc/i.test(gwHub)) {
  ok('groundworks/index.html lists Pile QC / Deviation Calculator');
} else {
  fail('groundworks/index.html missing Pile QC tile');
}

var dealerConfig = read('assets/workspace-config.js');
if (/trimbleInternalLocalPreview|trimbleInternalIcon/i.test(dealerConfig)) {
  fail('assets/workspace-config.js still has internal preview flags');
} else {
  ok('dealer workspace-config has no internal preview flags');
}

if (failed) {
  console.error('\n' + failed + ' check(s) failed. Fix before deploying to GitHub Pages.');
  process.exit(1);
}

console.log('\nDealer deploy verification passed.');
console.log('Reminder: do not publish trimble-internal/ to public GitHub Pages.');
