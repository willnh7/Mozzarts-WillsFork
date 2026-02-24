import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { createRequire } from "module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

export default function loadFiles(dirName, ext) {
  const files = fs.readdirSync(dirName);
  const filteredFiles = files.filter((file) => file.endsWith(ext));
  return filteredFiles;
}
