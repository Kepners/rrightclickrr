#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = process.cwd();
const distRoot = path.join(rootDir, 'dist');
const archiveRoot = path.join(distRoot, 'archive');

const candidates = fs
  .readdirSync(rootDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => name.toLowerCase().startsWith('dist') && name.toLowerCase() !== 'dist');

if (candidates.length === 0) {
  console.log('No top-level dist* folders found to consolidate.');
  process.exit(0);
}

fs.mkdirSync(archiveRoot, { recursive: true });

const moved = [];
const pending = [];

for (const name of candidates) {
  const src = path.join(rootDir, name);
  const dst = path.join(archiveRoot, name);

  try {
    fs.cpSync(src, dst, { recursive: true, force: true });
  } catch (error) {
    console.error(`Failed to copy ${name} -> dist/archive/${name}: ${error.message}`);
    pending.push({ name, reason: `copy failed: ${error.message}` });
    continue;
  }

  try {
    fs.rmSync(src, { recursive: true, force: true });
    moved.push(name);
  } catch (error) {
    pending.push({ name, reason: error.message });
  }
}

if (moved.length > 0) {
  console.log(`Consolidated ${moved.length} folder(s) into dist/archive:`);
  for (const name of moved) {
    console.log(`- ${name}`);
  }
}

if (pending.length > 0) {
  console.log('');
  console.log('Some folders could not be fully removed (usually file lock on app.asar).');
  for (const item of pending) {
    console.log(`- ${item.name}: ${item.reason}`);
  }
  process.exitCode = 1;
}
