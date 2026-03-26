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
import { Plus, Wrench, Loader2 } from "lucide-react";

interface Asset {
  id: string;
  name: string;
  description: string | null;
  category: string;
  value: number;
  status: string;
  branch_id: string | null;
  acquired_date: string | null;
  created_at: string;
}

const CATEGORIES = ["equipment", "vehicle", "furniture", "electronics", "other"];
const STATUSES = ["active", "maintenance", "retired"];

export default function AssetsPage() {
  const { isAdmin, branchId } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", category: "equipment", value: 0, status: "active" });

  const fetchAssets = async () => {
    setLoading(true);
    let q = supabase.from("assets").select("*").order("created_at", { ascending: false });
    if (!isAdmin && branchId) q = q.eq("branch_id", branchId);
    const { data } = await q;
    if (data) setAssets(data as Asset[]);
    setLoading(false);
  };

  useEffect(() => { fetchAssets(); }, [isAdmin, branchId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const { error } = await supabase.from("assets").insert({
      name: form.name,
      description: form.description || null,
      category: form.category,
      value: form.value,
      status: form.status,
      branch_id: branchId,
    } as any);
    if (error) toast.error("Failed to add asset");
    else {
      toast.success("Asset added!");
      setForm({ name: "", description: "", category: "equipment", value: 0, status: "active" });
      setOpen(false);
      fetchAssets();
    }
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("assets").update({ status } as any).eq("id", id);
    toast.success("Status updated");
    fetchAssets();
  };

  const totalValue = assets.filter(a => a.status === "active").reduce((s, a) => s + Number(a.value), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Assets</h1>
          <p className="text-sm text-muted-foreground">Track business equipment & vehicles</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> Add Asset</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Asset</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Name *</Label>
                  <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Delivery Bodaboda" required />
                </div>
                <div>
                  <Label>Description</Label>
                  <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Details..." />
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
                    <Label>Value (KSh)</Label>
                    <Input type="number" min={0} value={form.value || ""} onChange={e => setForm({ ...form, value: Number(e.target.value) })} />
                  </div>
                </div>
                <Button type="submit" className="w-full">Add Asset</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">Total Active Asset Value</p>
          <p className="text-2xl font-bold text-foreground">KSh {totalValue.toLocaleString()}</p>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : assets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Wrench className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No assets tracked yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {assets.map(a => (
            <Card key={a.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  {a.name}
                  <Badge variant={a.status === "active" ? "default" : a.status === "maintenance" ? "secondary" : "destructive"}
                    className={a.status === "active" ? "bg-success" : ""}>
                    {a.status}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p className="text-muted-foreground">Category: <span className="text-foreground font-medium capitalize">{a.category}</span></p>
                <p className="text-muted-foreground">Value: <span className="text-foreground font-medium">KSh {Number(a.value).toLocaleString()}</span></p>
                {a.description && <p className="text-muted-foreground text-xs">{a.description}</p>}
                {isAdmin && (
                  <div className="flex gap-1 pt-2">
                    {STATUSES.filter(s => s !== a.status).map(s => (
                      <Button key={s} size="sm" variant="outline" className="text-xs h-7" onClick={() => updateStatus(a.id, s)}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </Button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
