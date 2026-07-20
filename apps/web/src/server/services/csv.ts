import { createHash } from "node:crypto";

export function csvCell(value: string | number | boolean | null | undefined) {
  const rawText = String(value ?? "");
  const text =
    typeof value === "string" && /^[\t\r\n ]*[=+\-@]/.test(rawText)
      ? `'${rawText}`
      : rawText;
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }
  return text;
}

export type CsvRow = Array<string | number | boolean | null | undefined>;

export function csvRows(rows: CsvRow[]) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

export type CsvExportOptions = {
  generatedAt?: Date;
  metadata?: CsvRow[];
  checksumHeader?: boolean;
};

export function csvRowsWithMetadata(
  rows: CsvRow[],
  filename: string,
  options: CsvExportOptions = {}
) {
  const generatedAt = options.generatedAt ?? new Date();
  return [
    ["Export File", filename],
    ["Generated At UTC", generatedAt.toISOString()],
    ...(options.metadata ?? []),
    [],
    ...rows
  ];
}

export function csvExportBody(
  rows: CsvRow[],
  filename: string,
  options: CsvExportOptions = {}
) {
  return csvRows(csvRowsWithMetadata(rows, filename, options));
}

export function csvSha256(body: string) {
  return createHash("sha256").update(body).digest("hex");
}

export function csvExportResponse(
  rows: CsvRow[],
  filename: string,
  options: CsvExportOptions = {}
) {
  const body = csvExportBody(rows, filename, options);
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "Content-Disposition": `attachment; filename=${filename}`,
    "Content-Type": "text/csv; charset=utf-8",
    "X-Content-Type-Options": "nosniff"
  };

  if (options.checksumHeader) {
    headers["X-OGFI-CSV-SHA256"] = csvSha256(body);
  }

  return new Response(body, {
    headers: {
      ...headers
    }
  });
}
