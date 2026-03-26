import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";
import { DollarSign, Check, X, Loader2 } from "lucide-react";

interface CashSubmission {
  id: string;
  cashier_id: string;
  branch_id: string | null;
  shift_date: string;
  cash_amount: number;
  mpesa_amount: number;
  credit_amount: number;
  total_amount: number;
  notes: string | null;
  status: string;
  validated_by: string | null;
  validated_at: string | null;
  created_at: string;
}

export default function CashSubmissionPage() {
  const { user, isAdmin, branchId } = useAuth();
  const [submissions, setSubmissions] = useState<CashSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ cash: 0, mpesa: 0, credit: 0, notes: "" });

  const fetchSubmissions = async () => {
    setLoading(true);
    let q = supabase.from("cash_submissions").select("*").order("created_at", { ascending: false });
    if (!isAdmin && branchId) q = q.eq("branch_id", branchId);
    const { data } = await q;
    if (data) setSubmissions(data as CashSubmission[]);
    setLoading(false);
  };

  useEffect(() => { fetchSubmissions(); }, [isAdmin, branchId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const total = form.cash + form.mpesa + form.credit;
    if (total <= 0) { toast.error("Total must be greater than 0"); return; }

    setSubmitting(true);
    const { error } = await supabase.from("cash_submissions").insert({
      cashier_id: user.id,
      branch_id: branchId,
      cash_amount: form.cash,
      mpesa_amount: form.mpesa,
      credit_amount: form.credit,
      total_amount: total,
      notes: form.notes || null,
    } as any);

    if (error) toast.error("Failed to submit");
    else {
      toast.success("Cash submission recorded!");
      setForm({ cash: 0, mpesa: 0, credit: 0, notes: "" });
      fetchSubmissions();
    }
    setSubmitting(false);
  };

  const handleValidate = async (id: string, approve: boolean) => {
    if (!user) return;
    const { error } = await supabase.from("cash_submissions").update({
      status: approve ? "validated" : "rejected",
      validated_by: user.id,
      validated_at: new Date().toISOString(),
    } as any).eq("id", id);

    if (error) toast.error("Failed to update");
    else {
      toast.success(approve ? "Submission validated" : "Submission rejected");
      fetchSubmissions();
    }
  };

  const total = form.cash + form.mpesa + form.credit;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Cash Submission</h1>
        <p className="text-sm text-muted-foreground">End-of-shift cash reconciliation</p>
      </div>

      {/* Submit form - for cashiers */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Submit Shift Totals</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Cash (KSh)</Label>
                <Input type="number" min={0} value={form.cash || ""} onChange={e => setForm({ ...form, cash: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Mpesa (KSh)</Label>
                <Input type="number" min={0} value={form.mpesa || ""} onChange={e => setForm({ ...form, mpesa: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Credit (KSh)</Label>
                <Input type="number" min={0} value={form.credit || ""} onChange={e => setForm({ ...form, credit: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Any notes about the shift..." />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-foreground">Total: KSh {total.toLocaleString()}</p>
              <Button type="submit" disabled={submitting || total <= 0}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <DollarSign className="h-4 w-4 mr-2" />}
                Submit
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Submissions list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Submission History</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : submissions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No submissions yet.</p>
          ) : (
            <div className="space-y-3">
              {submissions.map(s => (
                <div key={s.id} className="flex items-center justify-between border rounded-lg p-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {format(new Date(s.created_at), "dd MMM yyyy, HH:mm")}
                    </p>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span>Cash: KSh {Number(s.cash_amount).toLocaleString()}</span>
                      <span>Mpesa: KSh {Number(s.mpesa_amount).toLocaleString()}</span>
                      <span>Credit: KSh {Number(s.credit_amount).toLocaleString()}</span>
                    </div>
                    <p className="text-xs font-bold text-foreground">Total: KSh {Number(s.total_amount).toLocaleString()}</p>
                    {s.notes && <p className="text-xs text-muted-foreground italic">{s.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={s.status === "validated" ? "default" : s.status === "rejected" ? "destructive" : "secondary"}
                      className={s.status === "validated" ? "bg-success" : ""}>
                      {s.status}
                    </Badge>
                    {isAdmin && s.status === "pending" && (
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-success" onClick={() => handleValidate(s.id, true)}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleValidate(s.id, false)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
