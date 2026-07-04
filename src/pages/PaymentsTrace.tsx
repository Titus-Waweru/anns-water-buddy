import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Play, Search, Copy, AlertTriangle, CheckCircle2, Clock, XCircle, Trash2 } from "lucide-react";


type Payment = {
  id: string;
  sale_id: string | null;
  provider: string;
  status: string;
  amount: number;
  phone_number: string;
  message_reference: string;
  correlation_id: string | null;
  result_code: string | null;
  result_description: string | null;
  raw_request: any;
  raw_payload: any;
  created_at: string;
  updated_at: string;
};

const STATUS_META: Record<string, { icon: any; cls: string }> = {
  PENDING: { icon: Clock, cls: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30" },
  SUCCESS: { icon: CheckCircle2, cls: "bg-success/10 text-success border-success/30" },
  FAILED: { icon: XCircle, cls: "bg-destructive/10 text-destructive border-destructive/30" },
};

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] || STATUS_META.PENDING;
  const Icon = m.icon;
  return (
    <Badge variant="outline" className={`gap-1 ${m.cls}`}>
      <Icon className="h-3 w-3" /> {status}
    </Badge>
  );
}

function isUpstreamBlocked(p: Payment) {
  const code = p.result_code;
  if (code === "403" || code === "503" || code === "401") return true;
  const desc = p.result_description?.toLowerCase() || "";
  return desc.includes("upstream") || desc.includes("access denied") || desc.includes("forbidden");
}

export default function PaymentsTrace() {
  const { isAdmin, isSuperAdmin, user } = useAuth();
  const { toast } = useToast();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Payment | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Payment | null>(null);
  const [deleting, setDeleting] = useState(false);

  const deletePayment = async (p: Payment) => {
    setDeleting(true);
    try {
      // Audit first (superadmin-only insert policy). If it fails, abort delete.
      const { error: auditErr } = await supabase.from("payment_deletions_audit").insert({
        payment_id: p.id,
        message_reference: p.message_reference,
        correlation_id: p.correlation_id,
        sale_id: p.sale_id,
        amount: p.amount,
        status: p.status,
        deleted_by: user?.id,
        snapshot: p as any,
      });
      if (auditErr) throw auditErr;
      const { error } = await supabase.from("payments").delete().eq("id", p.id);
      if (error) throw error;
      toast({ title: "Payment deleted", description: `Ref ${p.message_reference} removed and audited.` });
      setConfirmDelete(null);
      setSelected(null);
      await load();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };


  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast({ title: "Failed to load payments", description: error.message, variant: "destructive" });
    setPayments((data || []) as Payment[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Live updates via realtime channel
  useEffect(() => {
    const ch = supabase
      .channel("payments-trace")
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const runReconcile = async () => {
    setReconciling(true);
    try {
      const { data, error } = await supabase.functions.invoke("mpesa-reconcile", { body: {} });
      if (error) throw error;
      toast({
        title: "Reconciliation complete",
        description: `Scanned ${data?.scanned ?? 0} · finalized ${data?.finalized_success ?? 0} success / ${data?.finalized_failed ?? 0} failed · aged out ${data?.aged_out ?? 0}`,
      });
      await load();
    } catch (e: any) {
      toast({ title: "Reconcile failed", description: e.message, variant: "destructive" });
    } finally {
      setReconciling(false);
    }
  };

  const copy = (s: string) => {
    navigator.clipboard.writeText(s);
    toast({ title: "Copied", description: s.slice(0, 60) });
  };

  const filtered = payments.filter(p => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        p.message_reference?.toLowerCase().includes(q) ||
        p.correlation_id?.toLowerCase().includes(q) ||
        p.phone_number?.toLowerCase().includes(q) ||
        p.sale_id?.toLowerCase().includes(q) ||
        p.result_description?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const blocked = payments.filter(isUpstreamBlocked);
  const pending = payments.filter(p => p.status === "PENDING");

  if (!isAdmin) {
    return <div className="p-6 text-center text-muted-foreground">Superadmin / supervisor only.</div>;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Payments Trace</h1>
          <p className="text-sm text-muted-foreground">Co-op / M-Pesa correlation IDs, upstream errors, and reconciliation.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" onClick={runReconcile} disabled={reconciling}>
            <Play className={`h-4 w-4 mr-2 ${reconciling ? "animate-pulse" : ""}`} />
            {reconciling ? "Reconciling..." : "Run reconcile now"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Pending</p>
          <p className="text-3xl font-bold text-yellow-600">{pending.length}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Upstream blocked (403/503)</p>
          <p className="text-3xl font-bold text-destructive flex items-center gap-2">
            {blocked.length > 0 && <AlertTriangle className="h-6 w-6" />}
            {blocked.length}
          </p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Last 200 attempts</p>
          <p className="text-3xl font-bold">{payments.length}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 flex-wrap">
          <CardTitle className="text-base">Recent payments</CardTitle>
          <div className="ml-auto flex gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search ref / correlation / phone..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 w-64"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="SUCCESS">Success</SelectItem>
                <SelectItem value="FAILED">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Message Ref</TableHead>
                  <TableHead>Correlation</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    {loading ? "Loading..." : "No payments match."}
                  </TableCell></TableRow>
                )}
                {filtered.map(p => (
                  <TableRow key={p.id} className={isUpstreamBlocked(p) ? "bg-destructive/5" : ""}>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(p.created_at).toLocaleString()}</TableCell>
                    <TableCell><StatusBadge status={p.status} /></TableCell>
                    <TableCell className="font-mono text-xs">{Number(p.amount).toLocaleString()}</TableCell>
                    <TableCell className="font-mono text-xs">{p.phone_number}</TableCell>
                    <TableCell className="font-mono text-[11px]">
                      <button onClick={() => copy(p.message_reference)} className="hover:underline flex items-center gap-1">
                        {p.message_reference} <Copy className="h-3 w-3 opacity-50" />
                      </button>
                    </TableCell>
                    <TableCell className="font-mono text-[11px]">
                      {p.correlation_id ? (
                        <button onClick={() => copy(p.correlation_id!)} className="hover:underline flex items-center gap-1">
                          {p.correlation_id.slice(0, 8)}… <Copy className="h-3 w-3 opacity-50" />
                        </button>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs max-w-[260px] truncate">
                      {p.result_code && <Badge variant="outline" className="mr-1 font-mono">{p.result_code}</Badge>}
                      <span className={isUpstreamBlocked(p) ? "text-destructive" : "text-muted-foreground"}>
                        {p.result_description || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => setSelected(p)}>Details</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Payment trace
              {selected && <StatusBadge status={selected.status} />}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted-foreground">Message Ref</p><p className="font-mono break-all">{selected.message_reference}</p></div>
                <div><p className="text-xs text-muted-foreground">Correlation ID</p><p className="font-mono break-all">{selected.correlation_id || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Sale ID</p><p className="font-mono break-all">{selected.sale_id || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Provider</p><p className="font-mono">{selected.provider}</p></div>
                <div><p className="text-xs text-muted-foreground">Amount</p><p>{Number(selected.amount).toLocaleString()} KES</p></div>
                <div><p className="text-xs text-muted-foreground">Phone</p><p className="font-mono">{selected.phone_number}</p></div>
                <div><p className="text-xs text-muted-foreground">Result Code</p><p className="font-mono">{selected.result_code || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Updated</p><p>{new Date(selected.updated_at).toLocaleString()}</p></div>
              </div>
              {selected.result_description && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Result description</p>
                  <p className={`p-2 rounded border text-xs ${isUpstreamBlocked(selected) ? "bg-destructive/5 border-destructive/30 text-destructive" : "bg-muted"}`}>
                    {selected.result_description}
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Request payload sent to Co-op</p>
                <pre className="p-3 rounded bg-muted text-[11px] overflow-auto max-h-48">{JSON.stringify(selected.raw_request, null, 2)}</pre>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Callback / upstream response</p>
                <pre className="p-3 rounded bg-muted text-[11px] overflow-auto max-h-48">
                  {selected.raw_payload ? JSON.stringify(selected.raw_payload, null, 2) : "No callback received yet."}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
