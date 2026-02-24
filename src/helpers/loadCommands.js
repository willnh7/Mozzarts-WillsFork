import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { createRequire } from "module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

export default function loadCommands(client, commandsDir) {
  const files = walk(commandsDir).filter((f) => f.endsWith(".js"));

  let ok = 0;
  let bad = 0;

  for (const file of files) {
    try {
      const mod = require(file);
      const cmd = mod?.default ?? mod;

      if (!cmd?.data?.name || typeof cmd.execute !== "function") {
        bad++;
        continue;
      }

      client.commands.set(cmd.data.name, cmd);
      ok++;
    } catch (e) {
      bad++;
      console.error(`[loadCommands] Failed to load ${file}`, e);
    }
  }

  console.log(`[loadCommands] Loaded ${ok} commands (${bad} skipped/failed)`);
}
