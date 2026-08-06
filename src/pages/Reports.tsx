import { useState } from "react";
import { useData } from "@/context/DataContext";
import { useAuth } from "@/context/AuthContext";
import { filterPaidSales } from "@/lib/paymentStatus";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  isToday, startOfMonth, isAfter, format, startOfDay, endOfDay, subDays, isWithinInterval,
} from "date-fns";
import { exportReportPdf, exportReportExcel, type ReportDefinition } from "@/lib/reportExport";

type ReportKey =
  | "sales" | "inventory" | "stock-movement" | "purchases"
  | "expenses" | "customers" | "payments" | "staff" | "transfers";

const REPORTS: { key: ReportKey; label: string }[] = [
  { key: "sales", label: "Sales Report" },
  { key: "inventory", label: "Inventory Report" },
  { key: "stock-movement", label: "Stock Movement Report" },
  { key: "purchases", label: "Purchases Report" },
  { key: "expenses", label: "Expenses & Assets Report" },
  { key: "customers", label: "Customer & Credit Report" },
  { key: "payments", label: "Payment Transactions Report" },
  { key: "staff", label: "Staff Report" },
  { key: "transfers", label: "Stock Transfer Report" },
];

export default function Reports() {
  const { sales: allSales, purchases, products, customers, inventoryLogs, branches, effectiveBranchId } = useData();
  const { profile } = useAuth();

  const [reportKey, setReportKey] = useState<ReportKey>("sales");
  const [range, setRange] = useState("this-month");
  const [customFrom, setCustomFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [busy, setBusy] = useState<"pdf" | "excel" | null>(null);

  // PENDING sales are not completed transactions — exclude them from every
  // aggregate on this page (revenue, profit, counts, payment totals).
  const sales = filterPaidSales(allSales as any) as typeof allSales;

  const today = new Date();
  const monthStart = startOfMonth(today);

  const todaySales = sales.filter(s => isToday(new Date(s.date)));
  const monthSales = sales.filter(s => isAfter(new Date(s.date), monthStart));
  const allProfit = sales.reduce((sum, s) => sum + s.profit, 0);

  const todayRevenue = todaySales.reduce((sum, s) => sum + s.final_amount, 0);
  const todayProfit = todaySales.reduce((sum, s) => sum + s.profit, 0);
  const monthRevenue = monthSales.reduce((sum, s) => sum + s.final_amount, 0);
  const monthProfit = monthSales.reduce((sum, s) => sum + s.profit, 0);

  const paymentTotals = { Cash: 0, Mpesa: 0, Credit: 0 };
  sales.forEach(s => { paymentTotals[s.payment_mode] += s.final_amount; });
  purchases.forEach(p => { paymentTotals[p.payment_mode] += p.total_cost; });

  const getInterval = () => {
    const now = new Date();
    switch (range) {
      case "today": return { start: startOfDay(now), end: endOfDay(now) };
      case "last-7": return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
      case "last-30": return { start: startOfDay(subDays(now, 29)), end: endOfDay(now) };
      case "this-month": return { start: startOfMonth(now), end: endOfDay(now) };
      case "custom": return { start: startOfDay(new Date(customFrom)), end: endOfDay(new Date(customTo)) };
      default: return { start: new Date(0), end: endOfDay(now) };
    }
  };

  const inRange = (d: string | null | undefined, iv: { start: Date; end: Date }) => {
    if (!d) return false;
    const dt = new Date(d);
    return !isNaN(dt.getTime()) && isWithinInterval(dt, iv);
  };

  const buildDefinition = async (): Promise<ReportDefinition> => {
    const iv = getInterval();
    const period = range === "all"
      ? "All time"
      : `${format(iv.start, "dd MMM yyyy")} — ${format(iv.end, "dd MMM yyyy")}`;
    const base = {
      period,
      branchName: branches.find(b => b.id === effectiveBranchId)?.name || "All branches",
      generatedBy: profile?.full_name || undefined,
    };

    switch (reportKey) {
      case "sales": {
        const rows = sales
          .filter(s => range === "all" || inRange(s.date, iv))
          .sort((a, b) => +new Date(b.date) - +new Date(a.date))
          .map(s => ({
            date: format(new Date(s.date), "dd/MM/yyyy HH:mm"),
            customer: s.customer_name || "Walk-in",
            product: s.product_name,
            qty: s.quantity,
            price: s.selling_price,
            discount: s.discount_amount,
            amount: s.final_amount,
            profit: s.profit,
            mode: s.payment_mode,
          }));
        return {
          ...base,
          title: "Sales Report",
          columns: [
            { header: "Date", key: "date" },
            { header: "Customer", key: "customer" },
            { header: "Product", key: "product" },
            { header: "Qty", key: "qty", align: "right", total: true },
            { header: "Unit Price", key: "price", currency: true },
            { header: "Discount", key: "discount", currency: true, total: true },
            { header: "Amount", key: "amount", currency: true, total: true },
            { header: "Profit", key: "profit", currency: true, total: true },
            { header: "Mode", key: "mode" },
          ],
          rows,
          summary: [
            { label: "Transactions", value: String(rows.length) },
            { label: "Total Revenue", value: `KSh ${rows.reduce((s, r) => s + r.amount, 0).toLocaleString()}` },
            { label: "Total Profit", value: `KSh ${rows.reduce((s, r) => s + r.profit, 0).toLocaleString()}` },
          ],
        };
      }
      case "inventory": {
        const rows = products.map(p => ({
          product: p.name,
          size: p.bottle_size,
          qty: p.quantity,
          buying: p.buying_price,
          selling: p.selling_price,
          value: p.quantity * p.buying_price,
          status: p.quantity <= p.low_stock_threshold ? "LOW STOCK" : "OK",
        }));
        return {
          ...base,
          title: "Inventory Report",
          period: `As at ${format(new Date(), "dd MMM yyyy HH:mm")}`,
          columns: [
            { header: "Product", key: "product" },
            { header: "Size", key: "size" },
            { header: "Qty In Stock", key: "qty", align: "right", total: true },
            { header: "Buying Price", key: "buying", currency: true },
            { header: "Selling Price", key: "selling", currency: true },
            { header: "Stock Value", key: "value", currency: true, total: true },
            { header: "Status", key: "status" },
          ],
          rows,
          summary: [
            { label: "Products", value: String(rows.length) },
            { label: "Low stock items", value: String(rows.filter(r => r.status === "LOW STOCK").length) },
            { label: "Total stock value", value: `KSh ${rows.reduce((s, r) => s + r.value, 0).toLocaleString()}` },
          ],
        };
      }
      case "stock-movement": {
        const rows = inventoryLogs
          .filter(l => range === "all" || inRange(l.date, iv))
          .sort((a, b) => +new Date(b.date) - +new Date(a.date))
          .map(l => ({
            date: format(new Date(l.date), "dd/MM/yyyy HH:mm"),
            product: l.product_name,
            type: l.type,
            qty: l.quantity,
            reference: l.reference || "—",
          }));
        return {
          ...base,
          title: "Stock Movement Report",
          columns: [
            { header: "Date", key: "date" },
            { header: "Product", key: "product" },
            { header: "Type", key: "type" },
            { header: "Quantity", key: "qty", align: "right", total: true },
            { header: "Reference", key: "reference" },
          ],
          rows,
          summary: [{ label: "Movements", value: String(rows.length) }],
        };
      }
      case "purchases": {
        const rows = purchases
          .filter(p => range === "all" || inRange((p as any).date || p.created_at, iv))
          .map(p => ({
            date: format(new Date((p as any).date || p.created_at), "dd/MM/yyyy"),
            product: (p as any).product_name || "—",
            supplier: (p as any).supplier_name || "—",
            qty: (p as any).quantity ?? 0,
            cost: p.total_cost,
            mode: p.payment_mode,
          }));
        return {
          ...base,
          title: "Purchases Report",
          columns: [
            { header: "Date", key: "date" },
            { header: "Product", key: "product" },
            { header: "Supplier", key: "supplier" },
            { header: "Qty", key: "qty", align: "right", total: true },
            { header: "Total Cost", key: "cost", currency: true, total: true },
            { header: "Mode", key: "mode" },
          ],
          rows,
          summary: [
            { label: "Purchases", value: String(rows.length) },
            { label: "Total spend", value: `KSh ${rows.reduce((s, r) => s + r.cost, 0).toLocaleString()}` },
          ],
        };
      }
      case "expenses": {
        let q = supabase.from("assets").select("*").order("acquired_date", { ascending: false });
        if (effectiveBranchId) q = q.eq("branch_id", effectiveBranchId);
        const { data, error } = await q;
        if (error) throw error;
        const rows = (data || [])
          .filter(a => range === "all" || inRange(a.acquired_date || a.created_at, iv))
          .map(a => ({
            date: a.acquired_date ? format(new Date(a.acquired_date), "dd/MM/yyyy") : "—",
            name: a.name,
            category: a.category,
            description: a.description || "—",
            status: a.status,
            value: Number(a.value || 0),
          }));
        return {
          ...base,
          title: "Expenses & Assets Report",
          columns: [
            { header: "Date", key: "date" },
            { header: "Item", key: "name" },
            { header: "Category", key: "category" },
            { header: "Description", key: "description" },
            { header: "Status", key: "status" },
            { header: "Value", key: "value", currency: true, total: true },
          ],
          rows,
          summary: [{ label: "Total value", value: `KSh ${rows.reduce((s, r) => s + r.value, 0).toLocaleString()}` }],
        };
      }
      case "customers": {
        const rows = customers.map(c => ({
          name: c.name,
          phone: c.phone || "—",
          type: (c as any).customer_type || "—",
          credit: Number(c.credit_balance || 0),
          points: Number(c.loyalty_points || 0),
        }));
        return {
          ...base,
          title: "Customer & Credit Report",
          period: `As at ${format(new Date(), "dd MMM yyyy HH:mm")}`,
          columns: [
            { header: "Customer", key: "name" },
            { header: "Phone", key: "phone" },
            { header: "Type", key: "type" },
            { header: "Outstanding Credit", key: "credit", currency: true, total: true },
            { header: "Loyalty Points", key: "points", align: "right", total: true },
          ],
          rows,
          summary: [
            { label: "Customers", value: String(rows.length) },
            { label: "Customers owing", value: String(rows.filter(r => r.credit > 0).length) },
          ],
        };
      }
      case "payments": {
        let q = supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(2000);
        if (effectiveBranchId) q = q.eq("branch_id", effectiveBranchId);
        const { data, error } = await q;
        if (error) throw error;
        const rows = (data || [])
          .filter(p => range === "all" || inRange(p.created_at, iv))
          .map(p => ({
            date: format(new Date(p.created_at), "dd/MM/yyyy HH:mm"),
            reference: p.message_reference,
            phone: p.phone_number,
            method: p.payment_method || p.provider,
            receipt: p.mpesa_receipt || "—",
            status: p.status,
            amount: Number(p.amount || 0),
          }));
        return {
          ...base,
          title: "Payment Transactions Report",
          columns: [
            { header: "Date", key: "date" },
            { header: "Reference", key: "reference" },
            { header: "Phone", key: "phone" },
            { header: "Method", key: "method" },
            { header: "Receipt", key: "receipt" },
            { header: "Status", key: "status" },
            { header: "Amount", key: "amount", currency: true, total: true },
          ],
          rows,
          summary: [
            { label: "Transactions", value: String(rows.length) },
            { label: "Successful", value: String(rows.filter(r => r.status === "SUCCESS").length) },
          ],
        };
      }
      case "staff": {
        const [{ data: profiles, error: pErr }, { data: userRoles, error: rErr }] = await Promise.all([
          supabase.from("profiles").select("*").order("full_name"),
          supabase.from("user_roles").select("user_id, role"),
        ]);
        if (pErr) throw pErr;
        if (rErr) throw rErr;
        const superadminIds = new Set(
          (userRoles || []).filter(r => r.role === "superadmin").map(r => r.user_id)
        );
        const rows = (profiles || [])
          .filter(p => !superadminIds.has(p.user_id))
          .map(p => ({
            name: p.full_name,
            phone: p.phone || "—",
            role: (userRoles || []).filter(r => r.user_id === p.user_id).map(r => r.role).join(", ") || "—",
            status: p.status,
            joined: format(new Date(p.created_at), "dd/MM/yyyy"),
          }));
        return {
          ...base,
          title: "Staff Report",
          period: `As at ${format(new Date(), "dd MMM yyyy HH:mm")}`,
          columns: [
            { header: "Name", key: "name" },
            { header: "Phone", key: "phone" },
            { header: "Role(s)", key: "role" },
            { header: "Status", key: "status" },
            { header: "Joined", key: "joined" },
          ],
          rows,
          summary: [{ label: "Staff members", value: String(rows.length) }],
        };
      }
      case "transfers": {
        const { data, error } = await supabase
          .from("stock_transfers").select("*").order("transfer_date", { ascending: false }).limit(2000);
        if (error) throw error;
        const branchName = (id: string) => branches.find(b => b.id === id)?.name || id.slice(0, 8);
        const rows = (data || [])
          .filter(t => range === "all" || inRange(t.transfer_date, iv))
          .map(t => ({
            date: format(new Date(t.transfer_date), "dd/MM/yyyy"),
            number: t.transfer_number,
            product: t.product_name,
            qty: t.quantity,
            from: branchName(t.from_branch_id),
            to: branchName(t.to_branch_id),
            status: t.status,
          }));
        return {
          ...base,
          title: "Stock Transfer Report",
          columns: [
            { header: "Date", key: "date" },
            { header: "Transfer #", key: "number" },
            { header: "Product", key: "product" },
            { header: "Qty", key: "qty", align: "right", total: true },
            { header: "From", key: "from" },
            { header: "To", key: "to" },
            { header: "Status", key: "status" },
          ],
          rows,
          summary: [{ label: "Transfers", value: String(rows.length) }],
        };
      }
    }
  };

  const handleExport = async (kind: "pdf" | "excel") => {
    setBusy(kind);
    try {
      const def = await buildDefinition();
      if (!def.rows.length) {
        toast.error("No records found for the selected report and period.");
        return;
      }
      if (kind === "pdf") await exportReportPdf(def);
      else exportReportExcel(def);
      toast.success(`${def.title} downloaded.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate the report.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Reports</h1>
        <p className="text-sm text-muted-foreground">Business performance summary</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Download Reports</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Report type</Label>
              <Select value={reportKey} onValueChange={v => setReportKey(v as ReportKey)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REPORTS.map(r => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Period</Label>
              <Select value={range} onValueChange={setRange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="last-7">Last 7 days</SelectItem>
                  <SelectItem value="last-30">Last 30 days</SelectItem>
                  <SelectItem value="this-month">This month</SelectItem>
                  <SelectItem value="custom">Custom range</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {range === "custom" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">From</Label>
                  <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} />
                </div>
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => handleExport("pdf")} disabled={busy !== null} className="gap-2">
              {busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Download PDF
            </Button>
            <Button onClick={() => handleExport("excel")} disabled={busy !== null} variant="outline" className="gap-2">
              {busy === "excel" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              Download Excel
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Every export carries the Wonder Aqua letterhead, the selected period, branch, totals and the preparer's name.
          </p>
        </CardContent>
      </Card>

      <div className="grid sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Today — {format(today, "dd MMM yyyy")}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Sales Count</span><span className="font-medium">{todaySales.length}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Revenue</span><span className="font-medium">KSh {todayRevenue.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Profit</span><span className="font-bold text-success">KSh {todayProfit.toLocaleString()}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">This Month — {format(today, "MMMM yyyy")}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Sales Count</span><span className="font-medium">{monthSales.length}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Revenue</span><span className="font-medium">KSh {monthRevenue.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Profit</span><span className="font-bold text-success">KSh {monthProfit.toLocaleString()}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">All-Time Profit</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-success">KSh {allProfit.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">From {sales.length} total sales</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Payment Mode Totals</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Cash</span><span className="font-medium">KSh {paymentTotals.Cash.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Mpesa</span><span className="font-medium">KSh {paymentTotals.Mpesa.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Credit</span><span className="font-medium">KSh {paymentTotals.Credit.toLocaleString()}</span></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Inventory Levels</CardTitle></CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground">No products in inventory.</p>
          ) : (
            <div className="space-y-3">
              {products.map(p => {
                const pct = p.low_stock_threshold > 0 ? Math.min(100, (p.quantity / (p.low_stock_threshold * 5)) * 100) : 50;
                const isLow = p.quantity <= p.low_stock_threshold;
                return (
                  <div key={p.id}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{p.name} ({p.bottle_size})</span>
                      <span className={isLow ? "text-destructive font-bold" : "text-foreground"}>{p.quantity} units</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isLow ? "bg-destructive" : "bg-secondary"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
