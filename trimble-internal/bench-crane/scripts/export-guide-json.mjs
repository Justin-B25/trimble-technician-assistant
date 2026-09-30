/**
 * Export guide-data.js + hardware-catalog.js to JSON for DOCX generation.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const hwPath = path.join(root, 'hardware-catalog.js');
const guidePath = path.join(root, 'guide-data.js');
const outPath = path.join(root, 'scripts', 'guide-export.json');

const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(hwPath, 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(guidePath, 'utf8'), sandbox);

const pkg = sandbox.window.TmcCraneGuide;
const hw = sandbox.window.TmcCraneHardware;

if (!pkg?.GUIDE || !hw?.HARDWARE_CATALOG) {
  console.error('Failed to load guide data from JS files.');
  process.exit(1);
}

const payload = {
  exportedAt: new Date().toISOString(),
  ASSEMBLY_ORDER: pkg.ASSEMBLY_ORDER,
  GUIDE: pkg.GUIDE,
  CRANE_DRIVE_IMAGES: pkg.CRANE_DRIVE_IMAGES,
  HARDWARE_CATALOG: hw.HARDWARE_CATALOG,
  MASTER_HARDWARE_KIT: hw.MASTER_HARDWARE_KIT,
  INSERT_CALLOUTS: hw.INSERT_CALLOUTS,
};

fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
console.log('Wrote', outPath);
