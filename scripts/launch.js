#!/usr/bin/env node
// Launcher script that ensures ELECTRON_RUN_AS_NODE is not set
// This is needed because VS Code sets this env var for its integrated terminal

const { spawn } = require('child_process');
const path = require('path');

// Delete the problematic env var
delete process.env.ELECTRON_RUN_AS_NODE;

// Get electron path
const electronPath = require('electron');

// Get arguments (skip node and this script)
const args = process.argv.slice(2);
if (args.length === 0) {
  args.push('.'); // Default to current directory
}

// Spawn electron with clean environment
const child = spawn(electronPath, args, {
  stdio: 'inherit',
  env: process.env // Pass the modified env without ELECTRON_RUN_AS_NODE
});

child.on('close', (code) => {
  process.exit(code);
});
