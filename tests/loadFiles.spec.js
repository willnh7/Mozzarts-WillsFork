import fs from "fs";
import path from "path";
import assert from "assert";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("File Load Regression Test", () => {
  it("should load command files", () => {
    const commandsPath = path.join(__dirname, "../src/commands");
    const files = fs.readdirSync(commandsPath);
    assert.ok(files.length > 0);
  });
});