import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_DIR = path.join(__dirname, "../logs");
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);

function getTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function rotateLogs() {
  const files = fs
    .readdirSync(LOG_DIR)
    .filter((f) => f.startsWith("run-"))
    .map((f) => ({ name: f, time: fs.statSync(path.join(LOG_DIR, f)).mtime.getTime() }))
    .sort((a, b) => b.time - a.time);

  files.slice(3).forEach((f) => fs.unlinkSync(path.join(LOG_DIR, f.name)));
}

function runCheck(command, label, logStream, { fatal = false } = {}) {
  console.log(`\n=== ${label} ===`);
  logStream.write(`\n=== ${label} ===\n`);

  try {
    const output = execSync(command, { stdio: "pipe" }).toString();
    console.log(output);
    logStream.write(output);
    return true;
  } catch (err) {
    const out = err.stdout?.toString?.() || "";
    const errText = err.stderr?.toString?.() || "";

    console.error(`ERROR in ${label}`);
    if (out) console.error(out);
    if (errText) console.error(errText);

    logStream.write(`ERROR in ${label}\n`);
    if (out) logStream.write(out);
    if (errText) logStream.write(errText);

    if (fatal) process.exit(1);
    return false;
  }
}

const logFile = path.join(LOG_DIR, `run-${getTimestamp()}.txt`);
const logStream = fs.createWriteStream(logFile);

const lintOk = runCheck("npm run lint", "ESLint Check", logStream, { fatal: false });
const testOk = runCheck("npm test", "Mocha Tests", logStream, { fatal: false });

logStream.end();
rotateLogs();

if (!lintOk || !testOk) {
  console.log("\n⚠️ Checks had issues, but continuing to start the app anyway.\n");
} else {
  console.log("\n✅ All checks passed. Starting app...\n");
}


import("../src/app.js");