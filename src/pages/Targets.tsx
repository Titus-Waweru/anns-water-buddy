import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Target, Plus, Loader2, Trophy, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface TargetRecord {
  id: string;
  user_id: string;
  branch_id: string | null;
  target_type: string;
  target_value: number;
  current_value: number;
  period_start: string;
  period_end: string;
  reward: string;
  consequence: string;
  period: string;
  created_at: string;
  user_name?: string;
}

interface UserOption {
  user_id: string;
  full_name: string;
}

interface BranchOption {
  id: string;
  name: string;
}

export default function Targets() {
  const { isAdmin, user } = useAuth();
  const [targets, setTargets] = useState<TargetRecord[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({
    user_id: "",
    branch_id: "",
    target_type: "sales",
    target_value: 0,
    period: "monthly",
    period_start: format(new Date(), "yyyy-MM-dd"),
    period_end: "",
    reward: "",
    consequence: "",
  });

  const fetchTargets = useCallback(async () => {
    setLoading(true);
    const [targetsRes, profilesRes, branchesRes] = await Promise.all([
      supabase.from("targets").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("user_id, full_name"),
      supabase.from("branches").select("id, name"),
    ]);

    const profileMap = new Map((profilesRes.data || []).map(p => [p.user_id, p.full_name]));
    const enriched = (targetsRes.data || []).map(t => ({
      ...t,
      reward: (t as any).reward || "",
      consequence: (t as any).consequence || "",
      period: (t as any).period || "monthly",
      user_name: profileMap.get(t.user_id) || "Unknown",
    }));

    setTargets(enriched);
    setUsers((profilesRes.data || []).map(p => ({ user_id: p.user_id, full_name: p.full_name })));
    setBranches(branchesRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTargets(); }, [fetchTargets]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.user_id || form.target_value <= 0 || !form.period_end) {
      toast.error("Fill all required fields");
      return;
    }
    const { error } = await supabase.from("targets").insert({
      user_id: form.user_id,
      branch_id: form.branch_id || null,
      target_type: form.target_type,
      target_value: form.target_value,
      period_start: form.period_start,
      period_end: form.period_end,
      created_by: user!.id,
      reward: form.reward,
      consequence: form.consequence,
      period: form.period,
    } as any);

    if (error) {
      toast.error("Failed to create target");
      return;
    }
    toast.success("Target created!");
    setOpen(false);
    setForm({ user_id: "", branch_id: "", target_type: "sales", target_value: 0, period: "monthly", period_start: format(new Date(), "yyyy-MM-dd"), period_end: "", reward: "", consequence: "" });
    fetchTargets();
  };

  const getStatus = (t: TargetRecord) => {
    const pct = t.target_value > 0 ? (t.current_value / t.target_value) * 100 : 0;
    const now = new Date();
    const end = new Date(t.period_end);
    if (now > end) {
      return pct >= 100 ? { label: "Achieved", color: "text-success", bg: "bg-success/10" } : { label: "Failed", color: "text-destructive", bg: "bg-destructive/10" };
    }
    if (pct >= 75) return { label: "On Track", color: "text-success", bg: "bg-success/10" };
    if (pct >= 40) return { label: "Behind", color: "text-yellow-600", bg: "bg-yellow-50" };
    return { label: "At Risk", color: "text-destructive", bg: "bg-destructive/10" };
  };

  if (!isAdmin) {
    return <div className="p-6 text-center text-muted-foreground">You don't have permission to manage targets.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Target className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Target Management</h1>
            <p className="text-sm text-muted-foreground">Set & track staff performance targets</p>
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Create Target</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Create New Target</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Assign To *</Label>
                <Select value={form.user_id} onValueChange={v => setForm({ ...form, user_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
                  <SelectContent>
                    {users.map(u => <SelectItem key={u.user_id} value={u.user_id}>{u.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Target Type</Label>
                  <Select value={form.target_type} onValueChange={v => setForm({ ...form, target_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sales">Sales (Units)</SelectItem>
                      <SelectItem value="revenue">Revenue (KSh)</SelectItem>
                      <SelectItem value="profit">Profit (KSh)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Target Value *</Label>
                  <Input type="number" min={1} value={form.target_value || ""} onChange={e => setForm({ ...form, target_value: Number(e.target.value) })} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Period</Label>
                  <Select value={form.period} onValueChange={v => setForm({ ...form, period: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Branch (optional)</Label>
                  <Select value={form.branch_id} onValueChange={v => setForm({ ...form, branch_id: v })}>
                    <SelectTrigger><SelectValue placeholder="All branches" /></SelectTrigger>
                    <SelectContent>
                      {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Start Date</Label>
                  <Input type="date" value={form.period_start} onChange={e => setForm({ ...form, period_start: e.target.value })} />
                </div>
                <div>
                  <Label>End Date *</Label>
                  <Input type="date" value={form.period_end} onChange={e => setForm({ ...form, period_end: e.target.value })} required />
                </div>
              </div>
              <div>
                <Label>Reward (if achieved)</Label>
                <Input value={form.reward} onChange={e => setForm({ ...form, reward: e.target.value })} placeholder="e.g. KSh 2,000 bonus" />
              </div>
              <div>
                <Label>Consequence (if missed)</Label>
                <Input value={form.consequence} onChange={e => setForm({ ...form, consequence: e.target.value })} placeholder="e.g. Performance review" />
              </div>
              <Button type="submit" className="w-full">Create Target</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : targets.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <Target className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No targets created yet.</p>
        </CardContent></Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {targets.map(t => {
            const pct = t.target_value > 0 ? Math.min(100, (t.current_value / t.target_value) * 100) : 0;
            const status = getStatus(t);
            const remaining = Math.max(0, t.target_value - t.current_value);
            return (
              <Card key={t.id} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">{t.user_name}</CardTitle>
                    <Badge className={`${status.bg} ${status.color} border-0 text-[10px]`}>{status.label}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground capitalize">{t.target_type} · {t.period} · {format(new Date(t.period_start), "dd MMM")} - {format(new Date(t.period_end), "dd MMM yyyy")}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-semibold">{pct.toFixed(0)}%</span>
                    </div>
                    <Progress value={pct} className="h-2" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-muted/50 rounded p-2">
                      <p className="font-bold text-foreground">{t.target_type === "sales" ? t.current_value : `KSh ${t.current_value.toLocaleString()}`}</p>
                      <p className="text-muted-foreground">Current</p>
                    </div>
                    <div className="bg-muted/50 rounded p-2">
                      <p className="font-bold text-foreground">{t.target_type === "sales" ? t.target_value : `KSh ${t.target_value.toLocaleString()}`}</p>
                      <p className="text-muted-foreground">Target</p>
                    </div>
                    <div className="bg-muted/50 rounded p-2">
                      <p className="font-bold text-foreground">{t.target_type === "sales" ? remaining : `KSh ${remaining.toLocaleString()}`}</p>
                      <p className="text-muted-foreground">Remaining</p>
                    </div>
                  </div>
                  {(t.reward || t.consequence) && (
                    <div className="space-y-1 text-xs border-t pt-2">
                      {t.reward && (
                        <div className="flex items-center gap-1 text-success">
                          <Trophy className="h-3 w-3" /> <span>Reward: {t.reward}</span>
                        </div>
                      )}
                      {t.consequence && (
                        <div className="flex items-center gap-1 text-destructive">
                          <AlertTriangle className="h-3 w-3" /> <span>Consequence: {t.consequence}</span>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
