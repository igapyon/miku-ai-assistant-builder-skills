#!/usr/bin/env node

// package.json
var package_default = {
  name: "miku-json2xlsx",
  version: "0.4.2",
  private: true,
  description: "Local-first deterministic JSON and JSONL to XLSX conversion CLI.",
  type: "module",
  bin: {
    "miku-json2xlsx": "scripts/miku-json2xlsx-cli.mjs"
  },
  scripts: {
    build: "node scripts/build-miku-json2xlsx.mjs",
    typecheck: "tsc --noEmit",
    pretest: "npm run build",
    test: "vitest run",
    "test:unit": "vitest run",
    "pretest:semantic-roundtrip": "npm run build --silent",
    "test:semantic-roundtrip": "node scripts/semantic-roundtrip-xlsx2md.mjs",
    precli: "npm run build --silent",
    cli: "node scripts/miku-json2xlsx-cli.mjs",
    "smoke:version": "npm run build --silent && node scripts/miku-json2xlsx-cli.mjs --version",
    "prebuild:bundle": "npm run build",
    "build:bundle": "node scripts/build-cli-bundle.mjs",
    "build:all": "npm run build:bundle",
    "smoke:bundle": "node scripts/smoke-cli-bundle.mjs",
    "smoke:runtime": "node scripts/smoke-runtime-bundle.mjs",
    "verify:core-zip-compat": "npm run build --silent && node scripts/verify-core-zip-compat.mjs",
    "prebenchmark:jsonl": "npm run build --silent",
    "benchmark:jsonl": "node scripts/benchmark-jsonl-stream.mjs"
  },
  engines: {
    node: ">=20"
  },
  devDependencies: {
    "@types/node": "^22.10.2",
    esbuild: "^0.28.1",
    typescript: "^5.7.3",
    vitest: "^3.0.0"
  },
  overrides: {
    esbuild: "^0.28.1"
  },
  license: "Apache-2.0"
};

// src/ts/cli-commands.ts
import { access, readFile as readFile2, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join as join2 } from "node:path";

// src/ts/cli-output.ts
var DEFAULT_IO = {
  stdout: process.stdout,
  stderr: process.stderr
};
function writeUsageError(message, io) {
  io.stderr.write(`${message}
Run miku-json2xlsx --help for the current contract.
`);
  return 2;
}
function writeDiagnosticsText(diagnostics, io) {
  for (const diagnostic2 of diagnostics) {
    io.stderr.write(`${diagnostic2.severity}: [${diagnostic2.code}] ${diagnostic2.message}
`);
  }
}
function writeExpectedFailure(result, format, io) {
  if (format === "json") {
    io.stdout.write(`${JSON.stringify(result)}
`);
  } else {
    writeDiagnosticsText(result.diagnostics, io);
  }
  return 1;
}
function renderTypes(types) {
  return types.length === 0 ? "-" : types.map(({ type, count }) => `${type}:${count}`).join(",");
}
function writeInspectionText(report, source, io) {
  io.stdout.write(`Input: ${source}
`);
  io.stdout.write(
    `Records: ${report.recordCount} total, ${report.inspectedRecordCount} inspected (${report.scope.mode})
`
  );
  io.stdout.write("Paths:\n");
  for (const path of report.paths) {
    io.stdout.write(
      `- ${path.path}: occurrence=${path.occurrenceCount}, missing=${path.missingCount}, null=${path.nullCount}, values=${path.valueCount}, types=${renderTypes(path.types)}`
    );
    if (path.arrayElementTypes.length > 0) {
      io.stdout.write(`, elementTypes=${renderTypes(path.arrayElementTypes)}`);
    }
    if (path.samples.length > 0) {
      io.stdout.write(`, samples=${path.samples.join(" | ")}`);
    }
    io.stdout.write("\n");
  }
}

// src/ts/auto-mapping.ts
var PROPERTY_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
var EXCEL_MAX_COLUMNS = 16384;
function observedType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
function inferredType(types) {
  const nonNull = [...types].filter((type) => type !== "null");
  if (nonNull.length === 1) {
    if (nonNull[0] === "boolean") return "boolean";
    if (nonNull[0] === "number") return "number";
    if (nonNull[0] === "string") return "string";
  }
  return "json";
}
function uniqueTrackingName(base, columnNames) {
  let candidate = base;
  while (columnNames.has(candidate)) candidate = `_${candidate}`;
  return candidate;
}
async function generateAutoMapping(records) {
  const observations = /* @__PURE__ */ new Map();
  const invalidPaths = /* @__PURE__ */ new Set();
  let recordsScanned = 0;
  const observe = (path, value, candidate) => {
    const current = observations.get(path) ?? { candidate: false, types: /* @__PURE__ */ new Set() };
    current.candidate ||= candidate;
    current.types.add(observedType(value));
    observations.set(path, current);
  };
  const visit = (value, path, depth) => {
    const type = observedType(value);
    observe(path, value, depth === 1 || type !== "object" && depth > 1);
    if (type !== "object") return;
    for (const key of Object.keys(value).sort()) {
      const childPath2 = `${path}.${key}`;
      if (!PROPERTY_NAME.test(key)) {
        invalidPaths.add(childPath2);
        continue;
      }
      visit(value[key], childPath2, depth + 1);
    }
  };
  for await (const record of records) {
    recordsScanned += 1;
    if (record.value === null || typeof record.value !== "object" || Array.isArray(record.value)) {
      return {
        status: "failure",
        diagnostics: [{
          code: "AUTO_MAPPING_RECORD_OBJECT_REQUIRED",
          message: "Automatic mapping requires every input record to be a JSON object.",
          severity: "error",
          source: { recordNumber: record.recordNumber, line: record.inputLine }
        }],
        recordsScanned
      };
    }
    for (const key of Object.keys(record.value).sort()) {
      const path = `$.${key}`;
      if (!PROPERTY_NAME.test(key)) {
        invalidPaths.add(path);
        continue;
      }
      visit(record.value[key], path, 1);
    }
  }
  if (invalidPaths.size > 0) {
    return {
      status: "failure",
      diagnostics: [...invalidPaths].sort().map((path) => ({
        code: "AUTO_MAPPING_UNSUPPORTED_PROPERTY_NAME",
        message: `Automatic mapping cannot represent this property name in mapping v1: ${path}`,
        severity: "error",
        source: { jsonPath: path }
      })),
      recordsScanned
    };
  }
  const columns = [...observations.entries()].filter(([, observation]) => observation.candidate).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([sourcePath, observation]) => ({
    name: sourcePath.slice(2),
    sourcePath,
    type: inferredType(observation.types)
  }));
  if (columns.length === 0) {
    return {
      status: "failure",
      diagnostics: [{
        code: "AUTO_MAPPING_NO_COLUMNS",
        message: "Automatic mapping did not find any JSON properties to convert.",
        severity: "error"
      }],
      recordsScanned
    };
  }
  if (columns.length + 2 > EXCEL_MAX_COLUMNS) {
    return {
      status: "failure",
      diagnostics: [{
        code: "EXCEL_COLUMN_LIMIT",
        message: `Automatic mapping found ${columns.length} data columns, exceeding Excel's ${EXCEL_MAX_COLUMNS}-column limit with tracking columns.`,
        severity: "error",
        source: { sheet: "Records" }
      }],
      recordsScanned
    };
  }
  const columnNames = new Set(columns.map((column) => column.name));
  const recordIdColumn = uniqueTrackingName("record_id", columnNames);
  columnNames.add(recordIdColumn);
  const sourceRecordColumn = uniqueTrackingName("source_record", columnNames);
  return {
    status: "success",
    mapping: {
      schemaVersion: 1,
      sheets: [{
        name: "Records",
        kind: "root",
        sourcePath: "$",
        columns,
        recordIdColumn,
        sourceRecordColumn
      }]
    },
    diagnostics: [],
    recordsScanned
  };
}

// src/ts/stored-zip.ts
import { open, stat } from "node:fs/promises";
var ZIP32_MAX_ENTRY_COUNT = 65535;
var ZIP32_MAX_VALUE = 4294967295;
var ZIP_MAX_PATH_BYTES = 65535;
var FILE_CHUNK_SIZE = 64 * 1024;
var encoder = new TextEncoder();
var crcTable = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 3988292384 ^ value >>> 1 : value >>> 1;
  }
  crcTable[index] = value >>> 0;
}
function updateCrc32(crc, data) {
  let next = crc;
  for (const value of data) next = crcTable[(next ^ value) & 255] ^ next >>> 8;
  return next;
}
function crc32(data) {
  return (updateCrc32(4294967295, data) ^ 4294967295) >>> 0;
}
function writeUint16(buffer, offset, value) {
  buffer[offset] = value & 255;
  buffer[offset + 1] = value >>> 8 & 255;
}
function writeUint32(buffer, offset, value) {
  buffer[offset] = value & 255;
  buffer[offset + 1] = value >>> 8 & 255;
  buffer[offset + 2] = value >>> 16 & 255;
  buffer[offset + 3] = value >>> 24 & 255;
}
function concatBytes(parts) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  assertZip32Value(length, "ZIP section size");
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}
function normalizeStoredZipPath(path) {
  const withoutHash = path.split("#", 1)[0] ?? "";
  const raw = withoutHash.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = [];
  for (const part of raw.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) throw new Error(`ZIP entry path escapes package root: ${path}`);
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  if (parts.length === 0) throw new Error(`ZIP entry path is empty: ${path}`);
  return parts.join("/");
}
function comparePaths(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function assertZip32Value(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > ZIP32_MAX_VALUE) {
    throw new Error(`${label} exceeds the ZIP32 limit: ${value}`);
  }
}
function assertEntryCount(count) {
  if (count > ZIP32_MAX_ENTRY_COUNT) {
    throw new Error(`ZIP entry count exceeds the ZIP32 limit: ${count}`);
  }
}
function encodedPath(path) {
  const name = encoder.encode(path);
  if (name.length > ZIP_MAX_PATH_BYTES) {
    throw new Error(`ZIP entry path exceeds 65535 UTF-8 bytes: ${path}`);
  }
  return name;
}
function localHeader(path, crc, size) {
  const name = encodedPath(path);
  const local = new Uint8Array(30 + name.length);
  writeUint32(local, 0, 67324752);
  writeUint16(local, 4, 20);
  writeUint16(local, 6, 2048);
  writeUint16(local, 8, 0);
  writeUint16(local, 10, 0);
  writeUint16(local, 12, 33);
  writeUint32(local, 14, crc);
  writeUint32(local, 18, size);
  writeUint32(local, 22, size);
  writeUint16(local, 26, name.length);
  local.set(name, 30);
  return local;
}
function centralHeader(path, crc, size, localOffset) {
  const name = encodedPath(path);
  const central = new Uint8Array(46 + name.length);
  writeUint32(central, 0, 33639248);
  writeUint16(central, 4, 20);
  writeUint16(central, 6, 20);
  writeUint16(central, 8, 2048);
  writeUint16(central, 10, 0);
  writeUint16(central, 12, 0);
  writeUint16(central, 14, 33);
  writeUint32(central, 16, crc);
  writeUint32(central, 20, size);
  writeUint32(central, 24, size);
  writeUint16(central, 28, name.length);
  writeUint32(central, 42, localOffset);
  central.set(name, 46);
  return central;
}
function endOfCentralDirectory(entryCount, centralSize, centralOffset) {
  assertEntryCount(entryCount);
  assertZip32Value(centralSize, "ZIP central directory size");
  assertZip32Value(centralOffset, "ZIP central directory offset");
  const end = new Uint8Array(22);
  writeUint32(end, 0, 101010256);
  writeUint16(end, 8, entryCount);
  writeUint16(end, 10, entryCount);
  writeUint32(end, 12, centralSize);
  writeUint32(end, 16, centralOffset);
  return end;
}
function prepareMemoryEntries(entries) {
  assertEntryCount(entries.length);
  return entries.map((entry) => {
    const data = typeof entry.data === "string" ? encoder.encode(entry.data) : entry.data;
    assertZip32Value(data.length, `ZIP entry size for ${entry.path}`);
    return {
      path: normalizeStoredZipPath(entry.path),
      data,
      size: data.length,
      crc: crc32(data)
    };
  }).sort((left, right) => comparePaths(left.path, right.path));
}
function writeStoredZip(entries) {
  const prepared = prepareMemoryEntries(entries);
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const entry of prepared) {
    assertZip32Value(localOffset, "ZIP local entry offset");
    const local = localHeader(entry.path, entry.crc, entry.size);
    centralParts.push(centralHeader(entry.path, entry.crc, entry.size, localOffset));
    localParts.push(local, entry.data);
    localOffset += local.length + entry.size;
  }
  const centralDirectory = concatBytes(centralParts);
  const end = endOfCentralDirectory(prepared.length, centralDirectory.length, localOffset);
  return concatBytes([...localParts, centralDirectory, end]);
}
async function fileCrc32(filePath) {
  const handle = await open(filePath, "r");
  const buffer = new Uint8Array(FILE_CHUNK_SIZE);
  let crc = 4294967295;
  try {
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      crc = updateCrc32(crc, buffer.subarray(0, bytesRead));
    }
  } finally {
    await handle.close();
  }
  return (crc ^ 4294967295) >>> 0;
}
async function prepareEntries(entries) {
  assertEntryCount(entries.length);
  const prepared = [];
  for (const entry of entries) {
    const entryPath = normalizeStoredZipPath(entry.path);
    if ("data" in entry) {
      const data = typeof entry.data === "string" ? encoder.encode(entry.data) : entry.data;
      assertZip32Value(data.length, `ZIP entry size for ${entry.path}`);
      prepared.push({ path: entryPath, data, size: data.length, crc: crc32(data) });
      continue;
    }
    const details = await stat(entry.filePath);
    assertZip32Value(details.size, `ZIP entry size for ${entry.path}`);
    prepared.push({
      path: entryPath,
      filePath: entry.filePath,
      size: details.size,
      crc: await fileCrc32(entry.filePath)
    });
  }
  return prepared.sort((left, right) => comparePaths(left.path, right.path));
}
async function copyFileToSink(filePath, sink) {
  const input = await open(filePath, "r");
  const buffer = new Uint8Array(FILE_CHUNK_SIZE);
  try {
    while (true) {
      const { bytesRead } = await input.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      await sink.write(buffer.subarray(0, bytesRead));
    }
  } finally {
    await input.close();
  }
}
async function writeStoredZipToSink(entries, sink) {
  const prepared = await prepareEntries(entries);
  const centralParts = [];
  let localOffset = 0;
  for (const entry of prepared) {
    assertZip32Value(localOffset, "ZIP local entry offset");
    const local = localHeader(entry.path, entry.crc, entry.size);
    await sink.write(local);
    if ("data" in entry) await sink.write(entry.data);
    else await copyFileToSink(entry.filePath, sink);
    centralParts.push(centralHeader(entry.path, entry.crc, entry.size, localOffset));
    localOffset += local.length + entry.size;
  }
  const centralDirectory = concatBytes(centralParts);
  const end = endOfCentralDirectory(prepared.length, centralDirectory.length, localOffset);
  await sink.write(centralDirectory);
  await sink.write(end);
}
async function writeStoredZipFile(outputPath, entries) {
  const output = await open(outputPath, "w");
  try {
    await writeStoredZipToSink(entries, {
      async write(data) {
        let offset = 0;
        while (offset < data.length) {
          const { bytesWritten } = await output.write(data, offset, data.length - offset);
          if (bytesWritten === 0) throw new Error(`Unable to make progress writing ZIP output: ${outputPath}`);
          offset += bytesWritten;
        }
      }
    });
  } finally {
    await output.close();
  }
}

// src/ts/office-zip.ts
var writeOfficeZip = writeStoredZip;
var writeOfficeZipFile = writeStoredZipFile;

// src/ts/xlsx-writer.ts
function xlsxXml(value) {
  return value.replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function xlsxColumnName(index) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + value % 26) + name;
    value = Math.floor(value / 26);
  }
  return name;
}
function excelDate(value) {
  return value.getTime() / 864e5 + 25569;
}
function cellXml(value, row, column, header) {
  const ref = `${xlsxColumnName(column)}${row + 1}`;
  if (value === void 0) return `<c r="${ref}"/>`;
  if (value instanceof Date) return `<c r="${ref}" s="1"><v>${excelDate(value)}</v></c>`;
  if (typeof value === "number") return `<c r="${ref}"><v>${value}</v></c>`;
  if (typeof value === "boolean") return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
  const style = header ? ` s="2"` : "";
  return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xlsxXml(value)}</t></is></c>`;
}
function xlsxRowXml(row, rowIndex, header = rowIndex === 0) {
  return `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => cellXml(value, rowIndex, columnIndex, header)).join("")}</row>`;
}
function xlsxWorksheetStart(columnCount, rowCount) {
  const range = `A1:${xlsxColumnName(Math.max(columnCount, 1) - 1)}${Math.max(rowCount, 1)}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="${range}"/>
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<sheetData>`;
}
function xlsxWorksheetEnd(columnCount, rowCount) {
  const range = `A1:${xlsxColumnName(Math.max(columnCount, 1) - 1)}${Math.max(rowCount, 1)}`;
  return `</sheetData>
<autoFilter ref="${range}"/>
</worksheet>`;
}
function worksheetXml(sheet) {
  const maxColumns = Math.max(1, ...sheet.rows.map((row) => row.length));
  const lastRow = Math.max(sheet.rows.length, 1);
  const headerRows = new Set(sheet.headerRows ?? [0]);
  const rows = sheet.rows.map((row, rowIndex) => xlsxRowXml(row, rowIndex, headerRows.has(rowIndex))).join("");
  return `${xlsxWorksheetStart(maxColumns, lastRow)}${rows}${xlsxWorksheetEnd(maxColumns, lastRow)}`;
}
function relationships(items) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map((item) => `<Relationship Id="${item.id}" Type="${item.type}" Target="${item.target}"/>`).join("")}</Relationships>`;
}
function contentTypes(sheetCount) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
${Array.from({ length: sheetCount }, (_unused, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
</Types>`;
}
var styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm:ss"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="1"><fill><patternFill patternType="none"/></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
function xlsxPackageEntries(sheetNames) {
  const workbookSheets = sheetNames.map((name, index) => `<sheet name="${xlsxXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("");
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`;
  const workbookRels = relationships([
    ...sheetNames.map((_sheet, index) => ({ id: `rId${index + 1}`, type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet", target: `worksheets/sheet${index + 1}.xml` })),
    { id: `rId${sheetNames.length + 1}`, type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles", target: "styles.xml" }
  ]);
  return [
    { path: "[Content_Types].xml", data: contentTypes(sheetNames.length) },
    { path: "_rels/.rels", data: relationships([
      { id: "rId1", type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument", target: "xl/workbook.xml" },
      { id: "rId2", type: "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties", target: "docProps/core.xml" },
      { id: "rId3", type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties", target: "docProps/app.xml" }
    ]) },
    { path: "xl/workbook.xml", data: workbook },
    { path: "xl/_rels/workbook.xml.rels", data: workbookRels },
    { path: "xl/styles.xml", data: styles },
    { path: "docProps/core.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>miku-json2xlsx</dc:creator><cp:lastModifiedBy>miku-json2xlsx</cp:lastModifiedBy></cp:coreProperties>` },
    { path: "docProps/app.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>miku-json2xlsx</Application></Properties>` }
  ];
}
function writeXlsx(sheets) {
  return writeOfficeZip([
    ...xlsxPackageEntries(sheets.map((sheet) => sheet.name)),
    ...sheets.map((sheet, index) => ({ path: `xl/worksheets/sheet${index + 1}.xml`, data: worksheetXml(sheet) }))
  ]);
}

// src/ts/workbook-cover.ts
var WORKBOOK_COVER_SCHEMA_VERSION = 1;
var WORKBOOK_COVER_SHEET_NAME = "README";
function fileNameOnly(value, fallback) {
  const normalized = value?.replace(/\\/g, "/");
  const name = normalized?.slice(normalized.lastIndexOf("/") + 1);
  return name || fallback;
}
function columnMeaning(role, sheet, column) {
  if (role === "parent-key") return `Links to ${sheet.parentSheet}.${sheet.parentIdColumn}`;
  if (role === "array-order") return "One-based position in the source array";
  if (role === "source-record") return "One-based position of the source record";
  if (role === "generated") return "Generated parent record identifier";
  if (column?.sourcePath === sheet.sourcePath && sheet.kind === "child") {
    return "Array element value";
  }
  return "Value extracted from the source JSON";
}
function dataColumnRow(sheet, column) {
  return [
    sheet.name,
    column.name,
    "data",
    column.sourcePath,
    column.type,
    columnMeaning("data", sheet, column)
  ];
}
function generatedColumnRows(sheet) {
  if (sheet.kind === "root") {
    return [
      [
        sheet.name,
        sheet.recordIdColumn,
        "generated",
        "",
        "number",
        columnMeaning("generated", sheet)
      ],
      [
        sheet.name,
        sheet.sourceRecordColumn,
        "source-record",
        "",
        "number",
        columnMeaning("source-record", sheet)
      ]
    ];
  }
  return [
    [
      sheet.name,
      sheet.parentIdColumn,
      "parent-key",
      "",
      "number",
      columnMeaning("parent-key", sheet)
    ],
    [
      sheet.name,
      sheet.childOrderColumn,
      "array-order",
      "",
      "number",
      columnMeaning("array-order", sheet)
    ],
    [
      sheet.name,
      sheet.sourceRecordColumn,
      "source-record",
      "",
      "number",
      columnMeaning("source-record", sheet)
    ]
  ];
}
function createWorkbookCoverSheet(mapping, metadata = {}) {
  const root = mapping.sheets.find((sheet) => sheet.kind === "root");
  const rows = [];
  const headerRows = [];
  const section = (title, headers, body) => {
    if (rows.length > 0) rows.push([]);
    headerRows.push(rows.length);
    rows.push([title]);
    headerRows.push(rows.length);
    rows.push(headers);
    rows.push(...body);
  };
  section("Workbook Metadata", ["Field", "Value"], [
    ["Workbook Format", "miku-json2xlsx workbook"],
    ["Cover Schema Version", String(WORKBOOK_COVER_SCHEMA_VERSION)],
    ["Description", "Normalized tabular representation of JSON or JSONL records"],
    ["Source File Name", fileNameOnly(metadata.sourceFileName, "runtime")],
    ["Source Format", metadata.sourceFormat ?? "JSON"],
    ["Mapping File Name", fileNameOnly(metadata.mappingFileName, "runtime")],
    ["Root Sheet", root.name],
    ["Record Order", "Preserves source record order"],
    ["Child Row Order", "Preserves source array element order"],
    ["Generated By", "miku-json2xlsx"],
    ["Generator Version", package_default.version]
  ]);
  section("Reading Instructions", ["Instruction"], [[
    "Read this README sheet first. Then read the root sheet. Child sheets contain expanded JSON arrays. Join child rows to the root sheet using the documented parent-key column."
  ]]);
  section(
    "Sheet Catalog",
    ["Sheet", "Kind", "Source JSON Path", "Parent Sheet", "Description"],
    mapping.sheets.map((sheet) => [
      sheet.name,
      sheet.kind,
      sheet.sourcePath,
      sheet.parentSheet ?? "",
      sheet.kind === "root" ? "One row per input record" : "Expanded source JSON array"
    ])
  );
  section(
    "Column Catalog",
    ["Sheet", "Column", "Role", "JSON Path", "Data Type", "Meaning"],
    mapping.sheets.flatMap((sheet) => [
      ...sheet.columns.map((column) => dataColumnRow(sheet, column)),
      ...generatedColumnRows(sheet)
    ])
  );
  section("Data Conventions", ["Convention", "Meaning"], [
    ["Blank Cell", "The source value is missing or null"],
    ["Record Order", "Root rows preserve source record order"],
    ["Child Row Order", "Child rows preserve source array element order"],
    ["Parent Join", "Join child rows to the root sheet using the documented parent-key column"],
    ["Formula Safety", "Formula-like source strings are stored as text and are not executed"],
    ["Cell Semantics", "Number, boolean, datetime, string, and blank use corresponding XLSX cell semantics"]
  ]);
  return { name: WORKBOOK_COVER_SHEET_NAME, rows, headerRows };
}

// src/ts/converter.ts
var EXCEL_MAX_ROWS = 1048576;
var EXCEL_MAX_COLUMNS2 = 16384;
var EXCEL_MAX_CELL_TEXT = 32767;
function valueAtPath(value, path) {
  if (path === "$") return value;
  let current = value;
  for (const key of path.slice(2).split(".")) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) return void 0;
    current = current[key];
  }
  return current;
}
function childValueAtPath(value, sheetPath, columnPath) {
  if (columnPath === sheetPath) return value;
  const relative = columnPath.slice(sheetPath.length);
  return valueAtPath(value, `$${relative}`);
}
function arrayMarkerCount(path) {
  return path.match(/\[\]/g)?.length ?? 0;
}
function conversionDiagnostic(code, message, severity, record, sheet, column) {
  return {
    code,
    message,
    severity,
    source: {
      recordNumber: record.recordNumber,
      line: record.inputLine,
      jsonPath: column?.sourcePath,
      sheet: sheet.name,
      column: column?.name
    }
  };
}
function safeStringCell(value, column, record, sheet) {
  const diagnostics = [];
  if (value.length > EXCEL_MAX_CELL_TEXT) {
    diagnostics.push(
      conversionDiagnostic(
        "EXCEL_CELL_TEXT_LIMIT",
        `Text for ${column.name} exceeds Excel's ${EXCEL_MAX_CELL_TEXT}-character cell limit.`,
        "error",
        record,
        sheet,
        column
      )
    );
    return { diagnostics };
  }
  if (/^[=+\-@]/.test(value)) {
    diagnostics.push(
      conversionDiagnostic(
        "EXCEL_FORMULA_INJECTION_PREVENTED",
        `Potential formula text in ${column.name} was stored as an inline string.`,
        "warning",
        record,
        sheet,
        column
      )
    );
  }
  return { value, diagnostics };
}
function cellValue(value, column, record, sheet) {
  if (value === void 0 || value === null) return { diagnostics: [] };
  if (column.type === "string") {
    if (typeof value === "string") return safeStringCell(value, column, record, sheet);
    if (typeof value === "number" || typeof value === "boolean") {
      const converted = safeStringCell(String(value), column, record, sheet);
      converted.diagnostics.unshift(
        conversionDiagnostic(
          "CONVERSION_TYPE_COERCED",
          `Converted ${typeof value} to string for ${column.name}.`,
          "warning",
          record,
          sheet,
          column
        )
      );
      return converted;
    }
    return {
      diagnostics: [
        conversionDiagnostic("CONVERSION_TYPE_MISMATCH", `Expected string-compatible value for ${column.name}.`, "error", record, sheet, column)
      ]
    };
  }
  if (column.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return {
        diagnostics: [
          conversionDiagnostic("CONVERSION_TYPE_MISMATCH", `Expected finite number for ${column.name}.`, "error", record, sheet, column)
        ]
      };
    }
    if (!Number.isSafeInteger(value) && Number.isInteger(value)) {
      return {
        value: String(value),
        diagnostics: [
          conversionDiagnostic(
            "EXCEL_NUMBER_PRECISION_RISK",
            `Unsafe integer in ${column.name} was stored as text to avoid additional Excel precision loss.`,
            "warning",
            record,
            sheet,
            column
          )
        ]
      };
    }
    return { value, diagnostics: [] };
  }
  if (column.type === "boolean") {
    if (typeof value !== "boolean") {
      return {
        diagnostics: [
          conversionDiagnostic("CONVERSION_TYPE_MISMATCH", `Expected boolean for ${column.name}.`, "error", record, sheet, column)
        ]
      };
    }
    return { value, diagnostics: [] };
  }
  if (column.type === "datetime") {
    if (typeof value !== "string") {
      return {
        diagnostics: [
          conversionDiagnostic("CONVERSION_TYPE_MISMATCH", `Expected ISO datetime string for ${column.name}.`, "error", record, sheet, column)
        ]
      };
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return {
        diagnostics: [
          conversionDiagnostic("CONVERSION_INVALID_DATETIME", `Invalid datetime for ${column.name}.`, "error", record, sheet, column)
        ]
      };
    }
    return { value: date, diagnostics: [] };
  }
  return safeStringCell(JSON.stringify(value), column, record, sheet);
}
function rootSheet(mapping) {
  return mapping.sheets.find((sheet) => sheet.kind === "root");
}
function prepareMappedSheets(mapping) {
  const root = rootSheet(mapping);
  if (!root) {
    return {
      sheets: [],
      diagnostics: [{ code: "CONVERSION_ROOT_SHEET_REQUIRED", message: "A root sheet is required.", severity: "error" }]
    };
  }
  if (root.sourcePath !== "$") {
    return {
      sheets: [],
      diagnostics: [{ code: "CONVERSION_ROOT_PATH_NOT_IMPLEMENTED", message: "The initial converter supports a root sheet sourcePath of $ only.", severity: "error" }]
    };
  }
  const diagnostics = [];
  const sheets = [{
    sheet: root,
    headers: [...root.columns.map((column) => column.name), root.recordIdColumn, root.sourceRecordColumn]
  }];
  for (const child of mapping.sheets.filter((sheet) => sheet.kind === "child")) {
    if (child.parentSheet !== root.name) {
      diagnostics.push({
        code: "CONVERSION_NESTED_CHILD_SHEET_NOT_SUPPORTED",
        message: `Child sheet ${child.name} must directly reference root sheet ${root.name}.`,
        severity: "error",
        source: { jsonPath: child.sourcePath }
      });
      continue;
    }
    if (!child.sourcePath.endsWith("[]") || arrayMarkerCount(child.sourcePath) !== 1) {
      diagnostics.push({
        code: "CONVERSION_CHILD_PATH_NOT_SUPPORTED",
        message: `Child sheet ${child.name} must use one array marker at the end of sourcePath.`,
        severity: "error",
        source: { jsonPath: child.sourcePath }
      });
      continue;
    }
    sheets.push({
      sheet: child,
      headers: [
        ...child.columns.map((column) => column.name),
        child.parentIdColumn,
        child.childOrderColumn,
        child.sourceRecordColumn
      ]
    });
  }
  return { sheets, diagnostics };
}
function convertRecordToMappedRows(record, definitions) {
  const rowsBySheet = /* @__PURE__ */ new Map();
  const diagnostics = [];
  const root = definitions.find(({ sheet }) => sheet.kind === "root")?.sheet;
  if (!root) return { rowsBySheet, diagnostics };
  const rootRow = [];
  for (const column of root.columns) {
    const converted = cellValue(valueAtPath(record.value, column.sourcePath), column, record, root);
    diagnostics.push(...converted.diagnostics);
    rootRow.push(converted.value);
  }
  rootRow.push(record.recordNumber, record.recordNumber);
  rowsBySheet.set(root.name, [rootRow]);
  for (const { sheet: child } of definitions.filter(({ sheet }) => sheet.kind === "child")) {
    const childRows = [];
    const children = valueAtPath(record.value, child.sourcePath.slice(0, -2));
    if (children === void 0 || children === null) {
      rowsBySheet.set(child.name, childRows);
      continue;
    }
    if (!Array.isArray(children)) {
      diagnostics.push({
        code: "CONVERSION_CHILD_ARRAY_REQUIRED",
        message: `Expected an array for child sheet ${child.name}.`,
        severity: "error",
        source: {
          recordNumber: record.recordNumber,
          line: record.inputLine,
          jsonPath: child.sourcePath
        }
      });
      rowsBySheet.set(child.name, childRows);
      continue;
    }
    for (const [childIndex, childValue] of children.entries()) {
      const childRow = [];
      for (const column of child.columns) {
        const converted = cellValue(
          childValueAtPath(childValue, child.sourcePath, column.sourcePath),
          column,
          record,
          child
        );
        diagnostics.push(...converted.diagnostics);
        childRow.push(converted.value);
      }
      childRow.push(record.recordNumber, childIndex + 1, record.recordNumber);
      childRows.push(childRow);
    }
    rowsBySheet.set(child.name, childRows);
  }
  return { rowsBySheet, diagnostics };
}
function convertRecordsToXlsx(records, mapping, options = {}) {
  const prepared = prepareMappedSheets(mapping);
  const diagnostics = [...prepared.diagnostics];
  if (diagnostics.some((diagnostic2) => diagnostic2.severity === "error")) {
    return { status: "failure", command: "convert", diagnostics, artifacts: [] };
  }
  const sheets = prepared.sheets.map(
    ({ sheet, headers }) => ({ name: sheet.name, rows: [headers] })
  );
  const sheetByName = new Map(sheets.map((sheet) => [sheet.name, sheet]));
  for (const record of records) {
    const converted = convertRecordToMappedRows(record, prepared.sheets);
    diagnostics.push(...converted.diagnostics);
    for (const [sheetName, rows] of converted.rowsBySheet) {
      sheetByName.get(sheetName).rows.push(...rows);
    }
  }
  for (const sheet of sheets) {
    const columnCount = Math.max(0, ...sheet.rows.map((row) => row.length));
    if (columnCount > EXCEL_MAX_COLUMNS2) {
      diagnostics.push({
        code: "EXCEL_COLUMN_LIMIT",
        message: `Sheet ${sheet.name} exceeds Excel's ${EXCEL_MAX_COLUMNS2}-column limit.`,
        severity: "error",
        source: { sheet: sheet.name }
      });
    }
    if (sheet.rows.length > EXCEL_MAX_ROWS) {
      diagnostics.push({
        code: "EXCEL_ROW_LIMIT",
        message: `Sheet ${sheet.name} exceeds Excel's ${EXCEL_MAX_ROWS}-row limit.`,
        severity: "error",
        source: { sheet: sheet.name }
      });
    }
  }
  if (diagnostics.some((diagnostic2) => diagnostic2.severity === "error")) {
    return { status: "failure", command: "convert", diagnostics, artifacts: [] };
  }
  return {
    status: "success",
    command: "convert",
    diagnostics,
    artifacts: [],
    xlsx: writeXlsx([
      createWorkbookCoverSheet(mapping, options.workbookMetadata),
      ...sheets
    ])
  };
}

// src/ts/inspector.ts
var TYPE_ORDER = [
  "null",
  "boolean",
  "number",
  "string",
  "object",
  "array",
  "unknown"
];
var DEFAULT_MAX_RECORDS = 1e3;
var DEFAULT_MAX_SAMPLES = 3;
var DEFAULT_MAX_SAMPLE_LENGTH = 160;
var MAX_RECORDS_LIMIT = 1e6;
var MAX_SAMPLES_LIMIT = 20;
var MAX_SAMPLE_LENGTH_LIMIT = 1e3;
function requireNonNegativeInteger(value, name, maximum) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new RangeError(`${name} must be a non-negative safe integer no greater than ${maximum}.`);
  }
  return value;
}
function requirePositiveInteger(value, name, maximum) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${name} must be a positive safe integer no greater than ${maximum}.`);
  }
  return value;
}
function valueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "string";
  if (typeof value === "object") return "object";
  return "unknown";
}
function childPath(parent, key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`;
}
function preview(value, maxLength) {
  let rendered;
  try {
    rendered = JSON.stringify(value) ?? String(value);
  } catch {
    rendered = String(value);
  }
  return rendered.length <= maxLength ? rendered : `${rendered.slice(0, maxLength - 1)}\u2026`;
}
function increment(map, type) {
  map.set(type, (map.get(type) ?? 0) + 1);
}
function typeCounts(map) {
  return TYPE_ORDER.flatMap((type) => {
    const count = map.get(type);
    return count === void 0 ? [] : [{ type, count }];
  });
}
function inspectRecords(records, options = {}) {
  const maxRecords = requirePositiveInteger(
    options.maxRecords ?? DEFAULT_MAX_RECORDS,
    "maxRecords",
    MAX_RECORDS_LIMIT
  );
  const maxSamples = requireNonNegativeInteger(
    options.maxSamplesPerPath ?? DEFAULT_MAX_SAMPLES,
    "maxSamplesPerPath",
    MAX_SAMPLES_LIMIT
  );
  const maxSampleLength = requirePositiveInteger(
    options.maxSampleLength ?? DEFAULT_MAX_SAMPLE_LENGTH,
    "maxSampleLength",
    MAX_SAMPLE_LENGTH_LIMIT
  );
  const inspectedRecords = records.slice(0, maxRecords);
  const summaries = /* @__PURE__ */ new Map();
  function summaryFor(path) {
    const existing = summaries.get(path);
    if (existing) return existing;
    const created = {
      recordIndexes: /* @__PURE__ */ new Set(),
      valueCount: 0,
      nullCount: 0,
      types: /* @__PURE__ */ new Map(),
      arrayElementTypes: /* @__PURE__ */ new Map(),
      samples: [],
      sampleSet: /* @__PURE__ */ new Set()
    };
    summaries.set(path, created);
    return created;
  }
  function visit(value, path, recordIndex) {
    const summary = summaryFor(path);
    const type = valueType(value);
    summary.recordIndexes.add(recordIndex);
    summary.valueCount += 1;
    if (value === null) summary.nullCount += 1;
    increment(summary.types, type);
    if (summary.samples.length < maxSamples) {
      const sample = preview(value, maxSampleLength);
      if (!summary.sampleSet.has(sample)) {
        summary.sampleSet.add(sample);
        summary.samples.push(sample);
      }
    }
    if (Array.isArray(value)) {
      for (const element of value) {
        increment(summary.arrayElementTypes, valueType(element));
        visit(element, `${path}[]`, recordIndex);
      }
      return;
    }
    if (value !== null && typeof value === "object") {
      for (const key of Object.keys(value).sort()) {
        visit(value[key], childPath(path, key), recordIndex);
      }
    }
  }
  inspectedRecords.forEach((record, recordIndex) => {
    visit(record.value, "$", recordIndex);
  });
  const inspectedRecordCount = inspectedRecords.length;
  const paths = [...summaries.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([path, summary]) => ({
    path,
    occurrenceCount: summary.recordIndexes.size,
    missingCount: inspectedRecordCount - summary.recordIndexes.size,
    valueCount: summary.valueCount,
    nullCount: summary.nullCount,
    types: typeCounts(summary.types),
    arrayElementTypes: typeCounts(summary.arrayElementTypes),
    samples: summary.samples
  }));
  return {
    schemaVersion: 1,
    recordCount: records.length,
    inspectedRecordCount,
    scope: {
      mode: inspectedRecordCount === records.length ? "full" : "sampled",
      maxRecords
    },
    paths
  };
}

// src/ts/mapping.ts
var MAPPING_SCHEMA_VERSION = 1;
var COLUMN_TYPES = /* @__PURE__ */ new Set(["string", "number", "boolean", "datetime", "json"]);
var ROOT_KEYS = /* @__PURE__ */ new Set(["schemaVersion", "sheets"]);
var SHEET_KEYS = /* @__PURE__ */ new Set([
  "name",
  "kind",
  "sourcePath",
  "columns",
  "recordIdColumn",
  "sourceRecordColumn",
  "parentSheet",
  "parentIdColumn",
  "childOrderColumn"
]);
var COLUMN_KEYS = /* @__PURE__ */ new Set(["name", "sourcePath", "type"]);
var JSON_PATH = /^\$(?:\.[A-Za-z_][A-Za-z0-9_]*|\[\])*$/;
var INVALID_SHEET_NAME = /[\\/?*[\]:]/;
var RESERVED_SHEET_NAMES = /* @__PURE__ */ new Set(["readme"]);
function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function diagnostic(code, message, jsonPath) {
  return { code, message, severity: "error", source: { jsonPath } };
}
function validateKeys(value, allowed, jsonPath, diagnostics) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      diagnostics.push(diagnostic("MAPPING_UNKNOWN_PROPERTY", `Unknown mapping property: ${key}`, `${jsonPath}.${key}`));
    }
  }
}
function requiredString(value, key, jsonPath, diagnostics) {
  const candidate = value[key];
  if (typeof candidate !== "string" || candidate.length === 0) {
    diagnostics.push(diagnostic("MAPPING_REQUIRED_STRING", `${key} must be a non-empty string.`, `${jsonPath}.${key}`));
    return void 0;
  }
  return candidate;
}
function optionalString(value, key, jsonPath, diagnostics) {
  if (value[key] === void 0) return void 0;
  return requiredString(value, key, jsonPath, diagnostics);
}
function validPath(path, jsonPath, diagnostics) {
  if (JSON_PATH.test(path)) return true;
  diagnostics.push(
    diagnostic(
      "MAPPING_INVALID_JSON_PATH",
      "JSON path must start with $ and use .property or [] segments.",
      jsonPath
    )
  );
  return false;
}
function isPathWithinSheet(columnPath, sheetPath) {
  return sheetPath === "$" || columnPath === sheetPath || columnPath.startsWith(`${sheetPath}.`);
}
function validateMapping(value) {
  const diagnostics = [];
  if (!isObject(value)) {
    return { status: "failure", diagnostics: [diagnostic("MAPPING_ROOT_OBJECT_REQUIRED", "Mapping must be a JSON object.", "$")] };
  }
  validateKeys(value, ROOT_KEYS, "$", diagnostics);
  if (value.schemaVersion !== MAPPING_SCHEMA_VERSION) {
    diagnostics.push(
      diagnostic(
        "MAPPING_UNSUPPORTED_SCHEMA_VERSION",
        `schemaVersion must be ${MAPPING_SCHEMA_VERSION}.`,
        "$.schemaVersion"
      )
    );
  }
  if (!Array.isArray(value.sheets) || value.sheets.length === 0) {
    diagnostics.push(diagnostic("MAPPING_SHEETS_REQUIRED", "sheets must be a non-empty array.", "$.sheets"));
    return { status: "failure", diagnostics };
  }
  const sheets = [];
  const sheetNames = /* @__PURE__ */ new Set();
  const normalizedSheetNames = /* @__PURE__ */ new Set();
  let rootCount = 0;
  for (const [sheetIndex, rawSheet] of value.sheets.entries()) {
    const sheetPath = `$.sheets[${sheetIndex}]`;
    if (!isObject(rawSheet)) {
      diagnostics.push(diagnostic("MAPPING_SHEET_OBJECT_REQUIRED", "Each sheet must be an object.", sheetPath));
      continue;
    }
    validateKeys(rawSheet, SHEET_KEYS, sheetPath, diagnostics);
    const name = requiredString(rawSheet, "name", sheetPath, diagnostics);
    const kind = requiredString(rawSheet, "kind", sheetPath, diagnostics);
    const sourcePath = requiredString(rawSheet, "sourcePath", sheetPath, diagnostics);
    if (name) {
      const normalizedName = name.toLowerCase();
      if (RESERVED_SHEET_NAMES.has(normalizedName)) {
        diagnostics.push(
          diagnostic(
            "MAPPING_RESERVED_SHEET_NAME",
            `Sheet name is reserved by the generated workbook cover: ${name}`,
            `${sheetPath}.name`
          )
        );
      }
      if (normalizedSheetNames.has(normalizedName)) {
        diagnostics.push(diagnostic("MAPPING_DUPLICATE_SHEET", `Sheet name is duplicated for Excel: ${name}`, `${sheetPath}.name`));
      }
      if (name.length > 31 || INVALID_SHEET_NAME.test(name) || name.startsWith("'") || name.endsWith("'")) {
        diagnostics.push(
          diagnostic(
            "MAPPING_INVALID_SHEET_NAME",
            "Sheet name must be at most 31 characters and must satisfy Excel sheet-name restrictions.",
            `${sheetPath}.name`
          )
        );
      }
      sheetNames.add(name);
      normalizedSheetNames.add(normalizedName);
    }
    if (kind !== "root" && kind !== "child") {
      diagnostics.push(diagnostic("MAPPING_INVALID_SHEET_KIND", "kind must be root or child.", `${sheetPath}.kind`));
    }
    if (sourcePath) validPath(sourcePath, `${sheetPath}.sourcePath`, diagnostics);
    if (kind === "root") rootCount += 1;
    if (kind === "child" && sourcePath && !sourcePath.includes("[]")) {
      diagnostics.push(
        diagnostic("MAPPING_CHILD_ARRAY_PATH_REQUIRED", "A child sheet sourcePath must include an [] array segment.", `${sheetPath}.sourcePath`)
      );
    }
    if (!Array.isArray(rawSheet.columns) || rawSheet.columns.length === 0) {
      diagnostics.push(diagnostic("MAPPING_COLUMNS_REQUIRED", "columns must be a non-empty array.", `${sheetPath}.columns`));
      continue;
    }
    const columns = [];
    const columnNames = /* @__PURE__ */ new Set();
    for (const [columnIndex, rawColumn] of rawSheet.columns.entries()) {
      const columnPath = `${sheetPath}.columns[${columnIndex}]`;
      if (!isObject(rawColumn)) {
        diagnostics.push(diagnostic("MAPPING_COLUMN_OBJECT_REQUIRED", "Each column must be an object.", columnPath));
        continue;
      }
      validateKeys(rawColumn, COLUMN_KEYS, columnPath, diagnostics);
      const columnName = requiredString(rawColumn, "name", columnPath, diagnostics);
      const columnSourcePath = requiredString(rawColumn, "sourcePath", columnPath, diagnostics);
      const columnType = requiredString(rawColumn, "type", columnPath, diagnostics);
      if (columnName && columnNames.has(columnName)) {
        diagnostics.push(diagnostic("MAPPING_DUPLICATE_COLUMN", `Column name is duplicated: ${columnName}`, `${columnPath}.name`));
      }
      if (columnName) columnNames.add(columnName);
      if (columnSourcePath) {
        validPath(columnSourcePath, `${columnPath}.sourcePath`, diagnostics);
        if (sourcePath && !isPathWithinSheet(columnSourcePath, sourcePath)) {
          diagnostics.push(
            diagnostic(
              "MAPPING_COLUMN_OUTSIDE_SHEET",
              "Column sourcePath must be the sheet sourcePath or a descendant of it.",
              `${columnPath}.sourcePath`
            )
          );
        }
      }
      if (!columnType || !COLUMN_TYPES.has(columnType)) {
        diagnostics.push(
          diagnostic("MAPPING_INVALID_COLUMN_TYPE", "type must be string, number, boolean, datetime, or json.", `${columnPath}.type`)
        );
      }
      if (columnName && columnSourcePath && COLUMN_TYPES.has(columnType)) {
        columns.push({ name: columnName, sourcePath: columnSourcePath, type: columnType });
      }
    }
    const recordIdColumn = optionalString(rawSheet, "recordIdColumn", sheetPath, diagnostics);
    const sourceRecordColumn = optionalString(rawSheet, "sourceRecordColumn", sheetPath, diagnostics);
    const parentSheet = optionalString(rawSheet, "parentSheet", sheetPath, diagnostics);
    const parentIdColumn = optionalString(rawSheet, "parentIdColumn", sheetPath, diagnostics);
    const childOrderColumn = optionalString(rawSheet, "childOrderColumn", sheetPath, diagnostics);
    const generatedNames = [recordIdColumn, sourceRecordColumn, parentIdColumn, childOrderColumn].filter(
      (candidate) => candidate !== void 0
    );
    for (const generatedName of generatedNames) {
      if (columnNames.has(generatedName) || generatedNames.filter((candidate) => candidate === generatedName).length > 1) {
        diagnostics.push(
          diagnostic("MAPPING_COLUMN_NAME_COLLISION", `Generated column name collides: ${generatedName}`, sheetPath)
        );
      }
    }
    if (kind === "root" && (!recordIdColumn || !sourceRecordColumn)) {
      diagnostics.push(
        diagnostic("MAPPING_ROOT_TRACKING_REQUIRED", "A root sheet requires recordIdColumn and sourceRecordColumn.", sheetPath)
      );
    }
    if (kind === "child" && (!parentSheet || !parentIdColumn || !childOrderColumn || !sourceRecordColumn)) {
      diagnostics.push(
        diagnostic(
          "MAPPING_CHILD_TRACKING_REQUIRED",
          "A child sheet requires parentSheet, parentIdColumn, childOrderColumn, and sourceRecordColumn.",
          sheetPath
        )
      );
    }
    if (name && (kind === "root" || kind === "child") && sourcePath && columns.length > 0) {
      sheets.push({ name, kind, sourcePath, columns, recordIdColumn, sourceRecordColumn, parentSheet, parentIdColumn, childOrderColumn });
    }
  }
  if (rootCount !== 1) {
    diagnostics.push(diagnostic("MAPPING_ROOT_SHEET_COUNT", "Mapping must contain exactly one root sheet.", "$.sheets"));
  }
  for (const [index, sheet] of sheets.entries()) {
    if (sheet.kind === "child" && (!sheet.parentSheet || !sheetNames.has(sheet.parentSheet))) {
      diagnostics.push(
        diagnostic("MAPPING_UNKNOWN_PARENT_SHEET", `Child sheet parentSheet does not exist: ${sheet.parentSheet ?? ""}`, `$.sheets[${index}].parentSheet`)
      );
    }
  }
  if (diagnostics.length > 0) return { status: "failure", diagnostics };
  return { status: "success", mapping: { schemaVersion: 1, sheets }, diagnostics: [] };
}
function parseAndValidateMapping(text) {
  try {
    return validateMapping(JSON.parse(text));
  } catch (error) {
    return {
      status: "failure",
      diagnostics: [
        diagnostic("MAPPING_PARSE_ERROR", error instanceof Error ? error.message : "Mapping is not valid JSON.", "$")
      ]
    };
  }
}

// src/ts/node-input.ts
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";

// src/ts/record-reader.ts
var InputParseError = class extends Error {
  sourceName;
  line;
  constructor(message, sourceName, line) {
    super(`${sourceName}:${line}: ${message}`);
    this.name = "InputParseError";
    this.sourceName = sourceName;
    this.line = line;
  }
};
function lineAt(text, offset) {
  return text.slice(0, offset).split("\n").length;
}
function jsonErrorLine(text, error) {
  const position = error instanceof Error ? /position (\d+)/.exec(error.message) : void 0;
  return position ? lineAt(text, Number(position[1])) : 1;
}
function formatFromSourceName(sourceName) {
  if (/\.jsonl?$/i.test(sourceName)) {
    return sourceName.toLowerCase().endsWith(".jsonl") ? "jsonl" : "json";
  }
  return void 0;
}
function detectInputFormat(text, options = {}) {
  const sourceName = options.sourceName ?? "stdin";
  const configured = options.format ?? formatFromSourceName(sourceName);
  if (configured) return configured;
  const firstCharacter = text.trimStart()[0];
  if (firstCharacter === "[") return "json";
  if (firstCharacter === "{") {
    try {
      JSON.parse(text);
      return "json";
    } catch {
      return "jsonl";
    }
  }
  return "jsonl";
}
function parseJson(text, sourceName) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new InputParseError(
      error instanceof Error ? error.message : "Invalid JSON input.",
      sourceName,
      jsonErrorLine(text, error)
    );
  }
  if (Array.isArray(value)) {
    return value.map((record, index) => ({
      recordNumber: index + 1,
      inputLine: 1,
      value: record
    }));
  }
  if (value === null || typeof value !== "object") {
    throw new InputParseError("A JSON input must be an array or a single object.", sourceName, 1);
  }
  return [{ recordNumber: 1, inputLine: 1, value }];
}
function parseJsonl(text, sourceName) {
  const records = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (line.trim() === "") {
      continue;
    }
    try {
      records.push({ recordNumber: records.length + 1, inputLine: index + 1, value: JSON.parse(line) });
    } catch (error) {
      throw new InputParseError(
        error instanceof Error ? error.message : "Invalid JSONL record.",
        sourceName,
        index + 1
      );
    }
  }
  return records;
}
function readRecords(text, options = {}) {
  const sourceName = options.sourceName ?? "stdin";
  return detectInputFormat(text, options) === "json" ? parseJson(text, sourceName) : parseJsonl(text, sourceName);
}

// src/ts/node-input.ts
async function readRecordsFromFileWithFormat(path, options = {}) {
  const text = await readFile(path, "utf8");
  const readOptions = { ...options, sourceName: path };
  return {
    records: readRecords(text, readOptions),
    format: detectInputFormat(text, readOptions)
  };
}
async function readRecordsFromFile(path, options = {}) {
  return (await readRecordsFromFileWithFormat(path, options)).records;
}
async function readRecordsFromStdinWithFormat(input = process.stdin, options = {}) {
  let text = "";
  for await (const chunk of input) {
    text += chunk.toString();
  }
  const readOptions = { ...options, sourceName: "stdin" };
  return {
    records: readRecords(text, readOptions),
    format: detectInputFormat(text, readOptions)
  };
}
async function readRecordsFromStdin(input = process.stdin, options = {}) {
  return (await readRecordsFromStdinWithFormat(input, options)).records;
}
async function* readJsonlRecordsFromStream(input, sourceName = "stdin") {
  const lines = createInterface({
    input: Readable.from(input),
    crlfDelay: Infinity,
    terminal: false
  });
  let lineNumber = 0;
  let recordNumber = 0;
  for await (const line of lines) {
    lineNumber += 1;
    if (line.trim() === "") continue;
    try {
      recordNumber += 1;
      yield { recordNumber, inputLine: lineNumber, value: JSON.parse(line) };
    } catch (error) {
      throw new InputParseError(
        error instanceof Error ? error.message : "Invalid JSONL record.",
        sourceName,
        lineNumber
      );
    }
  }
}
function readJsonlRecordsFromFile(path) {
  return readJsonlRecordsFromStream(createReadStream(path), path);
}

// src/ts/streaming-converter.ts
import { open as open2, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
var EXCEL_MAX_ROWS2 = 1048576;
var MAX_DIAGNOSTICS = 1e3;
var MAX_UNKNOWN_PATHS = 1e3;
function worksheetXml2(sheet) {
  const columnCount = Math.max(1, ...sheet.rows.map((row) => row.length));
  const rowCount = Math.max(sheet.rows.length, 1);
  const headerRows = new Set(sheet.headerRows ?? [0]);
  return `${xlsxWorksheetStart(columnCount, rowCount)}${sheet.rows.map((row, index) => xlsxRowXml(row, index, headerRows.has(index))).join("")}${xlsxWorksheetEnd(columnCount, rowCount)}`;
}
function mappedPaths(mapping) {
  return new Set(mapping.sheets.flatMap((sheet) => [
    sheet.sourcePath,
    ...sheet.columns.map((column) => column.sourcePath)
  ]));
}
function isCoveredPath(path, coveredPaths) {
  if (coveredPaths.has(path)) return true;
  for (const covered of coveredPaths) {
    if (covered.startsWith(`${path}.`) || covered.startsWith(`${path}[]`)) return true;
  }
  return false;
}
function leafPaths(value, path = "$", output = []) {
  if (Array.isArray(value)) {
    const arrayPath = `${path}[]`;
    if (value.length === 0) output.push(arrayPath);
    else for (const item of value) leafPaths(item, arrayPath, output);
    return output;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0 && path !== "$") output.push(path);
    else for (const [key, child] of entries) leafPaths(child, `${path}.${key}`, output);
    return output;
  }
  output.push(path);
  return output;
}
function unknownPathDiagnostic(path, record) {
  return {
    code: "STREAM_UNKNOWN_PATH",
    message: `Input path ${path} is not covered by the explicit mapping and was ignored.`,
    severity: "warning",
    source: { recordNumber: record.recordNumber, line: record.inputLine, jsonPath: path }
  };
}
async function finalizeWorksheet(spool) {
  await spool.body.close();
  const output = await open2(spool.worksheetPath, "w");
  const input = await open2(spool.bodyPath, "r");
  const buffer = new Uint8Array(64 * 1024);
  const columnCount = spool.definition.headers.length;
  try {
    await output.write(xlsxWorksheetStart(columnCount, spool.rowCount));
    while (true) {
      const { bytesRead } = await input.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      await output.write(buffer.subarray(0, bytesRead));
    }
    await output.write(xlsxWorksheetEnd(columnCount, spool.rowCount));
  } finally {
    await input.close();
    await output.close();
  }
}
async function convertJsonlStreamToXlsxFile(records, mapping, outputPath, options = {}) {
  const prepared = prepareMappedSheets(mapping);
  if (prepared.diagnostics.some((item) => item.severity === "error")) {
    return {
      status: "failure",
      command: "convert",
      diagnostics: prepared.diagnostics,
      artifacts: [],
      recordsProcessed: 0,
      rowsWritten: {},
      inputMode: "streaming-jsonl"
    };
  }
  const directory = await mkdtemp(join(tmpdir(), "miku-json2xlsx-stream-"));
  const spools = [];
  const diagnostics = [];
  const diagnosticCounts = /* @__PURE__ */ new Map();
  const seenUnknownPaths = /* @__PURE__ */ new Set();
  const coveredPaths = mappedPaths(mapping);
  let recordsProcessed = 0;
  let handlesClosed = false;
  let hasErrors = false;
  let unknownPathOverflow = 0;
  const collect = (diagnostic2) => {
    if (diagnostic2.severity === "error") hasErrors = true;
    diagnosticCounts.set(diagnostic2.code, (diagnosticCounts.get(diagnostic2.code) ?? 0) + 1);
    if (diagnostics.length < MAX_DIAGNOSTICS) diagnostics.push(diagnostic2);
  };
  try {
    for (const [index, definition] of prepared.sheets.entries()) {
      const bodyPath = join(directory, `sheet-${index + 1}.rows.xml`);
      const worksheetPath = join(directory, `sheet-${index + 1}.xml`);
      const body = await open2(bodyPath, "w");
      await body.write(xlsxRowXml(definition.headers, 0));
      spools.push({ definition, bodyPath, worksheetPath, body, rowCount: 1 });
    }
    const spoolByName = new Map(spools.map((spool) => [spool.definition.sheet.name, spool]));
    for await (const record of records) {
      recordsProcessed += 1;
      for (const path of new Set(leafPaths(record.value))) {
        if (isCoveredPath(path, coveredPaths) || seenUnknownPaths.has(path)) continue;
        if (seenUnknownPaths.size < MAX_UNKNOWN_PATHS) {
          seenUnknownPaths.add(path);
          collect(unknownPathDiagnostic(path, record));
        } else {
          unknownPathOverflow += 1;
        }
      }
      const converted = convertRecordToMappedRows(record, prepared.sheets);
      for (const diagnostic2 of converted.diagnostics) collect(diagnostic2);
      if (converted.diagnostics.some((item) => item.severity === "error")) break;
      for (const [sheetName, rows] of converted.rowsBySheet) {
        const spool = spoolByName.get(sheetName);
        if (spool.rowCount + rows.length > EXCEL_MAX_ROWS2) {
          collect({
            code: "EXCEL_ROW_LIMIT",
            message: `Sheet ${sheetName} exceeds Excel's ${EXCEL_MAX_ROWS2}-row limit.`,
            severity: "error",
            source: { sheet: sheetName }
          });
          break;
        }
        for (const row of rows) {
          await spool.body.write(xlsxRowXml(row, spool.rowCount));
          spool.rowCount += 1;
        }
      }
      if (hasErrors) break;
      if (options.progressInterval && recordsProcessed % options.progressInterval === 0) {
        options.onProgress?.(recordsProcessed);
      }
    }
    const totalDiagnostics = [...diagnosticCounts.values()].reduce((sum, count) => sum + count, 0);
    if (totalDiagnostics > diagnostics.length) {
      diagnostics.push({
        code: "STREAM_DIAGNOSTICS_TRUNCATED",
        message: `Diagnostics were capped at ${MAX_DIAGNOSTICS}; ${totalDiagnostics - diagnostics.length} additional diagnostics were omitted.`,
        severity: "warning"
      });
    }
    if (unknownPathOverflow > 0) {
      diagnostics.push({
        code: "STREAM_UNKNOWN_PATHS_TRUNCATED",
        message: `Unknown path tracking was capped at ${MAX_UNKNOWN_PATHS}; ${unknownPathOverflow} additional occurrences were ignored.`,
        severity: "warning"
      });
    }
    const rowsWritten = Object.fromEntries(
      spools.map((spool) => [spool.definition.sheet.name, spool.rowCount - 1])
    );
    if (hasErrors) {
      for (const spool of spools) await spool.body.close().catch(() => void 0);
      handlesClosed = true;
      return {
        status: "failure",
        command: "convert",
        diagnostics,
        artifacts: [],
        recordsProcessed,
        rowsWritten,
        inputMode: "streaming-jsonl"
      };
    }
    for (const spool of spools) await finalizeWorksheet(spool);
    handlesClosed = true;
    const cover = createWorkbookCoverSheet(mapping, options.workbookMetadata);
    await writeOfficeZipFile(outputPath, [
      ...xlsxPackageEntries([cover.name, ...prepared.sheets.map(({ sheet }) => sheet.name)]),
      {
        path: "xl/worksheets/sheet1.xml",
        data: worksheetXml2(cover)
      },
      ...spools.map((spool, index) => ({
        path: `xl/worksheets/sheet${index + 2}.xml`,
        filePath: spool.worksheetPath
      }))
    ]);
    return {
      status: "success",
      command: "convert",
      diagnostics,
      artifacts: [],
      recordsProcessed,
      rowsWritten,
      inputMode: "streaming-jsonl"
    };
  } finally {
    if (!handlesClosed) {
      for (const spool of spools) await spool.body.close().catch(() => void 0);
    }
    await rm(directory, { recursive: true, force: true });
  }
}

// src/ts/cli-commands.ts
async function runInspect(options, io) {
  try {
    const readOptions = options.inputFormat === void 0 ? {} : { format: options.inputFormat };
    const records = options.input === "-" ? await readRecordsFromStdin(process.stdin, readOptions) : await readRecordsFromFile(options.input, readOptions);
    const report = inspectRecords(records, {
      maxRecords: options.maxRecords,
      maxSamplesPerPath: options.sampleValues
    });
    if (options.resultFormat === "json") {
      io.stdout.write(
        `${JSON.stringify({
          schemaVersion: 1,
          status: "success",
          command: "inspect",
          source: options.input,
          inspection: report,
          diagnostics: []
        })}
`
      );
    } else {
      writeInspectionText(report, options.input, io);
    }
    return 0;
  } catch (error) {
    if (!(error instanceof InputParseError)) throw error;
    const diagnostic2 = {
      code: "INPUT_PARSE_ERROR",
      message: error.message,
      severity: "error",
      source: {
        input: error.sourceName,
        line: error.line
      }
    };
    if (options.resultFormat === "json") {
      io.stdout.write(
        `${JSON.stringify({
          schemaVersion: 1,
          status: "failure",
          command: "inspect",
          source: options.input,
          diagnostics: [diagnostic2]
        })}
`
      );
    } else {
      io.stderr.write(`error: [${diagnostic2.code}] ${diagnostic2.message}
`);
    }
    return 2;
  }
}
async function runValidateMapping(options, io) {
  let text;
  try {
    text = await readFile2(options.mapping, "utf8");
  } catch (error) {
    const result2 = {
      status: "failure",
      command: "validate-mapping",
      diagnostics: [
        {
          code: "MAPPING_READ_ERROR",
          message: error instanceof Error ? error.message : "Unable to read mapping file.",
          severity: "error",
          source: { input: options.mapping }
        }
      ],
      artifacts: []
    };
    return writeExpectedFailure(result2, options.resultFormat, io);
  }
  const validation = parseAndValidateMapping(text);
  const result = {
    status: validation.status,
    command: "validate-mapping",
    diagnostics: validation.diagnostics.map((item) => ({
      ...item,
      source: { input: options.mapping, ...item.source }
    })),
    artifacts: []
  };
  if (validation.status === "success") {
    if (options.resultFormat === "json") {
      io.stdout.write(`${JSON.stringify({ schemaVersion: 1, ...result, mapping: validation.mapping })}
`);
    } else {
      io.stdout.write(`Mapping is valid: ${options.mapping}
`);
    }
    return 0;
  }
  return writeExpectedFailure(result, options.resultFormat, io);
}
async function outputExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
async function publishPreparedFiles(files, overwrite) {
  const backups = [];
  const published = [];
  const transactionId = `${Date.now()}-${process.pid}`;
  try {
    for (const [index, file] of files.entries()) {
      if (!await outputExists(file.targetPath)) continue;
      if (!overwrite) throw new Error(`Output already exists: ${file.targetPath}`);
      const backupPath = join2(
        dirname(file.targetPath),
        `.${basename(file.targetPath)}.${transactionId}-${index}.backup`
      );
      await rename(file.targetPath, backupPath);
      backups.push({ backupPath, targetPath: file.targetPath });
    }
    for (const file of files) {
      await rename(file.temporaryPath, file.targetPath);
      published.push(file.targetPath);
    }
  } catch (error) {
    for (const targetPath of [...published].reverse()) {
      await unlink(targetPath).catch(() => void 0);
    }
    for (const backup of [...backups].reverse()) {
      await rename(backup.backupPath, backup.targetPath).catch(() => void 0);
    }
    throw error;
  }
  for (const backup of backups) {
    await unlink(backup.backupPath).catch(() => void 0);
  }
}
function mappingFailure(diagnostics) {
  return {
    status: "failure",
    result: {
      status: "failure",
      command: "convert",
      diagnostics,
      artifacts: []
    }
  };
}
async function resolveConversionMapping(options, streaming) {
  if (options.mapping) {
    const mappingPath = options.mapping;
    let mappingText;
    try {
      mappingText = await readFile2(mappingPath, "utf8");
    } catch (error) {
      return mappingFailure([{
        code: "MAPPING_READ_ERROR",
        message: error instanceof Error ? error.message : "Unable to read mapping file.",
        severity: "error",
        source: { input: mappingPath }
      }]);
    }
    const validation = parseAndValidateMapping(mappingText);
    if (validation.status === "failure" || !validation.mapping) {
      return mappingFailure(validation.diagnostics.map((diagnostic2) => ({
        ...diagnostic2,
        source: { input: mappingPath, ...diagnostic2.source }
      })));
    }
    return {
      status: "success",
      mapping: validation.mapping,
      mappingMode: "explicit",
      mappingFileName: basename(mappingPath)
    };
  }
  if (streaming) {
    const generated2 = await generateAutoMapping(readJsonlRecordsFromFile(options.input));
    if (generated2.status === "failure" || !generated2.mapping) {
      return mappingFailure(generated2.diagnostics);
    }
    return {
      status: "success",
      mapping: generated2.mapping,
      mappingMode: "auto",
      mappingFileName: options.mappingOutput ? basename(options.mappingOutput) : "auto-generated"
    };
  }
  const readOptions = options.inputFormat === void 0 ? {} : { format: options.inputFormat };
  const bufferedInput = await readRecordsFromFileWithFormat(options.input, readOptions);
  const generated = await generateAutoMapping(bufferedInput.records);
  if (generated.status === "failure" || !generated.mapping) {
    return mappingFailure(generated.diagnostics);
  }
  return {
    status: "success",
    mapping: generated.mapping,
    mappingMode: "auto",
    mappingFileName: options.mappingOutput ? basename(options.mappingOutput) : "auto-generated",
    bufferedInput
  };
}
async function runConvert(options, io) {
  for (const outputPath of [options.output, options.mappingOutput].filter(
    (path) => path !== void 0
  )) {
    if (!options.overwrite && await outputExists(outputPath)) {
      return writeExpectedFailure({ status: "failure", command: "convert", diagnostics: [{ code: "OUTPUT_EXISTS", message: `Output already exists: ${outputPath}. Use --overwrite to replace it.`, severity: "error", source: { input: outputPath } }], artifacts: [] }, options.resultFormat, io);
    }
  }
  const temporaryPath = join2(dirname(options.output), `.${Date.now()}-${process.pid}.miku-json2xlsx.tmp`);
  const mappingTemporaryPath = options.mappingOutput ? join2(dirname(options.mappingOutput), `.${Date.now()}-${process.pid}.miku-json2xlsx-mapping.tmp`) : void 0;
  const streaming = options.inputFormat === "jsonl" || options.inputFormat === void 0 && options.input !== "-" && options.input.toLowerCase().endsWith(".jsonl");
  let conversionDetails = {};
  const sourceFileName = options.input === "-" ? "stdin" : basename(options.input);
  let mappingMode = options.mapping ? "explicit" : "auto";
  try {
    const resolved = await resolveConversionMapping(options, streaming);
    if (resolved.status === "failure") {
      return writeExpectedFailure(resolved.result, options.resultFormat, io);
    }
    const { mapping, mappingFileName } = resolved;
    mappingMode = resolved.mappingMode;
    if (streaming) {
      const records = options.input === "-" ? readJsonlRecordsFromStream(process.stdin) : readJsonlRecordsFromFile(options.input);
      const conversion = await convertJsonlStreamToXlsxFile(records, mapping, temporaryPath, {
        progressInterval: options.progressInterval,
        onProgress: (count) => io.stderr.write(`progress: ${count} records processed
`),
        workbookMetadata: {
          sourceFileName,
          sourceFormat: "JSONL",
          mappingFileName
        }
      });
      if (conversion.status === "failure") {
        await unlink(temporaryPath).catch(() => void 0);
        return writeExpectedFailure(conversion, options.resultFormat, io);
      }
      conversionDetails = {
        inputMode: conversion.inputMode,
        recordsProcessed: conversion.recordsProcessed,
        rowsWritten: conversion.rowsWritten,
        diagnostics: conversion.diagnostics
      };
    } else {
      const readOptions = options.inputFormat === void 0 ? {} : { format: options.inputFormat };
      const input = resolved.bufferedInput ?? (options.input === "-" ? await readRecordsFromStdinWithFormat(process.stdin, readOptions) : await readRecordsFromFileWithFormat(options.input, readOptions));
      const conversion = convertRecordsToXlsx(input.records, mapping, {
        workbookMetadata: {
          sourceFileName,
          sourceFormat: input.format === "jsonl" ? "JSONL" : "JSON",
          mappingFileName
        }
      });
      if (conversion.status === "failure" || !conversion.xlsx) {
        return writeExpectedFailure(conversion, options.resultFormat, io);
      }
      await writeFile(temporaryPath, conversion.xlsx);
      conversionDetails = { diagnostics: conversion.diagnostics };
    }
    const preparedFiles = [];
    if (options.mappingOutput && mappingTemporaryPath) {
      await writeFile(mappingTemporaryPath, `${JSON.stringify(mapping, null, 2)}
`, "utf8");
      preparedFiles.push({
        temporaryPath: mappingTemporaryPath,
        targetPath: options.mappingOutput
      });
    }
    preparedFiles.push({ temporaryPath, targetPath: options.output });
    await publishPreparedFiles(preparedFiles, options.overwrite);
  } catch (error) {
    await unlink(temporaryPath).catch(() => void 0);
    if (mappingTemporaryPath) await unlink(mappingTemporaryPath).catch(() => void 0);
    const diagnostic2 = error instanceof InputParseError ? { code: "INPUT_PARSE_ERROR", message: error.message, severity: "error", source: { input: error.sourceName, line: error.line } } : { code: streaming ? "STREAM_CONVERSION_ERROR" : "INPUT_READ_ERROR", message: error instanceof Error ? error.message : "Unable to complete conversion.", severity: "error", source: { input: options.input } };
    return writeExpectedFailure({ status: "failure", command: "convert", diagnostics: [diagnostic2], artifacts: [] }, options.resultFormat, io);
  }
  const result = {
    status: "success",
    command: "convert",
    diagnostics: conversionDetails.diagnostics,
    artifacts: [
      { kind: "xlsx", path: options.output },
      ...options.mappingOutput ? [{ kind: "mapping", path: options.mappingOutput }] : []
    ],
    mappingMode,
    ...streaming ? {
      inputMode: conversionDetails.inputMode,
      recordsProcessed: conversionDetails.recordsProcessed,
      rowsWritten: conversionDetails.rowsWritten
    } : {}
  };
  if (options.resultFormat === "json") io.stdout.write(`${JSON.stringify(result)}
`);
  else {
    writeDiagnosticsText(result.diagnostics, io);
    io.stdout.write(`Wrote XLSX: ${options.output}
`);
  }
  return 0;
}

// src/ts/cli-help.ts
var HELP_TEXT = `miku-json2xlsx - beta local-first JSON / JSONL to XLSX converter

Usage:
  miku-json2xlsx inspect --input <path|-> [options]
  miku-json2xlsx validate-mapping --mapping <path> [options]
  miku-json2xlsx convert --input <path|-> --output <path.xlsx> [--mapping <path>] [options]
  miku-json2xlsx --help
  miku-json2xlsx --version

Description:
  Inspects JSON / JSONL structure for paths, types, missing and null values,
  nesting, array element types, and bounded representative samples. The convert
  command writes a self-describing README cover, typed root records, and mapped
  child arrays to deterministic XLSX sheets while retaining tracking columns.
  This is beta software: preserve the source data and review generated workbooks.

Recommended agent workflow:
  1. Run inspect --result-format json and review inspection.scope.
  2. Run convert without --mapping for deterministic automatic mapping.
  3. To control columns explicitly, create and validate a mapping, then pass it
     to convert with --mapping.
  4. Check the exit code, status, diagnostics, artifacts, and stream statistics.
  Automatic mapping is deterministic and does not use AI.

Minimal mapping v1:
  {
    "schemaVersion": 1,
    "sheets": [{
      "name": "Records",
      "kind": "root",
      "sourcePath": "$",
      "recordIdColumn": "record_id",
      "sourceRecordColumn": "source_record",
      "columns": [
        { "name": "id", "sourcePath": "$.id", "type": "number" }
      ]
    }]
  }
  A child sheet additionally requires parentSheet, parentIdColumn,
  childOrderColumn, sourceRecordColumn, and a sourcePath ending in [].

Default behavior:
  Input and output must be explicit. Mapping defaults to automatic generation
  for file input; --mapping selects the explicit mode. Existing output is
  protected unless --overwrite is present. Result format defaults to text.
  No network access is performed.

Inputs:
  --input accepts a UTF-8 JSON / JSONL path or - for stdin.
  inspect and convert can explicitly select json or jsonl with --input-format.
  --mapping accepts a UTF-8 JSON mapping v1 file. When omitted, convert scans
  the input file and generates mapping v1 before conversion.
  --mapping-output optionally saves that generated mapping as deterministic JSON.
  JSONL input is processed incrementally when selected by .jsonl extension or
  --input-format jsonl. Progress is written only to stderr.

Outputs:
  --help writes this runtime contract to stdout.
  --version writes the product name and package version to stdout.
  --result-format json writes one machine-readable operation result to stdout.
  Text diagnostics and JSONL progress are written to stderr.
  convert writes one XLSX to --output. With automatic mapping,
  --mapping-output additionally writes the generated mapping JSON. Binary XLSX
  is never mixed into normal stdout.

Generated artifacts:
  Normal convert usage generates the XLSX named by --output. Its first sheet is
  an English README data dictionary, followed by the root and mapped child
  sheets. --mapping-output adds a reusable mapping artifact. Development builds
  also create ignored dist/ and bundle/ files.

Overwrite behavior:
  --overwrite explicitly permits replacing --output and --mapping-output.
  Conversion prepares requested artifacts in temporary files before publishing.

Machine-readable output contract:
  --result-format json writes one stable JSON object to stdout. Inspect results
  use schemaVersion 1. Expected failures use status=failure and structured
  diagnostics. Successful convert results list completed XLSX files in
  artifacts and report mappingMode=explicit or auto. Streamed JSONL results also
  report inputMode, recordsProcessed, and rowsWritten.

Diagnostics / warnings:
  Diagnostics contain code, message, severity, and optional source location.
  Safe conversions with warnings return status=success and exit code 0.
  Conversion errors return status=failure and do not publish a partial XLSX.
  Usage errors and unexpected runtime errors are written to stderr.

Scope boundaries:
  This CLI does not convert DOCX/PPTX, reverse XLSX to JSON, design arbitrary
  report layouts, or make AI mapping decisions. JSON arrays and single objects
  are buffered; bounded-memory conversion applies to JSONL. Automatic mapping
  requires a file and keeps arrays as JSON columns. Initial explicit child
  sheets must directly reference the root and use one trailing [] array marker.

Exit codes:
  0  success
  1  expected processing or semantic failure
  2  invalid CLI usage or malformed input without a safe operation result
  3  unexpected runtime error

Convert options:
  --input <path|->          JSON / JSONL file path, or - for stdin.
  --input-format <format>   json or jsonl; otherwise infer from path/content.
  --output <path.xlsx>      XLSX output path. - is not accepted.
  --mapping <path>          Explicit mapping v1 file; omit for automatic mapping.
  --mapping-output <path>   Save generated mapping JSON (automatic mode only).
  --progress-interval <n>   Report every n streamed records to stderr (default: 0).
  --overwrite               Permit replacement of an existing output.
  --result-format <format>  text (default) or json.

Inspect options:
  --input <path|->          JSON / JSONL file path, or - for stdin.
  --input-format <format>   json or jsonl; otherwise infer from path/content.
  --max-records <count>     Inspect at most this many records (default: 1000).
  --sample-values <count>   Keep at most this many samples per path (default: 3).
  --result-format <format>  text (default) or json.

Validate-mapping options:
  --mapping <path>          Explicit mapping v1 file path.
  --result-format <format>  text (default) or json.

Global metadata options:
  --help                    Show this help and exit.
  --version                 Show product name and package version and exit.

Examples:
  miku-json2xlsx inspect --input records.jsonl --result-format json
  miku-json2xlsx validate-mapping --mapping mapping.json --result-format json
  miku-json2xlsx convert --input records.json --output records.xlsx --mapping mapping.json --result-format json
  miku-json2xlsx convert --input records.jsonl --output records.xlsx --result-format json
  miku-json2xlsx convert --input records.jsonl --output records.xlsx --mapping-output generated-mapping.json --result-format json
  miku-json2xlsx convert --input - --input-format jsonl --output records.xlsx --mapping mapping.json --result-format json

References:
  https://github.com/igapyon/miku-json2xlsx
  https://github.com/igapyon/miku-json2xlsx/blob/devel/docs/cli-contract.md
  https://github.com/igapyon/miku-json2xlsx/blob/devel/docs/agent-json-contract.md
  https://github.com/igapyon/miku-json2xlsx/blob/devel/docs/conversion-diagnostics.md
  https://github.com/igapyon/miku-json2xlsx/blob/devel/docs/mapping-schema.md
  https://github.com/igapyon/miku-json2xlsx/blob/devel/docs/reproducibility.md
  https://github.com/igapyon/miku-json2xlsx/blob/devel/docs/streaming-jsonl.md
`;

// src/ts/cli-options.ts
import { resolve } from "node:path";
function parseIntegerOption(value, option, allowZero, maximum) {
  if (!/^\d+$/.test(value)) return `${option} must be an integer.`;
  const parsed = Number(value);
  const minimum = allowZero ? 0 : 1;
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    return `${option} must be ${allowZero ? "a non-negative" : "a positive"} safe integer no greater than ${maximum}.`;
  }
  return parsed;
}
function parseConvertOptions(args) {
  const values = {
    overwrite: false,
    progressInterval: 0,
    resultFormat: "text"
  };
  const seen = /* @__PURE__ */ new Set();
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (option === "--overwrite") {
      if (seen.has(option)) return `Option ${option} must not be repeated.`;
      seen.add(option);
      values.overwrite = true;
      continue;
    }
    if (!["--input", "--input-format", "--output", "--mapping", "--mapping-output", "--progress-interval", "--result-format"].includes(option)) {
      return `Unsupported convert option: ${option}`;
    }
    if (seen.has(option)) return `Option ${option} must not be repeated.`;
    const value = args[index + 1];
    if (value === void 0 || value.startsWith("--")) {
      return `Option ${option} requires a value.`;
    }
    seen.add(option);
    index += 1;
    if (option === "--input") values.input = value;
    if (option === "--input-format") {
      if (value !== "json" && value !== "jsonl") return "--input-format must be json or jsonl.";
      values.inputFormat = value;
    }
    if (option === "--output") values.output = value;
    if (option === "--mapping") values.mapping = value;
    if (option === "--mapping-output") values.mappingOutput = value;
    if (option === "--progress-interval") {
      const parsed = parseIntegerOption(value, option, true, 1e9);
      if (typeof parsed === "string") return parsed;
      values.progressInterval = parsed;
    }
    if (option === "--result-format") {
      if (value !== "text" && value !== "json") {
        return "--result-format must be text or json.";
      }
      values.resultFormat = value;
    }
  }
  for (const required of ["input", "output"]) {
    if (!values[required]) return `Missing required option: --${required}`;
  }
  if (!values.mapping && values.input === "-") {
    return "Automatic mapping requires --input to be a file path; stdin requires --mapping.";
  }
  if (values.mapping && values.mappingOutput) {
    return "--mapping-output is available only when --mapping is omitted.";
  }
  if (values.mappingOutput === "-") {
    return "--mapping-output must be a file path.";
  }
  if (values.mappingOutput && resolve(values.mappingOutput) === resolve(values.output)) {
    return "--mapping-output must differ from --output.";
  }
  if (values.output === "-") {
    return "--output must be a file path because XLSX is a binary artifact.";
  }
  return values;
}
function parseInspectOptions(args) {
  const values = {
    resultFormat: "text",
    maxRecords: 1e3,
    sampleValues: 3
  };
  const seen = /* @__PURE__ */ new Set();
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (!["--input", "--input-format", "--result-format", "--max-records", "--sample-values"].includes(option)) {
      return `Unsupported inspect option: ${option}`;
    }
    if (seen.has(option)) return `Option ${option} must not be repeated.`;
    const value = args[index + 1];
    if (value === void 0 || value.startsWith("--")) {
      return `Option ${option} requires a value.`;
    }
    seen.add(option);
    index += 1;
    if (option === "--input") values.input = value;
    if (option === "--input-format") {
      if (value !== "json" && value !== "jsonl") return "--input-format must be json or jsonl.";
      values.inputFormat = value;
    }
    if (option === "--result-format") {
      if (value !== "text" && value !== "json") return "--result-format must be text or json.";
      values.resultFormat = value;
    }
    if (option === "--max-records") {
      const parsed = parseIntegerOption(value, option, false, 1e6);
      if (typeof parsed === "string") return parsed;
      values.maxRecords = parsed;
    }
    if (option === "--sample-values") {
      const parsed = parseIntegerOption(value, option, true, 20);
      if (typeof parsed === "string") return parsed;
      values.sampleValues = parsed;
    }
  }
  if (!values.input) return "Missing required option: --input";
  return values;
}
function parseValidateMappingOptions(args) {
  const values = { resultFormat: "text" };
  const seen = /* @__PURE__ */ new Set();
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (!["--mapping", "--result-format"].includes(option)) {
      return `Unsupported validate-mapping option: ${option}`;
    }
    if (seen.has(option)) return `Option ${option} must not be repeated.`;
    const value = args[index + 1];
    if (value === void 0 || value.startsWith("--")) return `Option ${option} requires a value.`;
    seen.add(option);
    index += 1;
    if (option === "--mapping") values.mapping = value;
    if (option === "--result-format") {
      if (value !== "text" && value !== "json") return "--result-format must be text or json.";
      values.resultFormat = value;
    }
  }
  if (!values.mapping) return "Missing required option: --mapping";
  return values;
}

// src/ts/cli.ts
async function runCli(args, io = DEFAULT_IO) {
  if (args.length === 1 && args[0] === "--help") {
    io.stdout.write(HELP_TEXT);
    return 0;
  }
  if (args.length === 1 && args[0] === "--version") {
    io.stdout.write(`miku-json2xlsx ${package_default.version}
`);
    return 0;
  }
  if (args.includes("--help") || args.includes("--version")) {
    return writeUsageError("Use --help or --version without other arguments.", io);
  }
  if (args.length === 0) {
    return writeUsageError("No command was provided.", io);
  }
  if (args[0] === "convert") {
    const options = parseConvertOptions(args.slice(1));
    if (typeof options === "string") {
      return writeUsageError(options, io);
    }
    return runConvert(options, io);
  }
  if (args[0] === "inspect") {
    const options = parseInspectOptions(args.slice(1));
    if (typeof options === "string") {
      return writeUsageError(options, io);
    }
    return runInspect(options, io);
  }
  if (args[0] === "validate-mapping") {
    const options = parseValidateMappingOptions(args.slice(1));
    if (typeof options === "string") return writeUsageError(options, io);
    return runValidateMapping(options, io);
  }
  return writeUsageError(`Unsupported command or argument: ${args[0]}`, io);
}
async function runCliMain(args, io = DEFAULT_IO) {
  try {
    return await runCli(args, io);
  } catch (error) {
    io.stderr.write(`${error instanceof Error ? error.message : String(error)}
`);
    return 3;
  }
}

// src/ts/cli-entry.ts
process.exitCode = await runCliMain(process.argv.slice(2));
