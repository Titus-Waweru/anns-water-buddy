import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useData } from "@/context/DataContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, FlaskConical, Settings, Save } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface BottleSpec {
  id: string;
  category: string;
  bottle_size: string;
  display_name: string;
  bottles_per_bale: number;
  is_active: boolean;
}

interface RawInventory {
  id: string;
  bottle_specification_id: string;
  branch_id: string | null;
  quantity_bottles: number;
}

interface RawLog {
  id: string;
  movement_type: string;
  quantity_bottles: number;
  reference: string | null;
  created_at: string;
}

export default function RawBottleInventory() {
  const { isAdmin, hasRole } = useAuth();
  const { effectiveBranchId } = useData();
  const canManage = isAdmin || hasRole("stock_manager");

  const [specs, setSpecs] = useState<BottleSpec[]>([]);
  const [inventory, setInventory] = useState<RawInventory[]>([]);
  const [logs, setLogs] = useState<RawLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Config dialog state
  const [configOpen, setConfigOpen] = useState(false);
  const [configSpecs, setConfigSpecs] = useState<Record<string, number>>({});
  const [savingConfig, setSavingConfig] = useState(false);

  const fetchData = useCallback(async () => {
    if (!effectiveBranchId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [specRes, invRes, logRes] = await Promise.all([
      (supabase as any).from("bottle_specifications").select("*").order("category").order("bottle_size"),
      (supabase as any).from("raw_bottle_inventory").select("*").eq("branch_id", effectiveBranchId),
      (supabase as any).from("raw_bottle_inventory_logs").select("*").eq("branch_id", effectiveBranchId).order("created_at", { ascending: false }).limit(50),
    ]);
    if (specRes.data) setSpecs(specRes.data as unknown as BottleSpec[]);
    if (invRes.data) setInventory(invRes.data as unknown as RawInventory[]);
    if (logRes.data) setLogs(logRes.data as unknown as RawLog[]);
    setLoading(false);
  }, [effectiveBranchId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Build a map of spec_id -> inventory record
  const invMap = new Map(inventory.map(i => [i.bottle_specification_id, i]));

  // Open config dialog and populate with current values
  const openConfig = () => {
    const map: Record<string, number> = {};
    specs.forEach(s => { map[s.id] = s.bottles_per_bale; });
    setConfigSpecs(map);
    setConfigOpen(true);
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      for (const [specId, bales] of Object.entries(configSpecs)) {
        if (bales < 1) continue;
        await (supabase as any).from("bottle_specifications").update({ bottles_per_bale: bales }).eq("id", specId);
      }
      toast.success("Bottle specifications updated!");
      setConfigOpen(false);
      fetchData();
    } catch {
      toast.error("Failed to update specifications");
    }
    setSavingConfig(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FlaskConical className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Raw Bottle Inventory</h1>
            <p className="text-sm text-muted-foreground">Track empty bottle stock for production</p>
          </div>
        </div>
        {canManage && (
          <Button variant="outline" size="sm" className="gap-2" onClick={openConfig}>
            <Settings className="h-4 w-4" /> Configure Specs
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <>
          {/* Inventory Cards */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {specs.filter(s => s.is_active).map(spec => {
              const inv = invMap.get(spec.id);
              const qty = inv?.quantity_bottles || 0;
              return (
                <Card key={spec.id} className={qty === 0 ? "border-destructive/30" : ""}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-foreground">{spec.display_name}</p>
                      <Badge variant={spec.category === "executive" ? "default" : "secondary"} className="text-[10px]">
                        {spec.category === "executive" ? "Executive" : "Economy"}
                      </Badge>
                    </div>
                    <div className="text-3xl font-bold text-foreground">{qty.toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground">bottles available</p>
                    <div className="flex justify-between text-xs text-muted-foreground border-t pt-2">
                      <span>{spec.bottles_per_bale} / bale</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Inventory Logs */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Raw Bottle Movement History</CardTitle>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No raw bottle movements yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Bottles</TableHead>
                        <TableHead>Reference</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map(log => (
                        <TableRow key={log.id}>
                          <TableCell className="text-xs">{format(new Date(log.created_at), "dd MMM yyyy HH:mm")}</TableCell>
                          <TableCell>
                            <Badge variant={log.movement_type === "PURCHASE" ? "default" : "destructive"} className={log.movement_type === "PURCHASE" ? "bg-success" : ""}>
                              {log.movement_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{log.quantity_bottles.toLocaleString()}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{log.reference || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Configuration Dialog */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bottle Specification Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Configure how many bottles are in each bale for each specification.
            </p>
            {specs.filter(s => s.is_active).map(spec => (
              <div key={spec.id} className="flex items-center justify-between gap-3">
                <Label className="flex-1">{spec.display_name}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    className="w-24 text-center"
                    value={configSpecs[spec.id] ?? spec.bottles_per_bale}
                    onChange={e => setConfigSpecs(prev => ({ ...prev, [spec.id]: Number(e.target.value) }))}
                  />
                  <span className="text-xs text-muted-foreground">bottles/bale</span>
                </div>
              </div>
            ))}
            <Button onClick={handleSaveConfig} disabled={savingConfig} className="w-full gap-2">
              {savingConfig ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Settings
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
