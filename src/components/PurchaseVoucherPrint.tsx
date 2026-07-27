import { format } from "date-fns";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PurchaseData {
  id: string;
  product_name: string;
  quantity: number;
  buying_price: number;
  total_cost: number;
  payment_mode: string;
  supplier_name: string;
  date: string;
  branch_name?: string;
  recorded_by_name?: string;
  remarks?: string;
}

interface VoucherData {
  id: string;
  voucher_number: string;
  purpose: string;
  category: string;
  amount: number;
  date: string;
  branch_name?: string;
  recorded_by_name?: string;
  notes?: string;
  payment_mode?: string;
  supplier_name?: string;
}

interface PurchaseVoucherPrintProps {
  type: "purchase" | "voucher";
  data: PurchaseData | VoucherData;
  items?: Array<{
    name: string;
    category?: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
  }>;
}

function generatePurchaseHTML(data: PurchaseData, items?: PurchaseVoucherPrintProps["items"]) {
  const p = data;
  const now = new Date();
  const pageTitle = `Purchase-${p.id.slice(0, 8).toUpperCase()}`;

  const itemsHtml = items && items.length > 0
    ? items.map((item, i) => `
      <tr${i % 2 === 1 ? ' class="alt"' : ''}>
        <td>${item.name}</td>
        <td>${item.category || '-'}</td>
        <td class="num">${item.quantity.toLocaleString()}</td>
        <td class="num">KSh ${item.unitCost.toLocaleString()}</td>
        <td class="num">KSh ${item.totalCost.toLocaleString()}</td>
      </tr>
    `).join("")
    : `
      <tr>
        <td>${p.product_name}</td>
        <td>-</td>
        <td class="num">${p.quantity.toLocaleString()}</td>
        <td class="num">KSh ${Number(p.buying_price).toLocaleString()}</td>
        <td class="num">KSh ${Number(p.total_cost).toLocaleString()}</td>
      </tr>
    `;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${pageTitle}</title>
  <style>
    @page { size: A4; margin: 15mm 18mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      font-size: 10pt;
      color: #1a1a1a;
      line-height: 1.5;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 16px;
      padding-bottom: 14px;
      border-bottom: 2px solid #1a1a1a;
      margin-bottom: 18px;
    }
    .header .logo-placeholder {
      width: 56px;
      height: 56px;
      border-radius: 8px;
      background: #1a1a1a;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 10px;
      text-align: center;
      line-height: 1.2;
      flex-shrink: 0;
    }
    .header .company {
      flex: 1;
    }
    .header .company h1 {
      font-size: 16pt;
      font-weight: 700;
      letter-spacing: 0.5px;
      color: #000;
    }
    .header .company .tagline {
      font-size: 8pt;
      font-style: italic;
      color: #555;
      margin-top: 2px;
    }
    .header .company .contact {
      font-size: 8pt;
      color: #555;
      margin-top: 2px;
    }
    .doc-title {
      text-align: center;
      font-size: 13pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 2px;
      padding: 8px 0 14px 0;
      border-bottom: 1px solid #ccc;
      margin-bottom: 16px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px 24px;
      margin-bottom: 18px;
      font-size: 9pt;
    }
    .info-grid .label { color: #666; }
    .info-grid .value { font-weight: 600; color: #000; }
    .info-row { display: flex; justify-content: space-between; padding: 2px 0; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      font-size: 9pt;
    }
    th {
      background: #1a1a1a;
      color: #fff;
      padding: 7px 8px;
      text-align: left;
      font-weight: 600;
      font-size: 8.5pt;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    th.num, td.num { text-align: right; }
    td {
      padding: 6px 8px;
      border-bottom: 1px solid #ddd;
    }
    tr.alt td { background: #f5f5f5; }
    .totals {
      margin-left: auto;
      width: 280px;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    .totals td {
      padding: 5px 10px;
      border: none;
      font-size: 9pt;
    }
    .totals .total-row td {
      font-weight: 700;
      font-size: 11pt;
      border-top: 2px solid #000;
      padding-top: 8px;
    }
    .approval {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-top: 30px;
      padding-top: 16px;
      border-top: 1px solid #ccc;
    }
    .approval .block {
      font-size: 9pt;
    }
    .approval .block .line {
      margin-top: 32px;
      border-top: 1px solid #000;
      padding-top: 4px;
      font-size: 8pt;
      color: #555;
    }
    .footer {
      margin-top: 30px;
      padding-top: 10px;
      border-top: 1px solid #ccc;
      font-size: 7.5pt;
      color: #888;
      text-align: center;
    }
    .footer .page-number:after { content: counter(page); }
    .remarks-box {
      margin-top: 12px;
      padding: 10px 12px;
      background: #f9f9f9;
      border-left: 3px solid #1a1a1a;
      font-size: 9pt;
    }
    .remarks-box .label { font-weight: 600; color: #555; display: block; margin-bottom: 2px; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo-placeholder">WA</div>
    <div class="company">
      <h1>Wonder Aqua Ltd</h1>
      <div class="contact">P.O. Box 455 – 00520, Ruai &nbsp;|&nbsp; Tel: 0715 670 632</div>
      <div class="tagline">"Activated Spirit In You"</div>
    </div>
  </div>

  <div class="doc-title">Purchase Order</div>

  <div class="info-grid">
    <div>
      <div class="info-row"><span class="label">Purchase No:</span><span class="value">${p.id.slice(0, 8).toUpperCase()}</span></div>
      <div class="info-row"><span class="label">Date:</span><span class="value">${format(new Date(p.date), "dd MMM yyyy")}</span></div>
      <div class="info-row"><span class="label">Time:</span><span class="value">${format(new Date(p.date), "HH:mm")}</span></div>
      <div class="info-row"><span class="label">Branch:</span><span class="value">${p.branch_name || "-"}</span></div>
    </div>
    <div>
      <div class="info-row"><span class="label">Supplier:</span><span class="value">${p.supplier_name}</span></div>
      <div class="info-row"><span class="label">Payment Method:</span><span class="value">${p.payment_mode}</span></div>
      <div class="info-row"><span class="label">Created By:</span><span class="value">${p.recorded_by_name || "-"}</span></div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th>Category</th>
        <th class="num">Quantity</th>
        <th class="num">Unit Cost</th>
        <th class="num">Total Cost</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml}
    </tbody>
  </table>

  <table class="totals">
    <tr><td style="text-align:right;">Subtotal:</td><td class="num">KSh ${Number(p.total_cost).toLocaleString()}</td></tr>
    <tr class="total-row"><td style="text-align:right;">Total Amount:</td><td class="num">KSh ${Number(p.total_cost).toLocaleString()}</td></tr>
    <tr><td style="text-align:right;">Payment Method:</td><td class="num">${p.payment_mode}</td></tr>
  </table>

  ${p.remarks ? `<div class="remarks-box"><span class="label">Remarks</span>${p.remarks}</div>` : ""}

  <div class="approval">
    <div class="block">
      <strong>Received By</strong>
      <div class="line">Signature &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Date</div>
    </div>
    <div class="block">
      <strong>Approved By</strong>
      <div class="line">Signature &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Date</div>
    </div>
  </div>

  <div class="footer">
    Generated by Wonder Aqua Inventory Management System &nbsp;|&nbsp;
    ${format(now, "dd MMM yyyy, HH:mm")} &nbsp;|&nbsp;
    Page <span class="page-number">1</span>
  </div>

  <script>window.print();</script>
</body>
</html>`;
}

function generateVoucherHTML(data: VoucherData) {
  const v = data;
  const now = new Date();

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Voucher-${v.voucher_number}</title>
  <style>
    @page { size: A4; margin: 15mm 18mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      font-size: 10pt;
      color: #1a1a1a;
      line-height: 1.5;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 16px;
      padding-bottom: 14px;
      border-bottom: 2px solid #1a1a1a;
      margin-bottom: 18px;
    }
    .header .logo-placeholder {
      width: 56px;
      height: 56px;
      border-radius: 8px;
      background: #1a1a1a;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 10px;
      text-align: center;
      line-height: 1.2;
      flex-shrink: 0;
    }
    .header .company {
      flex: 1;
    }
    .header .company h1 {
      font-size: 16pt;
      font-weight: 700;
      letter-spacing: 0.5px;
      color: #000;
    }
    .header .company .tagline {
      font-size: 8pt;
      font-style: italic;
      color: #555;
      margin-top: 2px;
    }
    .header .company .contact {
      font-size: 8pt;
      color: #555;
      margin-top: 2px;
    }
    .doc-title {
      text-align: center;
      font-size: 13pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 2px;
      padding: 8px 0 14px 0;
      border-bottom: 1px solid #ccc;
      margin-bottom: 16px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px 24px;
      margin-bottom: 24px;
      font-size: 9pt;
    }
    .info-row { display: flex; justify-content: space-between; padding: 3px 0; }
    .info-row .label { color: #666; }
    .info-row .value { font-weight: 600; color: #000; }
    .amount-box {
      text-align: center;
      padding: 20px;
      margin-bottom: 20px;
      border: 2px solid #1a1a1a;
      border-radius: 4px;
    }
    .amount-box .label { font-size: 9pt; color: #666; text-transform: uppercase; letter-spacing: 1px; }
    .amount-box .amount { font-size: 22pt; font-weight: 700; color: #000; margin-top: 4px; }
    .details {
      margin-bottom: 20px;
    }
    .details table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    .details td { padding: 6px 8px; border-bottom: 1px solid #ddd; }
    .details td:first-child { font-weight: 600; color: #555; width: 140px; }
    .approval {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-top: 30px;
      padding-top: 16px;
      border-top: 1px solid #ccc;
    }
    .approval .block { font-size: 9pt; }
    .approval .block .line {
      margin-top: 32px;
      border-top: 1px solid #000;
      padding-top: 4px;
      font-size: 8pt;
      color: #555;
    }
    .footer {
      margin-top: 30px;
      padding-top: 10px;
      border-top: 1px solid #ccc;
      font-size: 7.5pt;
      color: #888;
      text-align: center;
    }
    .remarks-box {
      margin-top: 12px;
      padding: 10px 12px;
      background: #f9f9f9;
      border-left: 3px solid #1a1a1a;
      font-size: 9pt;
    }
    .remarks-box .label { font-weight: 600; color: #555; display: block; margin-bottom: 2px; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo-placeholder">WA</div>
    <div class="company">
      <h1>Wonder Aqua Ltd</h1>
      <div class="contact">P.O. Box 455 – 00520, Ruai &nbsp;|&nbsp; Tel: 0715 670 632</div>
      <div class="tagline">"Activated Spirit In You"</div>
    </div>
  </div>

  <div class="doc-title">Payment Voucher</div>

  <div class="info-grid">
    <div>
      <div class="info-row"><span class="label">Voucher No:</span><span class="value">${v.voucher_number}</span></div>
      <div class="info-row"><span class="label">Date:</span><span class="value">${format(new Date(v.date), "dd MMM yyyy")}</span></div>
      <div class="info-row"><span class="label">Branch:</span><span class="value">${v.branch_name || "-"}</span></div>
    </div>
    <div>
      <div class="info-row"><span class="label">Supplier:</span><span class="value">${v.supplier_name || "-"}</span></div>
      <div class="info-row"><span class="label">Payment Method:</span><span class="value">${v.payment_mode || "-"}</span></div>
      <div class="info-row"><span class="label">Created By:</span><span class="value">${v.recorded_by_name || "-"}</span></div>
    </div>
  </div>

  <div class="amount-box">
    <div class="label">Amount Paid</div>
    <div class="amount">KSh ${Number(v.amount).toLocaleString()}</div>
  </div>

  <div class="details">
    <table>
      <tr><td>Purpose</td><td>${v.purpose}</td></tr>
      <tr><td>Category</td><td>${v.category.charAt(0).toUpperCase() + v.category.slice(1)}</td></tr>
    </table>
  </div>

  ${v.notes ? `<div class="remarks-box"><span class="label">Remarks</span>${v.notes}</div>` : ""}

  <div class="approval">
    <div class="block">
      <strong>Received By</strong>
      <div class="line">Signature &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Date</div>
    </div>
    <div class="block">
      <strong>Authorized By</strong>
      <div class="line">Signature &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Date</div>
    </div>
  </div>

  <div class="footer">
    Generated by Wonder Aqua Inventory Management System &nbsp;|&nbsp;
    ${format(now, "dd MMM yyyy, HH:mm")} &nbsp;|&nbsp;
    Page 1
  </div>

  <script>window.print();</script>
</body>
</html>`;
}

export default function PurchaseVoucherPrint({ type, data, items }: PurchaseVoucherPrintProps) {
  const handlePrint = () => {
    const html = type === "purchase"
      ? generatePurchaseHTML(data as PurchaseData, items)
      : generateVoucherHTML(data as VoucherData);

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      onClick={handlePrint}
      title={type === "purchase" ? "Print Purchase" : "Print Voucher"}
    >
      <Printer className="h-3.5 w-3.5" />
    </Button>
  );
}

// Export the HTML generators for direct use if needed
export { generatePurchaseHTML, generateVoucherHTML };
