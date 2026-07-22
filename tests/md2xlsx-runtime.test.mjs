import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";

const ROOT = process.cwd();
const skillRoot = path.resolve(ROOT, "skills", "igapyon-miku-ai-assistant-builder");
const fixture = path.resolve(ROOT, "tests", "fixtures", "md2xlsx-multi-sheet.md");

const runtimes = [
  {
    name: "Node.js",
    command: process.execPath,
    args: [path.resolve(skillRoot, "runtime", "miku-md2xlsx-0.9.5.mjs")]
  },
  {
    name: "Java",
    command: "java",
    args: ["-jar", path.resolve(skillRoot, "runtime", "miku-md2xlsx-java-0.9.5.jar")]
  }
];

for (const runtime of runtimes) {
  test(`${runtime.name} miku-md2xlsx converts one text input into three sheets`, (t) => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "miku-md2xlsx-proof-"));
    t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
    const output = path.resolve(temporaryRoot, "source-code.xlsx");

    execFileSync(runtime.command, [
      ...runtime.args,
      fixture,
      "--out",
      output,
      "--sheet-mode",
      "heading",
      "--sheet-heading-depth",
      "2"
    ], { cwd: ROOT, encoding: "utf8" });

    assert.equal(fs.existsSync(output), true);
    assert.ok(fs.statSync(output).size > 0);

    const entries = execFileSync("unzip", ["-Z1", output], { encoding: "utf8" });
    const worksheetEntries = entries.split("\n").filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry));
    assert.deepEqual(worksheetEntries, [
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet2.xml",
      "xl/worksheets/sheet3.xml"
    ]);

    const workbookXml = execFileSync("unzip", ["-p", output, "xl/workbook.xml"], { encoding: "utf8" });
    const sheetNames = [...workbookXml.matchAll(/<sheet name="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(sheetNames, ["Overview", "Greeter module", "Entry point"]);

    const greeterSheet = execFileSync("unzip", ["-p", output, "xl/worksheets/sheet2.xml"], { encoding: "utf8" });
    assert.match(greeterSheet, /export function greet\(name\)/);
    assert.match(greeterSheet, /Hello, \$\{name\}!/);
  });
}
