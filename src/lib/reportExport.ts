import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import logo from "@/assets/logo.jpg";

export interface ReportColumn {
  header: string;
  key: string;
  align?: "left" | "right" | "center";
  /** Format as KSh currency in both PDF and Excel */
  currency?: boolean;
  /** Include this column in the totals row */
  total?: boolean;
}

export interface ReportDefinition {
  title: string;
  /** e.g. "01 Jan 2026 — 31 Jan 2026" */
  period: string;
  branchName?: string;
  generatedBy?: string;
  columns: ReportColumn[];
  rows: Record<string, string | number>[];
  /** Extra summary lines shown under the table */
  summary?: { label: string; value: string }[];
}

const BRAND = {
  navy: [12, 42, 74] as [number, number, number],
  blue: [14, 116, 197] as [number, number, number],
  light: [235, 244, 252] as [number, number, number],
  grey: [120, 130, 145] as [number, number, number],
};

const money = (v: unknown) =>
  `KSh ${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

let logoCache: string | null = null;
async function getLogoDataUrl(): Promise<string | null> {
  if (logoCache) return logoCache;
  try {
    const res = await fetch(logo);
    const blob = await res.blob();
    logoCache = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return logoCache;
  } catch {
    return null;
  }
}

function computeTotals(def: ReportDefinition) {
  const totals: Record<string, number> = {};
  def.columns.forEach(c => {
    if (c.total) totals[c.key] = def.rows.reduce((s, r) => s + Number(r[c.key] || 0), 0);
  });
  return totals;
}

export function reportFileName(def: ReportDefinition, ext: string) {
  const slug = def.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `wonder-aqua-${slug}-${format(new Date(), "yyyyMMdd-HHmm")}.${ext}`;
}

export async function exportReportPdf(def: ReportDefinition) {
  const doc = new jsPDF({ orientation: def.columns.length > 6 ? "landscape" : "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const logoData = await getLogoDataUrl();

  // Header band
  doc.setFillColor(...BRAND.navy);
  doc.rect(0, 0, pageWidth, 78, "F");
  if (logoData) {
    try {
      doc.addImage(logoData, "JPEG", 36, 16, 46, 46, undefined, "FAST");
    } catch { /* logo optional */ }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("WONDER AQUA LTD", logoData ? 94 : 36, 34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Refreshing. Trusted. Wonder.", logoData ? 94 : 36, 48);
  doc.text("P.O BOX 455-00520 RUAI  ·  Tel: 0715670632", logoData ? 94 : 36, 61);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(def.title.toUpperCase(), pageWidth - 36, 34, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Period: ${def.period}`, pageWidth - 36, 48, { align: "right" });
  doc.text(
    `${def.branchName ? `Branch: ${def.branchName}  ·  ` : ""}Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}`,
    pageWidth - 36,
    61,
    { align: "right" }
  );

  const totals = computeTotals(def);
  const hasTotals = Object.keys(totals).length > 0;

  const body = def.rows.map(r =>
    def.columns.map(c => (c.currency ? money(r[c.key]) : String(r[c.key] ?? "")))
  );
  if (hasTotals) {
    body.push(
      def.columns.map((c, i) => {
        if (c.key in totals) return c.currency ? money(totals[c.key]) : totals[c.key].toLocaleString();
        return i === 0 ? "TOTAL" : "";
      })
    );
  }

  autoTable(doc, {
    startY: 96,
    head: [def.columns.map(c => c.header)],
    body,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5, lineColor: [225, 232, 240], textColor: [35, 45, 60] },
    headStyles: { fillColor: BRAND.blue, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.5 },
    alternateRowStyles: { fillColor: BRAND.light },
    columnStyles: Object.fromEntries(
      def.columns.map((c, i) => [i, { halign: c.align || (c.currency ? "right" : "left") }])
    ) as Record<number, { halign: "left" | "right" | "center" }>,
    didParseCell: data => {
      if (hasTotals && data.section === "body" && data.row.index === body.length - 1) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [222, 235, 248];
      }
    },
    margin: { left: 36, right: 36, bottom: 54 },
  });

  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;
  if (def.summary?.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND.navy);
    doc.text("Summary", 36, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    def.summary.forEach(s => {
      y += 14;
      if (y > doc.internal.pageSize.getHeight() - 60) {
        doc.addPage();
        y = 60;
      }
      doc.setTextColor(...BRAND.grey);
      doc.text(s.label, 36, y);
      doc.setTextColor(20, 30, 45);
      doc.text(s.value, 300, y);
    });
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    const h = doc.internal.pageSize.getHeight();
    doc.setDrawColor(225, 232, 240);
    doc.line(36, h - 40, pageWidth - 36, h - 40);
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.grey);
    doc.text(
      `Wonder Aqua Ltd · Refreshing. Trusted. Wonder.${def.generatedBy ? ` · Prepared by ${def.generatedBy}` : ""}`,
      36,
      h - 26
    );
    doc.text(`Page ${p} of ${pages}`, pageWidth - 36, h - 26, { align: "right" });
  }

  doc.save(reportFileName(def, "pdf"));
}

export function exportReportExcel(def: ReportDefinition) {
  const totals = computeTotals(def);
  const hasTotals = Object.keys(totals).length > 0;

  const aoa: (string | number)[][] = [
    ["WONDER AQUA LTD"],
    ["Refreshing. Trusted. Wonder."],
    [def.title],
    [`Period: ${def.period}`],
    [
      `${def.branchName ? `Branch: ${def.branchName} · ` : ""}Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}${
        def.generatedBy ? ` · Prepared by ${def.generatedBy}` : ""
      }`,
    ],
    [],
    def.columns.map(c => c.header),
  ];

  def.rows.forEach(r => aoa.push(def.columns.map(c => (typeof r[c.key] === "number" ? (r[c.key] as number) : String(r[c.key] ?? "")))));

  if (hasTotals) {
    aoa.push(def.columns.map((c, i) => (c.key in totals ? totals[c.key] : i === 0 ? "TOTAL" : "")));
  }

  if (def.summary?.length) {
    aoa.push([]);
    aoa.push(["Summary"]);
    def.summary.forEach(s => aoa.push([s.label, s.value]));
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = def.columns.map(c => ({ wch: Math.max(14, c.header.length + 4) }));
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(1, def.columns.length - 1) } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: Math.max(1, def.columns.length - 1) } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: Math.max(1, def.columns.length - 1) } },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, def.title.slice(0, 28) || "Report");
  XLSX.writeFile(wb, reportFileName(def, "xlsx"));
}
