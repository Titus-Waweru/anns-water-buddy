import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, Receipt, Loader2 } from "lucide-react";

interface Voucher {
  id: string;
  voucher_number: string;
  purpose: string;
  category: string;
  amount: number;
  branch_id: string | null;
  recorded_by: string | null;
  date: string;
  notes: string | null;
  created_at: string;
}

const CATEGORIES = ["transport", "fuel", "utilities", "supplies", "misc"];

export default function VouchersPage() {
  const { user, isAdmin, branchId } = useAuth();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ purpose: "", category: "misc", amount: 0, notes: "" });

  const fetchVouchers = async () => {
    setLoading(true);
    let q = supabase.from("vouchers").select("*").order("created_at", { ascending: false });
    if (!isAdmin && branchId) q = q.eq("branch_id", branchId);
    const { data } = await q;
    if (data) setVouchers(data as Voucher[]);
    setLoading(false);
  };

  useEffect(() => { fetchVouchers(); }, [isAdmin, branchId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.purpose.trim() || form.amount <= 0) return;

    const voucherNumber = `VCH-${Date.now().toString(36).toUpperCase()}`;

    const { error } = await supabase.from("vouchers").insert({
      voucher_number: voucherNumber,
      purpose: form.purpose,
      category: form.category,
      amount: form.amount,
      branch_id: branchId,
      recorded_by: user?.id,
      notes: form.notes || null,
    } as any);

    if (error) {
      if (error.message.includes("duplicate")) toast.error("Duplicate voucher entry");
      else toast.error("Failed to add voucher");
    } else {
      toast.success("Voucher recorded!");
      setForm({ purpose: "", category: "misc", amount: 0, notes: "" });
      setOpen(false);
      fetchVouchers();
    }
  };

  const totalExpenses = vouchers.reduce((s, v) => s + Number(v.amount), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Vouchers</h1>
          <p className="text-sm text-muted-foreground">Track operational expenses</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> New Voucher</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Record Expense Voucher</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Purpose *</Label>
                  <Input value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} placeholder="e.g. Fuel for delivery" required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Category</Label>
                    <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Amount (KSh) *</Label>
                    <Input type="number" min={1} value={form.amount || ""} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} required />
                  </div>
                </div>
                <div>
                  <Label>Notes</Label>
                  <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes..." />
                </div>
                <Button type="submit" className="w-full">Record Voucher</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">Total Expenses</p>
          <p className="text-2xl font-bold text-foreground">KSh {totalExpenses.toLocaleString()}</p>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : vouchers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No vouchers recorded yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {vouchers.map(v => (
            <Card key={v.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">{v.purpose}</p>
                    <p className="text-xs text-muted-foreground">{v.voucher_number} · {format(new Date(v.date), "dd MMM yyyy")}</p>
                    {v.notes && <p className="text-xs text-muted-foreground italic mt-1">{v.notes}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-foreground">KSh {Number(v.amount).toLocaleString()}</p>
                    <Badge variant="outline" className="capitalize text-[10px]">{v.category}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
