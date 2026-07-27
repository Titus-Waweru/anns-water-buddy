import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useData } from "@/context/DataContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { DollarSign, Check, X, Loader2, Eye, Printer, Ban } from "lucide-react";

// Payment methods supported by the reconciliation module
const PAYMENT_METHODS = ["Cash", "Mpesa", "KCB", "COOP", "Equity", "Family"];

interface CashReconciliation {
  id: string;
  branch_id: string;
  cashier_id: string;
  shift: "Morning" | "Evening";
  reconciliation_date: string;
  expected_data: Record<string, number>;
  expected_total: number;
  actual_data: Record<string, number>;
  actual_total: number;
  difference: number;
  status: "BALANCED" | "SURPLUS" | "DEFICIT";
  transaction_charges: number;
  remarks: string | null;
  approval_status: "Pending" | "Approved" | "Rejected";
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  // Joined fields
  cashier_name?: string;
  branch_name?: string;
  approver_name?: string;
}

export default function CashReconciliation() {
  const { user, isAdmin, hasRole, roles } = useAuth();
  const { branches, effectiveBranchId } = useData();
  const canManage = isAdmin || hasRole("supervisor");

  // Form state
  const [shift, setShift] = useState<"Morning" | "Evening">("Morning");
  const [actualData, setActualData] = useState<Record<string, number>>(
    Object.fromEntries(PAYMENT_METHODS.map(m => [m, 0]))
  );
  const [transactionCharges, setTransactionCharges] = useState(0);
  const [remarks, setRemarks] = useState("");

  // Expected values (calculated on demand)
  const [expectedData, setExpectedData] = useState<Record<string, number>>(
    Object.fromEntries(PAYMENT_METHODS.map(m => [m, 0]))
  );
  const [expectedTotal, setExpectedTotal] = useState(0);
  const [expectedCalculated, setExpectedCalculated] = useState(false);
  const [calculating, setCalculating] = useState(false);

  // Submission
  const [submitting, setSubmitting] = useState(false);

  // History
  const [reconciliations, setReconciliations] = useState<CashReconciliation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [filterDate, setFilterDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [filterBranch, setFilterBranch] = useState<string>("all");
  const [filterShift, setFilterShift] = useState<string>("all");

  // View dialog
  const [viewRecord, setViewRecord] = useState<CashReconciliation | null>(null);
  const [viewOpen, setViewOpen] = useState(false);

  // Approval
  const [approving, setApproving] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectDialog, setRejectDialog] = useState<string | null>(null);

  // Compute actual total
  const actualTotal = useMemo(
    () => Object.values(actualData).reduce((a, b) => a + b, 0),
    [actualData]
  );

  // Compute difference and status
  const difference = useMemo(() => actualTotal - expectedTotal, [actualTotal, expectedTotal]);
  const status = useMemo<"BALANCED" | "SURPLUS" | "DEFICIT">(() => {
    if (difference === 0) return "BALANCED";
    if (difference > 0) return "SURPLUS";
    return "DEFICIT";
  }, [difference]);

  // Calculate expected values from sales
  const calculateExpected = useCallback(async () => {
    if (!effectiveBranchId || !user) return;
    setCalculating(true);

    const today = format(new Date(), "yyyy-MM-dd");
    const now = new Date().toISOString();

    // Determine time range based on shift
    // Morning: from today 00:00:00 to current time
    // Evening: from today 12:00:00 to current time
    const shiftStart = shift === "Morning"
      ? `${today}T00:00:00.000Z`
      : `${today}T12:00:00.000Z`;

    try {
      const { data: sales, error } = await (supabase as any)
        .from("sales")
        .select("payment_mode, final_amount")
        .eq("branch_id", effectiveBranchId)
        .gte("date", shiftStart)
        .lte("date", now);

      if (error) {
        toast.error("Failed to calculate expected values: " + error.message);
        return;
      }

      // Aggregate by payment mode
      const aggregated: Record<string, number> = {};
      (sales || []).forEach((s: any) => {
        const mode = s.payment_mode || "Unknown";
        aggregated[mode] = (aggregated[mode] || 0) + Number(s.final_amount);
      });

      // Build expected data for all known payment methods
      const newExpected: Record<string, number> = {};
      let total = 0;
      PAYMENT_METHODS.forEach(method => {
        const val = aggregated[method] || 0;
        newExpected[method] = val;
        total += val;
      });

      setExpectedData(newExpected);
      setExpectedTotal(total);
      setExpectedCalculated(true);
      toast.success(`Expected values calculated for ${shift} shift`);
    } catch (err) {
      toast.error("Failed to calculate expected values");
    } finally {
      setCalculating(false);
    }
  }, [effectiveBranchId, shift, user]);

  // Check for existing reconciliation
  const checkExisting = useCallback(async (): Promise<CashReconciliation | null> => {
    if (!effectiveBranchId) return null;
    const today = format(new Date(), "yyyy-MM-dd");
    const { data } = await (supabase as any)
      .from("cash_reconciliations")
      .select("*")
      .eq("branch_id", effectiveBranchId)
      .eq("shift", shift)
      .eq("reconciliation_date", today)
      .in("approval_status", ["Pending", "Approved"])
      .maybeSingle();
    return data as CashReconciliation | null;
  }, [effectiveBranchId, shift]);

  // Submit reconciliation
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !effectiveBranchId) {
      toast.error("No branch selected");
      return;
    }
    if (!expectedCalculated) {
      toast.error("Calculate expected values first");
      return;
    }

    // Check for existing
    const existing = await checkExisting();
    if (existing) {
      if (existing.approval_status === "Approved") {
        toast.error("Reconciliation already approved for this shift today");
      } else {
        toast.error("A pending reconciliation already exists for this shift. Wait for supervisor review.");
      }
      return;
    }

    if (transactionCharges < 0) {
      toast.error("Transaction charges cannot be negative");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await (supabase as any).from("cash_reconciliations").insert({
        branch_id: effectiveBranchId,
        cashier_id: user.id,
        shift,
        reconciliation_date: format(new Date(), "yyyy-MM-dd"),
        expected_data: expectedData,
        expected_total: expectedTotal,
        actual_data: actualData,
        actual_total: actualTotal,
        difference,
        status,
        transaction_charges: transactionCharges,
        remarks: remarks || null,
        approval_status: "Pending",
      });

      if (error) {
        // Handle unique constraint violation
        if (error.code === "23505") {
          toast.error("A reconciliation already exists for this branch, shift, and date");
        } else {
          toast.error("Failed to submit reconciliation: " + error.message);
        }
        return;
      }

      toast.success("Reconciliation submitted successfully");
      // Reset form
      setActualData(Object.fromEntries(PAYMENT_METHODS.map(m => [m, 0])));
      setTransactionCharges(0);
      setRemarks("");
      setExpectedCalculated(false);
      setExpectedData(Object.fromEntries(PAYMENT_METHODS.map(m => [m, 0])));
      setExpectedTotal(0);
      fetchHistory();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit reconciliation");
    } finally {
      setSubmitting(false);
    }
  };

  // Fetch history
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      let q = (supabase as any)
        .from("cash_reconciliations")
        .select("*, cashier:cashier_id(full_name), branch:branch_id(name), approver:approved_by(full_name)")
        .order("created_at", { ascending: false });

      if (filterBranch !== "all") {
        q = q.eq("branch_id", filterBranch);
      }
      if (filterShift !== "all") {
        q = q.eq("shift", filterShift);
      }
      if (filterDate) {
        q = q.eq("reconciliation_date", filterDate);
      }

      // Non-admin users only see their branch
      if (!isAdmin && effectiveBranchId) {
        q = q.eq("branch_id", effectiveBranchId);
      }

      const { data } = await q;
      if (data) {
        const mapped = data.map((r: any) => ({
          ...r,
          cashier_name: r.cashier?.full_name || "Unknown",
          branch_name: r.branch?.name || "Unknown",
          approver_name: r.approver?.full_name || null,
        }));
        setReconciliations(mapped as CashReconciliation[]);
      }
    } catch {
      toast.error("Failed to load reconciliation history");
    } finally {
      setHistoryLoading(false);
    }
  }, [filterBranch, filterShift, filterDate, isAdmin, effectiveBranchId]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // Approve reconciliation
  const handleApprove = async (id: string) => {
    if (!user) return;
    setApproving(id);
    const { error } = await (supabase as any)
      .from("cash_reconciliations")
      .update({
        approval_status: "Approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      toast.error("Failed to approve: " + error.message);
    } else {
      toast.success("Reconciliation approved");
      fetchHistory();
    }
    setApproving(null);
  };

  // Reject reconciliation
  const handleReject = async () => {
    if (!user || !rejectDialog || !rejectReason.trim()) {
      toast.error("Rejection reason is required");
      return;
    }
    setApproving(rejectDialog);
    const { error } = await (supabase as any)
      .from("cash_reconciliations")
      .update({
        approval_status: "Rejected",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        rejection_reason: rejectReason.trim(),
      })
      .eq("id", rejectDialog);

    if (error) {
      toast.error("Failed to reject: " + error.message);
    } else {
      toast.success("Reconciliation rejected");
      setRejectDialog(null);
      setRejectReason("");
      fetchHistory();
    }
    setApproving(null);
  };

  // Print/view dialog content
  const printRecord = (record: CashReconciliation) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
      <head>
        <title>Reconciliation - ${record.reconciliation_date} - ${record.shift}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; }
          h1 { font-size: 20px; margin-bottom: 5px; }
          .meta { color: #666; font-size: 13px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background: #f5f5f5; }
          .total-row { font-weight: bold; background: #f9f9f9; }
          .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: bold; }
          .balanced { background: #d4edda; color: #155724; }
          .surplus { background: #cce5ff; color: #004085; }
          .deficit { background: #f8d7da; color: #721c24; }
          .pending { background: #fff3cd; color: #856404; }
          .approved { background: #d4edda; color: #155724; }
          .rejected { background: #f8d7da; color: #721c24; }
          .footer { margin-top: 30px; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 10px; }
        </style>
      </head>
      <body>
        <h1>M-Banking Reconciliation Report</h1>
        <div class="meta">
          <p>Branch: ${record.branch_name || "N/A"} | Shift: ${record.shift} | Date: ${record.reconciliation_date}</p>
          <p>Cashier: ${record.cashier_name || "N/A"} | Status: <span class="badge ${record.approval_status.toLowerCase()}">${record.approval_status}</span></p>
        </div>
        <table>
          <tr><th>Payment Method</th><th>Expected</th><th>Actual</th></tr>
          ${PAYMENT_METHODS.map(m => `
            <tr>
              <td>${m}</td>
              <td>KSh ${(record.expected_data?.[m] || 0).toLocaleString()}</td>
              <td>KSh ${(record.actual_data?.[m] || 0).toLocaleString()}</td>
            </tr>
          `).join("")}
          <tr class="total-row">
            <td>Total</td>
            <td>KSh ${(record.expected_total || 0).toLocaleString()}</td>
            <td>KSh ${(record.actual_total || 0).toLocaleString()}</td>
          </tr>
        </table>
        <table>
          <tr><td><strong>Difference:</strong></td><td>KSh ${(record.difference || 0).toLocaleString()}</td></tr>
          <tr><td><strong>Status:</strong></td><td><span class="badge ${record.status.toLowerCase()}">${record.status}</span></td></tr>
          <tr><td><strong>Transaction Charges:</strong></td><td>KSh ${(record.transaction_charges || 0).toLocaleString()}</td></tr>
          ${record.remarks ? `<tr><td><strong>Remarks:</strong></td><td>${record.remarks}</td></tr>` : ""}
          ${record.rejection_reason ? `<tr><td><strong>Rejection Reason:</strong></td><td>${record.rejection_reason}</td></tr>` : ""}
        </table>
        <div class="footer">
          <p>Generated on ${format(new Date(), "dd MMM yyyy HH:mm")} | Wonder Aqua LTD</p>
          ${record.approved_by ? `<p>Approved by: ${record.approver_name || "N/A"} on ${record.approved_at ? format(new Date(record.approved_at), "dd MMM yyyy HH:mm") : "N/A"}</p>` : ""}
        </div>
        <script>window.print();</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DollarSign className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">M-Banking Reconciliation</h1>
            <p className="text-sm text-muted-foreground">Compare expected sales against actual money received</p>
          </div>
        </div>
      </div>

      {/* New Reconciliation Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">New Reconciliation</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Shift Selection */}
            <div className="flex items-center gap-4">
              <div className="w-48">
                <Label>Shift *</Label>
                <Select value={shift} onValueChange={v => {
                  setShift(v as "Morning" | "Evening");
                  setExpectedCalculated(false);
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Morning">Morning</SelectItem>
                    <SelectItem value="Evening">Evening</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="pt-5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={calculateExpected}
                  disabled={calculating || !effectiveBranchId}
                  className="gap-2"
                >
                  {calculating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {expectedCalculated ? "Recalculate Expected" : "Calculate Expected"}
                </Button>
              </div>
            </div>

            {/* Section 1: Expected Totals (Read Only) */}
            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Expected Totals (from sales)</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {PAYMENT_METHODS.map(method => (
                    <div key={method} className="bg-background rounded-lg p-3 border">
                      <p className="text-xs text-muted-foreground">{method}</p>
                      <p className="text-lg font-bold text-foreground">
                        KSh {expectedData[method]?.toLocaleString() || "0"}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t flex justify-between">
                  <span className="text-sm font-semibold">Grand Total Expected:</span>
                  <span className="text-lg font-bold text-primary">KSh {expectedTotal.toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>

            {/* Section 2: Cashier Entry */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Cashier Entry</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {PAYMENT_METHODS.map(method => (
                  <div key={method}>
                    <Label>Actual {method}</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={actualData[method] || ""}
                      onChange={e => setActualData(prev => ({
                        ...prev,
                        [method]: Number(e.target.value) || 0,
                      }))}
                    />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <Label>Transaction Charges</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={transactionCharges || ""}
                    onChange={e => setTransactionCharges(Number(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label>Remarks (optional)</Label>
                  <Textarea
                    value={remarks}
                    onChange={e => setRemarks(e.target.value)}
                    placeholder="Any notes..."
                    className="resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Results Preview */}
            <Card className={status === "BALANCED" ? "border-success/50" : status === "SURPLUS" ? "border-blue-500/50" : "border-destructive/50"}>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-3">Results Preview</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Expected Total</p>
                    <p className="text-lg font-bold text-foreground">KSh {expectedTotal.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Actual Total</p>
                    <p className="text-lg font-bold text-foreground">KSh {actualTotal.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Difference</p>
                    <p className={`text-lg font-bold ${difference === 0 ? "text-success" : difference > 0 ? "text-blue-500" : "text-destructive"}`}>
                      {difference >= 0 ? "+" : ""}KSh {difference.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <Badge
                      variant={status === "BALANCED" ? "default" : status === "SURPLUS" ? "secondary" : "destructive"}
                      className={status === "BALANCED" ? "bg-success" : status === "SURPLUS" ? "bg-blue-500" : ""}
                    >
                      {status}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Button
              type="submit"
              className="w-full"
              disabled={submitting || !expectedCalculated || !effectiveBranchId}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Submit Reconciliation
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Section 4: History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Reconciliation History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="w-44">
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={filterDate}
                onChange={e => setFilterDate(e.target.value)}
              />
            </div>
            {isAdmin && (
              <div className="w-44">
                <Label className="text-xs">Branch</Label>
                <Select value={filterBranch} onValueChange={setFilterBranch}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Branches</SelectItem>
                    {branches.filter(b => b.is_active).map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="w-44">
              <Label className="text-xs">Shift</Label>
              <Select value={filterShift} onValueChange={setFilterShift}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Shifts</SelectItem>
                  <SelectItem value="Morning">Morning</SelectItem>
                  <SelectItem value="Evening">Evening</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {historyLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : reconciliations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No reconciliations found.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Shift</TableHead>
                    <TableHead>Cashier</TableHead>
                    <TableHead>Expected</TableHead>
                    <TableHead>Actual</TableHead>
                    <TableHead>Difference</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Approval</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reconciliations.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{format(new Date(r.reconciliation_date), "dd MMM yyyy")}</TableCell>
                      <TableCell className="font-medium">{r.branch_name}</TableCell>
                      <TableCell>{r.shift}</TableCell>
                      <TableCell className="text-xs">{r.cashier_name}</TableCell>
                      <TableCell>KSh {r.expected_total.toLocaleString()}</TableCell>
                      <TableCell>KSh {r.actual_total.toLocaleString()}</TableCell>
                      <TableCell>
                        <span className={r.difference === 0 ? "text-success" : r.difference > 0 ? "text-blue-500" : "text-destructive"}>
                          {r.difference >= 0 ? "+" : ""}KSh {r.difference.toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={r.status === "BALANCED" ? "default" : r.status === "SURPLUS" ? "secondary" : "destructive"}
                          className={r.status === "BALANCED" ? "bg-success" : r.status === "SURPLUS" ? "bg-blue-500" : ""}
                        >
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={r.approval_status === "Approved" ? "default" : r.approval_status === "Rejected" ? "destructive" : "secondary"}
                          className={r.approval_status === "Approved" ? "bg-success" : ""}
                        >
                          {r.approval_status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => { setViewRecord(r); setViewOpen(true); }}
                            title="View"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => printRecord(r)}
                            title="Print / PDF"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                          {canManage && r.approval_status === "Pending" && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-success"
                                onClick={() => handleApprove(r.id)}
                                disabled={approving === r.id}
                                title="Approve"
                              >
                                {approving === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                onClick={() => { setRejectDialog(r.id); setRejectReason(""); }}
                                title="Reject"
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Reconciliation Details</DialogTitle>
          </DialogHeader>
          {viewRecord && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Branch:</span> <span className="font-medium">{viewRecord.branch_name}</span></div>
                <div><span className="text-muted-foreground">Cashier:</span> <span className="font-medium">{viewRecord.cashier_name}</span></div>
                <div><span className="text-muted-foreground">Shift:</span> <span className="font-medium">{viewRecord.shift}</span></div>
                <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{format(new Date(viewRecord.reconciliation_date), "dd MMM yyyy")}</span></div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="p-2 text-left">Method</th>
                      <th className="p-2 text-right">Expected</th>
                      <th className="p-2 text-right">Actual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PAYMENT_METHODS.map(m => (
                      <tr key={m} className="border-t">
                        <td className="p-2">{m}</td>
                        <td className="p-2 text-right">KSh {(viewRecord.expected_data?.[m] || 0).toLocaleString()}</td>
                        <td className="p-2 text-right">KSh {(viewRecord.actual_data?.[m] || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                    <tr className="border-t font-bold bg-muted/30">
                      <td className="p-2">Total</td>
                      <td className="p-2 text-right">KSh {viewRecord.expected_total.toLocaleString()}</td>
                      <td className="p-2 text-right">KSh {viewRecord.actual_total.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Difference:</span>{" "}
                  <span className={`font-bold ${viewRecord.difference === 0 ? "text-success" : viewRecord.difference > 0 ? "text-blue-500" : "text-destructive"}`}>
                    {viewRecord.difference >= 0 ? "+" : ""}KSh {viewRecord.difference.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>{" "}
                  <Badge
                    variant={viewRecord.status === "BALANCED" ? "default" : viewRecord.status === "SURPLUS" ? "secondary" : "destructive"}
                    className={viewRecord.status === "BALANCED" ? "bg-success" : viewRecord.status === "SURPLUS" ? "bg-blue-500" : ""}
                  >
                    {viewRecord.status}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Transaction Charges:</span>{" "}
                  <span className="font-medium">KSh {viewRecord.transaction_charges.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Approval:</span>{" "}
                  <Badge
                    variant={viewRecord.approval_status === "Approved" ? "default" : viewRecord.approval_status === "Rejected" ? "destructive" : "secondary"}
                    className={viewRecord.approval_status === "Approved" ? "bg-success" : ""}
                  >
                    {viewRecord.approval_status}
                  </Badge>
                </div>
              </div>

              {viewRecord.remarks && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Remarks:</span>
                  <p className="mt-1 p-2 bg-muted/30 rounded">{viewRecord.remarks}</p>
                </div>
              )}

              {viewRecord.rejection_reason && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Rejection Reason:</span>
                  <p className="mt-1 p-2 bg-destructive/10 rounded text-destructive">{viewRecord.rejection_reason}</p>
                </div>
              )}

              {viewRecord.approved_by && (
                <div className="text-xs text-muted-foreground">
                  Approved by {viewRecord.approver_name} on {viewRecord.approved_at ? format(new Date(viewRecord.approved_at), "dd MMM yyyy HH:mm") : "N/A"}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => printRecord(viewRecord)} className="gap-2">
                  <Printer className="h-4 w-4" /> Print / PDF
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={!!rejectDialog} onOpenChange={v => { if (!v) setRejectDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reject Reconciliation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Rejection Reason *</Label>
              <Textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Explain why this reconciliation is being rejected..."
                className="resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectDialog(null)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={approving === rejectDialog || !rejectReason.trim()}
              >
                {approving === rejectDialog ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Reject
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
