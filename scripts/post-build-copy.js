#!/usr/bin/env node
/**
 * post-build-copy.js
 *
 * Runs AFTER electron-builder completes.
 *
 * electron-builder wrote its output to the temp dir (outside OneDrive):
 *   C:\Users\<user>\AppData\Local\rrc-build
 *
 * This script copies the distributable artefacts back to dist/ so git,
 * GitHub Actions, and the existing dist:consolidate script all find them
 * in the expected place:
 *   - RRightclickrr Setup <version>.exe       (NSIS installer)
 *   - RRightclickrr-Portable-<version>.exe    (portable)
 *   - latest.yml                              (auto-updater manifest)
 *   - builder-debug.yml                       (electron-builder diagnostics, optional)
 *
 * win-unpacked/ is intentionally NOT copied back — it's the unpacked app
 * directory that triggers the OneDrive lock and is never needed in dist/.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const TEMP_BUILD_DIR = path.join(os.homedir(), 'AppData', 'Local', 'rrc-build');
const DIST_DIR = path.join(process.cwd(), 'dist');

// Patterns to copy back (by extension or exact name)
const COPY_EXTENSIONS = ['.exe', '.yml', '.yaml', '.blockmap'];
const COPY_EXACT = ['latest.yml', 'latest-mac.yml', 'latest-linux.yml', 'builder-debug.yml'];

console.log('[postbuild] Starting post-build copy...');
console.log(`[postbuild] Source : ${TEMP_BUILD_DIR}`);
console.log(`[postbuild] Dest   : ${DIST_DIR}`);

if (!fs.existsSync(TEMP_BUILD_DIR)) {
  console.error(`[postbuild] ERROR: Temp build dir not found: ${TEMP_BUILD_DIR}`);
  console.error('[postbuild] This means electron-builder did not write output there.');
  process.exit(1);
}

// Ensure dist/ exists
fs.mkdirSync(DIST_DIR, { recursive: true });

// Read the top-level contents of the temp build dir (flat — no subdirs needed)
const entries = fs.readdirSync(TEMP_BUILD_DIR, { withFileTypes: true });

let copied = 0;
let skipped = 0;

for (const entry of entries) {
  if (!entry.isFile()) {
    // Skip win-unpacked/ and any other subdirectories
    console.log(`[postbuild] Skipping dir: ${entry.name}`);
    skipped++;
    continue;
  }

  const ext = path.extname(entry.name).toLowerCase();
  const shouldCopy = COPY_EXTENSIONS.includes(ext) || COPY_EXACT.includes(entry.name);

  if (!shouldCopy) {
    console.log(`[postbuild] Skipping file (not in copy list): ${entry.name}`);
    skipped++;
    continue;
  }

  const src = path.join(TEMP_BUILD_DIR, entry.name);
  const dst = path.join(DIST_DIR, entry.name);

  try {
    fs.copyFileSync(src, dst);
    const sizeKb = Math.round(fs.statSync(src).size / 1024);
    console.log(`[postbuild] Copied: ${entry.name} (${sizeKb.toLocaleString()} KB)`);
    copied++;
  } catch (err) {
    console.error(`[postbuild] ERROR copying ${entry.name}: ${err.message}`);
    process.exit(1);
  }
}

console.log('');
console.log(`[postbuild] Done. Copied ${copied} file(s), skipped ${skipped} item(s).`);
console.log(`[postbuild] Artefacts are in: ${DIST_DIR}`);

if (copied === 0) {
  console.error('[postbuild] WARNING: No artefacts were copied. Check the temp build dir contents.');
  process.exit(1);
}
