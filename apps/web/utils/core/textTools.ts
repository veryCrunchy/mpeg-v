import type { DocumentFile } from "./documents.ts";
import type { TextMode } from "./tools.ts";
import { outputName } from "./filenames.ts";

export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    closed = false;
  const cell = () => {
    row.push(field);
    field = "";
    closed = false;
    if (row.length > 1000) throw new Error("Use no more than 1,000 columns.");
  };
  const line = () => {
    cell();
    rows.push(row);
    row = [];
    if (rows.length > 100_000)
      throw new Error("Use no more than 100,000 rows.");
  };
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += ch;
    } else if (ch === delimiter) cell();
    else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      line();
    } else if (closed) throw new Error("Unexpected text after a quoted field.");
    else if (ch === '"') {
      if (field) throw new Error("Quotes must surround the whole field.");
      quoted = true;
    } else field += ch;
  }
  if (quoted) throw new Error("A quoted field is missing its closing quote.");
  if (field || row.length || closed || (text && !/[\r\n]$/.test(text))) line();
  return rows;
}

export function toDelimited(
  value: unknown,
  delimiter: string,
  spreadsheetSafe: boolean,
) {
  if (!Array.isArray(value) || value.length > 100_000)
    throw new Error("Use a JSON array of rows or objects, up to 100,000 rows.");
  let rows: unknown[][];
  if (value.every(Array.isArray)) rows = value;
  else if (
    value.every(
      (item) => item && typeof item === "object" && !Array.isArray(item),
    )
  ) {
    const keys = [...new Set(value.flatMap(Object.keys))];
    if (keys.length > 1000) throw new Error("Use no more than 1,000 columns.");
    rows = [
      keys,
      ...value.map((item) =>
        keys.map((key) => (Object.hasOwn(item, key) ? item[key] : "")),
      ),
    ];
  } else
    throw new Error(
      "Use only arrays of cells, or only objects with named columns.",
    );
  return rows
    .map((row) => {
      if (row.length > 1000) throw new Error("Use no more than 1,000 columns.");
      return row
        .map((cell) => {
          if (cell !== null && typeof cell === "object")
            throw new Error(
              "Nested objects and arrays cannot be written as table cells.",
            );
          let text = cell == null ? "" : String(cell);
          if (spreadsheetSafe && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
          return /["\r\n]/.test(text) || text.includes(delimiter)
            ? `"${text.replace(/"/g, '""')}"`
            : text;
        })
        .join(delimiter);
    })
    .join("\r\n");
}

export function processText(
  file: DocumentFile,
  mode: TextMode,
  spreadsheetSafe = true,
): DocumentFile {
  if (file.bytes.length > 10 * 1024 * 1024)
    throw new Error("Choose a file up to 10 MiB for text tools.");
  if (mode === "base64-encode") {
    let binary = "";
    for (let offset = 0; offset < file.bytes.length; offset += 32768)
      binary += String.fromCharCode(
        ...file.bytes.subarray(offset, offset + 32768),
      );
    return {
      name: `${file.name}.base64.txt`,
      bytes: new TextEncoder().encode(btoa(binary)),
      type: "text/plain",
    };
  }
  let input: string;
  try {
    input = new TextDecoder("utf-8", { fatal: true }).decode(file.bytes);
  } catch {
    throw new Error(
      "Choose a UTF-8 text file. Base64 encoding also accepts binary files.",
    );
  }
  if (mode === "base64-decode") {
    const text = input.replace(/\s/g, "");
    if (
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        text,
      )
    )
      throw new Error("Use standard padded Base64 without a data URL prefix.");
    const binary = atob(text);
    return {
      name: outputName(file.name, "decoded.bin"),
      bytes: Uint8Array.from(binary, (char) => char.charCodeAt(0)),
      type: "application/octet-stream",
    };
  }
  let output: string,
    extension = "txt",
    type = "text/plain";
  if (mode.startsWith("json-")) {
    let value: unknown;
    try {
      value = JSON.parse(input, (_key, item) => {
        if (
          typeof item === "number" &&
          (!Number.isFinite(item) ||
            (Number.isInteger(item) && !Number.isSafeInteger(item)))
        )
          throw new Error("precision");
        return item;
      });
    } catch (error) {
      throw new Error(
        error instanceof Error && error.message === "precision"
          ? "This JSON contains numbers outside the safe numeric range. Store large identifiers as strings."
          : "This file is not valid JSON.",
      );
    }
    if (mode === "json-csv" || mode === "json-tsv") {
      extension = mode === "json-csv" ? "csv" : "tsv";
      type = mode === "json-csv" ? "text/csv" : "text/tab-separated-values";
      output = toDelimited(
        value,
        mode === "json-csv" ? "," : "\t",
        spreadsheetSafe,
      );
    } else {
      output = JSON.stringify(
        value,
        null,
        mode === "json-format" ? 2 : undefined,
      );
      extension = "json";
      type = "application/json";
    }
  } else if (mode === "csv-json" || mode === "tsv-json") {
    output = JSON.stringify(
      parseDelimited(input, mode === "csv-json" ? "," : "\t"),
      null,
      2,
    );
    extension = "json";
    type = "application/json";
  } else {
    const normalized = input.replace(/\r\n?/g, "\n"),
      trailing = normalized.endsWith("\n");
    const lines = normalized.split("\n");
    if (trailing) lines.pop();
    if (mode === "lines-sort")
      output = lines.sort().join("\n") + (trailing ? "\n" : "");
    else if (mode === "lines-unique")
      output = [...new Set(lines)].join("\n") + (trailing ? "\n" : "");
    else if (mode === "lines-crlf") output = normalized.replace(/\n/g, "\r\n");
    else if (mode === "lines-lf") output = normalized;
    else throw new Error("Choose a supported text operation.");
  }
  return {
    name: outputName(file.name, extension),
    bytes: new TextEncoder().encode(output),
    type,
  };
}
