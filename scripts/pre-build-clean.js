#!/usr/bin/env node
/**
 * pre-build-clean.js
 *
 * Runs BEFORE electron-builder to prevent the OneDrive cldflt.sys kernel-level
 * file lock on dist\win-unpacked\resources\app.asar.
 *
 * Strategy:
 *   1. Use PowerShell to strip FILE_ATTRIBUTE_PINNED (0x80000) from every file
 *      in the TEMP build dir so the Cloud Files Filter driver releases its hold.
 *   2. Force-remove the TEMP build dir so electron-builder starts clean.
 *
 * The actual build output goes to C:\Users\<user>\AppData\Local\rrc-build
 * (outside OneDrive) — set via directories.output in package.json.
 */

'use strict';

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TEMP_BUILD_DIR = path.join(os.homedir(), 'AppData', 'Local', 'rrc-build');

console.log('[prebuild] Starting pre-build cleanup...');
console.log(`[prebuild] Temp build dir: ${TEMP_BUILD_DIR}`);

// ── Step 1: Strip FILE_ATTRIBUTE_PINNED via PowerShell ────────────────────────
// Only needed if the dir exists and contains files from a previous build.
if (fs.existsSync(TEMP_BUILD_DIR)) {
  console.log('[prebuild] Stripping OneDrive PINNED attribute from temp dir...');

  const psScript = `
    $dir = '${TEMP_BUILD_DIR.replace(/'/g, "''")}';
    $pinned = 0x80000;
    $offline = 0x1000;
    $recall  = 0x400000;
    $mask    = -bnot ($pinned -bor $offline -bor $recall);

    Get-ChildItem -Path $dir -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {
      try {
        $attrs = [int]$_.Attributes;
        if (($attrs -band $pinned) -ne 0) {
          $_.Attributes = [System.IO.FileAttributes]($attrs -band $mask);
        }
      } catch {}
    }
    Write-Host "[prebuild] Attribute strip complete."
  `.trim();

  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
    stdio: 'inherit',
    timeout: 30_000,
  });

  if (result.status !== 0) {
    console.warn('[prebuild] PowerShell attribute strip returned non-zero — continuing anyway.');
  }

  // ── Step 2: Force-delete the temp build dir ─────────────────────────────────
  console.log('[prebuild] Removing temp build dir...');
  try {
    fs.rmSync(TEMP_BUILD_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    console.log('[prebuild] Temp build dir removed cleanly.');
  } catch (err) {
    // If rmSync still fails (kernel lock persisted), try robocopy mirror trick:
    // mirror an empty dir over it, then delete the empty shell.
    console.warn(`[prebuild] fs.rmSync failed: ${err.message}`);
    console.log('[prebuild] Trying robocopy mirror trick...');
    try {
      const emptyDir = path.join(os.tmpdir(), `rrc-empty-${Date.now()}`);
      fs.mkdirSync(emptyDir, { recursive: true });
      execSync(`robocopy "${emptyDir}" "${TEMP_BUILD_DIR}" /MIR /NFL /NDL /NJH /NJS /NC /NS /NP`, {
        stdio: 'pipe',
        // robocopy exits 1 even on success when source is empty
      });
      fs.rmdirSync(TEMP_BUILD_DIR, { recursive: true });
      fs.rmdirSync(emptyDir);
      console.log('[prebuild] Robocopy mirror trick succeeded.');
    } catch (robocopyErr) {
      // Non-fatal — electron-builder will overwrite what it can
      console.warn(`[prebuild] Robocopy fallback also failed: ${robocopyErr.message}`);
      console.warn('[prebuild] Continuing — build may fail if kernel lock is still held.');
    }
  }
} else {
  console.log('[prebuild] Temp build dir does not exist yet — nothing to clean.');
}

console.log('[prebuild] Pre-build cleanup complete. Starting electron-builder...');
