import { NextRequest, NextResponse } from "next/server";

function toCSV(rows: Record<string, string>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((h) => `"${(row[h] ?? "").replace(/"/g, '""')}"`).join(",")
    ),
  ];
  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { data, filename } = body;

  const csv = toCSV(data);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename ?? "export"}.csv"`,
    },
  });
}
