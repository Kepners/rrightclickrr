// Launcher for RRightclickrr - spawns Electron detached from Explorer's pipes
// This prevents EPIPE errors when Explorer closes its stdout/stderr
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Logging for verification
const LAUNCH_LOG = path.join(os.homedir(), "rrightclickrr-launcher.log");
function log(msg) {
  try {
    fs.appendFileSync(LAUNCH_LOG, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

const ELECTRON_EXE = path.join(__dirname, "node_modules", "electron", "dist", "electron.exe");
const APP_DIR = __dirname;

// Log what we're doing
log(`=== LAUNCHER START ===`);
log(`argv: ${JSON.stringify(process.argv)}`);
log(`electronExe: ${ELECTRON_EXE}`);
log(`appDir: ${APP_DIR}`);

// Pass through args from Explorer (skip node.exe and launcher.js)
const args = [APP_DIR, ...process.argv.slice(2)];
log(`spawning with args: ${JSON.stringify(args)}`);

try {
  // On Windows, redirect stdio to NUL instead of ignoring
  // This prevents EPIPE because the streams ARE connected (to nothing)
  const nulPath = process.platform === 'win32' ? 'NUL' : '/dev/null';
  const nulOut = fs.openSync(nulPath, 'w');
  const nulErr = fs.openSync(nulPath, 'w');

  // CRITICAL: Remove ELECTRON_RUN_AS_NODE from environment!
  // If this is set, Electron runs as plain Node.js and require('electron') fails
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  log(`ELECTRON_RUN_AS_NODE was: ${process.env.ELECTRON_RUN_AS_NODE || 'not set'}`);

  spawn(ELECTRON_EXE, args, {
    detached: true,
    stdio: ['ignore', nulOut, nulErr],
    windowsHide: true,
    env: cleanEnv,
  });
  log(`spawn success (stdio->NUL, clean env) - exiting launcher`);
} catch (err) {
  log(`spawn error: ${err.message}`);
}

process.exit(0);
