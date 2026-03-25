import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Building2, Plus, MapPin, Users, DollarSign } from "lucide-react";
import { toast } from "sonner";

interface BranchWithStats {
  id: string;
  name: string;
  location: string | null;
  phone: string | null;
  is_active: boolean;
  staff_count: number;
  total_sales: number;
  total_revenue: number;
}

export default function Branches() {
  const { isAdmin } = useAuth();
  const [branches, setBranches] = useState<BranchWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", location: "", phone: "" });

  const fetchBranches = useCallback(async () => {
    setLoading(true);
    const [branchRes, assignRes, salesRes] = await Promise.all([
      supabase.from("branches").select("*").order("created_at", { ascending: false }),
      supabase.from("user_branch_assignments").select("branch_id"),
      supabase.from("sales").select("branch_id, final_amount"),
    ]);

    const rawBranches = branchRes.data || [];
    const assignments = assignRes.data || [];
    const sales = salesRes.data || [];

    const branchesWithStats: BranchWithStats[] = rawBranches.map((b) => {
      const staffCount = assignments.filter((a) => a.branch_id === b.id).length;
      const branchSales = sales.filter((s) => s.branch_id === b.id);
      const totalRevenue = branchSales.reduce((sum, s) => sum + Number(s.final_amount || 0), 0);
      return {
        ...b,
        staff_count: staffCount,
        total_sales: branchSales.length,
        total_revenue: totalRevenue,
      };
    });

    setBranches(branchesWithStats);
    setLoading(false);
  }, []);

  useEffect(() => { fetchBranches(); }, [fetchBranches]);

  const createBranch = async () => {
    if (!form.name.trim()) { toast.error("Branch name is required"); return; }
    setCreating(true);
    const { error } = await supabase.from("branches").insert({
      name: form.name.trim(),
      location: form.location.trim() || null,
      phone: form.phone.trim() || null,
    });
    if (error) {
      toast.error("Failed to create branch");
    } else {
      toast.success("Branch created!");
      setForm({ name: "", location: "", phone: "" });
      setDialogOpen(false);
      fetchBranches();
    }
    setCreating(false);
  };

  if (!isAdmin) {
    return <div className="p-6 text-center text-muted-foreground">You don't have permission to access this page.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Branch Management</h1>
            <p className="text-sm text-muted-foreground">Manage your business locations</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> New Branch</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Branch</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>Branch Name *</Label>
                <Input placeholder="e.g. Westlands Branch" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label>Location</Label>
                <Input placeholder="e.g. Westlands, Nairobi" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input placeholder="e.g. 0712345678" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <Button onClick={createBranch} disabled={creating} className="w-full">
                {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create Branch
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <Building2 className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold text-foreground">{branches.length}</p>
            <p className="text-xs text-muted-foreground">Total Branches</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <Users className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold text-foreground">{branches.reduce((s, b) => s + b.staff_count, 0)}</p>
            <p className="text-xs text-muted-foreground">Total Staff</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <DollarSign className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold text-foreground">KSh {branches.reduce((s, b) => s + b.total_revenue, 0).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total Revenue</p>
          </CardContent>
        </Card>
      </div>

      {/* Branches Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">All Branches</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : branches.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No branches yet. Create your first branch!</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Staff</TableHead>
                    <TableHead>Sales</TableHead>
                    <TableHead>Revenue</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {branches.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.name}</TableCell>
                      <TableCell>
                        {b.location ? (
                          <span className="flex items-center gap-1 text-sm"><MapPin className="h-3 w-3" />{b.location}</span>
                        ) : "—"}
                      </TableCell>
                      <TableCell>{b.phone || "—"}</TableCell>
                      <TableCell>{b.staff_count}</TableCell>
                      <TableCell>{b.total_sales}</TableCell>
                      <TableCell>KSh {b.total_revenue.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge className={b.is_active ? "bg-green-100 text-green-800 border-green-300 border" : "bg-red-100 text-red-800 border-red-300 border"}>
                          {b.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
