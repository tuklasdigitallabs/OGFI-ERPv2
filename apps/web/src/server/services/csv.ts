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

export function csvExportResponse(
  rows: CsvRow[],
  filename: string,
  options: CsvExportOptions = {}
) {
  return new Response(csvRows(csvRowsWithMetadata(rows, filename, options)), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename=${filename}`,
      "Content-Type": "text/csv; charset=utf-8",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
