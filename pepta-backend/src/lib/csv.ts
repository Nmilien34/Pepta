// Minimal RFC 4180 CSV writer for the log export. Fields containing commas,
// quotes, or line breaks are quoted; quotes double. CRLF line endings so the
// file opens cleanly in Excel/Numbers/Sheets.

function escapeField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv(header: string[], rows: string[][]): string {
  const lines = [header, ...rows].map((row) => row.map(escapeField).join(","));
  return `${lines.join("\r\n")}\r\n`;
}
