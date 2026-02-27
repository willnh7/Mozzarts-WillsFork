import { expect } from "chai";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import loadFiles from "../src/helpers/loadFiles.js";
import loadCommands from "../src/helpers/loadCommands.js";
import loadEvents from "../src/helpers/loadEvents.js";

function mkTmpDir(prefix = "memebot-tests-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("loader regression", () => {
  it("loadFiles filters by extension", () => {
    const dir = mkTmpDir("loadFiles-");
    fs.writeFileSync(path.join(dir, "a.js"), "x");
    fs.writeFileSync(path.join(dir, "b.txt"), "x");
    fs.writeFileSync(path.join(dir, "c.js"), "x");

    const res = loadFiles(dir, ".js");
    expect(res.sort()).to.deep.equal(["a.js", "c.js"]);
  });

  it("loadCommands loads valid commands and skips invalid/throwing modules", () => {
    const dir = mkTmpDir("loadCommands-");
    const sub = path.join(dir, "sub");
    fs.mkdirSync(sub);

    // valid (exports default)
    fs.writeFileSync(
      path.join(dir, "ok1.js"),
      `module.exports = { default: { data: { name: "ok1" }, execute: async () => {} } };`
    );

    // valid (exports directly)
    fs.writeFileSync(
      path.join(sub, "ok2.js"),
      `module.exports = { data: { name: "ok2" }, execute: async () => {} };`
    );

    // invalid (missing execute)
    fs.writeFileSync(
      path.join(dir, "bad1.js"),
      `module.exports = { data: { name: "bad1" } };`
    );

    // throws on require
    fs.writeFileSync(path.join(dir, "boom.js"), `throw new Error("boom");`);

    const client = { commands: new Map() };
    loadCommands(client, dir);

    expect([...client.commands.keys()].sort()).to.deep.equal(["ok1", "ok2"]);
  });

  it("loadEvents registers once/on appropriately and skips invalid modules", () => {
    const dir = mkTmpDir("loadEvents-");

    fs.writeFileSync(
      path.join(dir, "ready.js"),
      `module.exports = { default: { name: "ready", once: true, execute: () => {} } };`
    );

    fs.writeFileSync(
      path.join(dir, "messageCreate.js"),
      `module.exports = { default: { name: "messageCreate", execute: () => {} } };`
    );

    fs.writeFileSync(
      path.join(dir, "invalid.js"),
      `module.exports = { default: { nope: true } };`
    );

    const onceCalls = [];
    const onCalls = [];

    const client = {
      once: (name) => onceCalls.push(name),
      on: (name) => onCalls.push(name),
    };

    loadEvents(client, dir);

    expect(onceCalls).to.include("ready");
    expect(onCalls).to.include("messageCreate");
    expect(onceCalls).to.not.include("invalid");
    expect(onCalls).to.not.include("invalid");
  });
});