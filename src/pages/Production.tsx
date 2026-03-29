import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Factory, Package, AlertTriangle, CheckCircle, TrendingUp, BarChart3, Save } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface ProductionRecord {
  id: string;
  production_date: string;
  bales: number;
  total_bottles: number;
  faulty_bottles: number;
  good_bottles: number;
  economy_bottles: number;
  executive_bottles: number;
  economy_packs: number;
  executive_packs: number;
  loose_bottles: number;
  economy_allocation: number;
  expected_revenue: number;
  notes: string | null;
  created_at: string;
}

export default function Production() {
  const { hasRole, isAdmin, user, branchId } = useAuth();
  const canAccess = isAdmin || hasRole("stock_manager");

  const [bales, setBales] = useState(0);
  const [faultyBottles, setFaultyBottles] = useState(0);
  const [economyAllocation, setEconomyAllocation] = useState(50);
  const [notes, setNotes] = useState("");
  const [economyPrice, setEconomyPrice] = useState(10);
  const [executivePrice, setExecutivePrice] = useState(20);
  const [saving, setSaving] = useState(false);
  const [records, setRecords] = useState<ProductionRecord[]>([]);

  const bottlesPerBale = 90;
  const bottlesPerPack = 12;

  const totalBottles = bales * bottlesPerBale;
  const goodBottles = Math.max(0, totalBottles - faultyBottles);
  const economyBottles = Math.floor(goodBottles * (economyAllocation / 100));
  const executiveBottles = goodBottles - economyBottles;
  const economyPacks = Math.floor(economyBottles / bottlesPerPack);
  const executivePacks = Math.floor(executiveBottles / bottlesPerPack);
  const looseBottles = (economyBottles % bottlesPerPack) + (executiveBottles % bottlesPerPack);
  const expectedRevenue = (economyBottles * economyPrice) + (executiveBottles * executivePrice);

  const fetchRecords = useCallback(async () => {
    let q = supabase.from("production_records").select("*").order("production_date", { ascending: false }).limit(50);
    if (!isAdmin && branchId) q = q.eq("branch_id", branchId);
    const { data } = await q;
    if (data) setRecords(data as ProductionRecord[]);
  }, [isAdmin, branchId]);

  // Fetch pricing config
  useEffect(() => {
    if (!canAccess) return;
    fetchRecords();
    supabase.from("system_settings").select("*").in("setting_key", ["economy_bottle_price", "executive_bottle_price"]).then(({ data }) => {
      data?.forEach(s => {
        if (s.setting_key === "economy_bottle_price") setEconomyPrice(Number(s.setting_value) || 10);
        if (s.setting_key === "executive_bottle_price") setExecutivePrice(Number(s.setting_value) || 20);
      });
    });
  }, [canAccess, fetchRecords]);

  const handleSave = async () => {
    if (bales <= 0) { toast.error("Enter number of bales"); return; }
    setSaving(true);
    const { error } = await supabase.from("production_records").insert({
      production_date: new Date().toISOString().split("T")[0],
      bales,
      total_bottles: totalBottles,
      faulty_bottles: faultyBottles,
      good_bottles: goodBottles,
      economy_bottles: economyBottles,
      executive_bottles: executiveBottles,
      economy_packs: economyPacks,
      executive_packs: executivePacks,
      loose_bottles: looseBottles,
      economy_allocation: economyAllocation,
      expected_revenue: expectedRevenue,
      branch_id: branchId,
      recorded_by: user!.id,
      notes: notes || null,
    });
    if (error) { toast.error("Failed to save: " + error.message); }
    else {
      toast.success("Production record saved!");
      setBales(0); setFaultyBottles(0); setNotes("");
      fetchRecords();
    }
    setSaving(false);
  };

  const handleSavePricing = async () => {
    const upsert = async (key: string, val: number) => {
      const { data } = await supabase.from("system_settings").select("id").eq("setting_key", key).maybeSingle();
      if (data) {
        await supabase.from("system_settings").update({ setting_value: String(val), updated_by: user!.id }).eq("setting_key", key);
      } else {
        await supabase.from("system_settings").insert({ setting_key: key, setting_value: String(val), updated_by: user!.id });
      }
    };
    await Promise.all([
      upsert("economy_bottle_price", economyPrice),
      upsert("executive_bottle_price", executivePrice),
    ]);
    toast.success("Pricing updated!");
  };

  // Analytics
  const totalProduced = records.reduce((s, r) => s + r.total_bottles, 0);
  const totalFaulty = records.reduce((s, r) => s + r.faulty_bottles, 0);
  const totalGood = records.reduce((s, r) => s + r.good_bottles, 0);
  const efficiencyRate = totalProduced > 0 ? ((totalGood / totalProduced) * 100).toFixed(1) : "0";

  const chartData = records.slice(0, 10).reverse().map(r => ({
    date: format(new Date(r.production_date), "dd MMM"),
    Good: r.good_bottles,
    Faulty: r.faulty_bottles,
  }));

  if (!canAccess) {
    return <div className="p-6 text-center text-muted-foreground">You don't have permission to access Production.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Factory className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Production</h1>
          <p className="text-sm text-muted-foreground">Bottling calculator with data persistence & analytics</p>
        </div>
      </div>

      {/* Analytics Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{totalProduced.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Total Produced</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-success">{totalGood.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Good Bottles</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-destructive">{totalFaulty.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Faulty/Rejected</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-primary">{efficiencyRate}%</p>
          <p className="text-xs text-muted-foreground">Efficiency Rate</p>
        </CardContent></Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Input */}
        <Card>
          <CardHeader><CardTitle className="text-base">New Production Run</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Number of Bales Received</Label>
              <Input type="number" min={0} value={bales || ""} onChange={e => setBales(Number(e.target.value))} placeholder="e.g. 10" />
              <p className="text-xs text-muted-foreground mt-1">1 bale = {bottlesPerBale} bottles</p>
            </div>
            <div>
              <Label>Faulty / Reject Bottles</Label>
              <Input type="number" min={0} value={faultyBottles || ""} onChange={e => setFaultyBottles(Number(e.target.value))} placeholder="e.g. 5" />
            </div>
            <div>
              <Label>Economy Allocation (%)</Label>
              <Input type="number" min={0} max={100} value={economyAllocation} onChange={e => setEconomyAllocation(Math.min(100, Math.max(0, Number(e.target.value))))} />
              <p className="text-xs text-muted-foreground mt-1">Remaining {100 - economyAllocation}% → Executive</p>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes about this batch..." />
            </div>

            {bales > 0 && (
              <Card className="bg-muted/50">
                <CardContent className="p-3 space-y-2 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div><span className="text-muted-foreground">Total:</span> <strong>{totalBottles}</strong></div>
                    <div><span className="text-muted-foreground">Good:</span> <strong className="text-success">{goodBottles}</strong></div>
                  </div>
                  {faultyBottles > 0 && (
                    <div className="flex items-center gap-1 text-destructive text-xs">
                      <AlertTriangle className="h-3 w-3" /> {faultyBottles} faulty excluded
                    </div>
                  )}
                  <div className="border-t pt-2 space-y-1">
                    <div className="flex justify-between"><span>Economy Packs</span><Badge variant="secondary">{economyPacks}</Badge></div>
                    <div className="flex justify-between"><span>Executive Packs</span><Badge variant="secondary">{executivePacks}</Badge></div>
                    <div className="flex justify-between"><span>Loose Bottles</span><Badge variant="outline">{looseBottles}</Badge></div>
                  </div>
                  <div className="border-t pt-2 font-semibold flex justify-between">
                    <span>Expected Revenue</span>
                    <span className="text-success">KSh {expectedRevenue.toLocaleString()}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            <Button onClick={handleSave} className="w-full gap-2" disabled={bales <= 0 || saving}>
              <Save className="h-4 w-4" /> Save Production Record
            </Button>
          </CardContent>
        </Card>

        {/* Pricing Config (admin only) */}
        <div className="space-y-6">
          {isAdmin && (
            <Card>
              <CardHeader><CardTitle className="text-base">Pricing Configuration</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Economy Price/Bottle (KSh)</Label>
                    <Input type="number" min={0} value={economyPrice} onChange={e => setEconomyPrice(Number(e.target.value))} />
                  </div>
                  <div>
                    <Label>Executive Price/Bottle (KSh)</Label>
                    <Input type="number" min={0} value={executivePrice} onChange={e => setExecutivePrice(Number(e.target.value))} />
                  </div>
                </div>
                <Button variant="outline" onClick={handleSavePricing} className="w-full">Save Pricing</Button>
              </CardContent>
            </Card>
          )}

          {/* Chart */}
          {chartData.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Production History</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip />
                    <Bar dataKey="Good" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Faulty" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} opacity={0.6} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Recent Records Table */}
      {records.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold">Recent Production Records</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-3">Date</th>
                    <th className="text-right py-2 px-2">Bales</th>
                    <th className="text-right py-2 px-2">Total</th>
                    <th className="text-right py-2 px-2">Good</th>
                    <th className="text-right py-2 px-2">Faulty</th>
                    <th className="text-right py-2 px-2">Eco Packs</th>
                    <th className="text-right py-2 px-2">Exec Packs</th>
                    <th className="text-right py-2 pl-2">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {records.slice(0, 15).map(r => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{format(new Date(r.production_date), "dd MMM yyyy")}</td>
                      <td className="text-right py-2 px-2">{r.bales}</td>
                      <td className="text-right py-2 px-2">{r.total_bottles}</td>
                      <td className="text-right py-2 px-2 text-success">{r.good_bottles}</td>
                      <td className="text-right py-2 px-2 text-destructive">{r.faulty_bottles}</td>
                      <td className="text-right py-2 px-2">{r.economy_packs}</td>
                      <td className="text-right py-2 px-2">{r.executive_packs}</td>
                      <td className="text-right py-2 pl-2 font-medium">KSh {r.expected_revenue.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
