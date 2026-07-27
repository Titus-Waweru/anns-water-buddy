import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Factory, FlaskConical, Package, AlertTriangle, CheckCircle, Loader2, Save } from "lucide-react";
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
  specification_id: string;
  branch_id: string | null;
  quantity: number;
  average_cost: number;
}

interface Product {
  id: string;
  name: string;
  bottle_size: string;
  quantity: number;
  packs: number;
  bales: number;
  faulty_bottles: number;
  branch_id: string | null;
}

interface ProductionRecord {
  id: string;
  production_date: string;
  specification_id: string | null;
  product_id: string | null;
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

interface Branch {
  id: string;
  name: string;
  is_active: boolean;
}

export default function Production() {
  const { hasRole, isAdmin, user, branchId } = useAuth();
  const canAccess = isAdmin || hasRole("stock_manager");

  // Data
  const [branches, setBranches] = useState<Branch[]>([]);
  const [specs, setSpecs] = useState<BottleSpec[]>([]);
  const [inventory, setInventory] = useState<RawInventory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [records, setRecords] = useState<ProductionRecord[]>([]);

  // Form state
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [selectedSpecId, setSelectedSpecId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantityProcessed, setQuantityProcessed] = useState(0);
  const [faultyBottles, setFaultyBottles] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Derived values
  const selectedSpec = specs.find(s => s.id === selectedSpecId);
  const selectedProduct = products.find(p => p.id === selectedProductId);
  const goodBottles = Math.max(0, quantityProcessed - faultyBottles);

  // Find matching inventory record for selected spec + branch
  const invRecord = inventory.find(
    i => i.specification_id === selectedSpecId && i.branch_id === selectedBranchId
  );
  const availableQty = invRecord?.quantity || 0;
  const isSufficient = selectedSpecId && selectedBranchId ? quantityProcessed <= availableQty : true;

  // Filter products that match the selected bottle spec by display_name
  const matchingProducts = selectedSpec
    ? products.filter(p => p.name === selectedSpec.display_name)
    : [];

  // Fetch all data
  const fetchData = useCallback(async () => {
    setLoading(true);
    const [branchRes, specRes, invRes, prodRes, recRes] = await Promise.all([
      (supabase as any).from("branches").select("*").eq("is_active", true).order("name"),
      (supabase as any).from("bottle_specifications").select("*").eq("is_active", true).order("category").order("bottle_size"),
      (supabase as any).from("raw_bottle_inventory").select("*"),
      (supabase as any).from("products").select("*").order("name"),
      (supabase as any).from("production_records").select("*").order("production_date", { ascending: false }).limit(50),
    ]);
    if (branchRes.data) {
      // Filter to Factory/Main Branch only for production
      const productionBranches = (branchRes.data as Branch[]).filter(
        b => b.name.toLowerCase().includes("factory") || b.name.toLowerCase().includes("main")
      );
      setBranches(productionBranches);
    }
    if (specRes.data) setSpecs(specRes.data as BottleSpec[]);
    if (invRes.data) setInventory(invRes.data as RawInventory[]);
    if (prodRes.data) setProducts(prodRes.data as Product[]);
    if (recRes.data) setRecords(recRes.data as ProductionRecord[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-select product when spec changes
  useEffect(() => {
    if (matchingProducts.length === 1) {
      setSelectedProductId(matchingProducts[0].id);
    } else {
      setSelectedProductId("");
    }
  }, [selectedSpecId, products]);

  const handleSave = async () => {
    // Validations
    if (!selectedBranchId) { toast.error("Select a branch"); return; }
    if (!selectedSpecId) { toast.error("Select a bottle specification"); return; }
    if (!selectedProductId) { toast.error("Select the matching finished product"); return; }
    if (quantityProcessed <= 0) { toast.error("Enter quantity processed"); return; }
    if (faultyBottles < 0) { toast.error("Faulty bottles cannot be negative"); return; }
    if (faultyBottles > quantityProcessed) { toast.error("Faulty bottles cannot exceed processed quantity"); return; }
    if (!isSufficient) {
      toast.error(`Insufficient raw inventory. Available: ${availableQty}, Required: ${quantityProcessed}`);
      return;
    }

    setSaving(true);
    try {
      const specName = selectedSpec!.display_name;
      const prodName = selectedProduct!.name;
      const balesUsed = selectedSpec!.bottles_per_bale > 0
        ? Math.floor(quantityProcessed / selectedSpec!.bottles_per_bale)
        : 0;

      // Execute all stock changes atomically via the database function
      const { data: productionId, error: rpcErr } = await (supabase as any).rpc("process_production", {
        p_specification_id: selectedSpecId,
        p_product_id: selectedProductId,
        p_branch_id: selectedBranchId,
        p_quantity_processed: quantityProcessed,
        p_faulty_bottles: faultyBottles,
        p_good_bottles: goodBottles,
        p_bales: balesUsed,
        p_spec_name: specName,
        p_prod_name: prodName,
        p_recorded_by: user!.id,
        p_notes: `Spec: ${specName}, Product: ${prodName}`,
      });

      if (rpcErr) throw new Error(rpcErr.message);

      toast.success(`Production recorded: ${goodBottles} good bottles from ${quantityProcessed} processed`);
      setSelectedSpecId("");
      setSelectedProductId("");
      setQuantityProcessed(0);
      setFaultyBottles(0);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to save production record");
    }
    setSaving(false);
  };

  if (!canAccess) {
    return <div className="p-6 text-center text-muted-foreground">You don't have permission to access Production.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Factory className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Production</h1>
          <p className="text-sm text-muted-foreground">Convert raw bottles into finished products</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Production Form */}
          <Card>
            <CardHeader><CardTitle className="text-base">New Production Run</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {/* Branch Selection */}
              <div>
                <Label>Branch *</Label>
                <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
                  <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent>
                    {branches.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Bottle Specification */}
              <div>
                <Label>Bottle Specification *</Label>
                <Select value={selectedSpecId} onValueChange={v => { setSelectedSpecId(v); setSelectedProductId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Select specification" /></SelectTrigger>
                  <SelectContent>
                    {specs.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.display_name} ({s.bottles_per_bale} per bale)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Finished Product */}
              <div>
                <Label>Finished Product *</Label>
                <Select value={selectedProductId} onValueChange={setSelectedProductId} disabled={!selectedSpecId}>
                  <SelectTrigger>
                    <SelectValue placeholder={selectedSpecId ? "Select matching product" : "Select a spec first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {matchingProducts.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} (Stock: {p.quantity})
                      </SelectItem>
                    ))}
                    {selectedSpecId && matchingProducts.length === 0 && (
                      <div className="px-2 py-1 text-xs text-muted-foreground">No matching products found</div>
                    )}
                  </SelectContent>
                </Select>
                {selectedSpecId && matchingProducts.length === 0 && (
                  <p className="text-xs text-destructive mt-1">
                    No finished product named "{selectedSpec?.display_name}" found. Create it in Inventory first.
                  </p>
                )}
              </div>

              {/* Quantity Processed */}
              <div>
                <Label>Quantity Processed (bottles) *</Label>
                <Input
                  type="number"
                  min={0}
                  value={quantityProcessed || ""}
                  onChange={e => setQuantityProcessed(Number(e.target.value))}
                  placeholder="e.g. 900"
                />
              </div>

              {/* Faulty / Broken Bottles */}
              <div>
                <Label>Faulty / Broken Bottles</Label>
                <Input
                  type="number"
                  min={0}
                  value={faultyBottles || ""}
                  onChange={e => setFaultyBottles(Number(e.target.value))}
                  placeholder="e.g. 5"
                />
              </div>

              {/* Summary */}
              {quantityProcessed > 0 && (
                <Card className="bg-muted/50">
                  <CardContent className="p-3 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Processed</span>
                      <strong>{quantityProcessed.toLocaleString()}</strong>
                    </div>
                    {faultyBottles > 0 && (
                      <div className="flex justify-between text-destructive">
                        <span>Faulty</span>
                        <strong>-{faultyBottles.toLocaleString()}</strong>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-success border-t pt-2">
                      <span>Good Bottles</span>
                      <strong>{goodBottles.toLocaleString()}</strong>
                    </div>
                    {selectedSpec && (
                      <div className="flex justify-between text-xs text-muted-foreground border-t pt-2">
                        <span>Bales consumed</span>
                        <span>{Math.floor(quantityProcessed / selectedSpec.bottles_per_bale)}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Inventory Validation */}
              {selectedSpecId && selectedBranchId && quantityProcessed > 0 && (
                <div className={`flex items-center gap-2 text-sm ${isSufficient ? "text-success" : "text-destructive"}`}>
                  {isSufficient ? (
                    <><CheckCircle className="h-4 w-4" /> Available: {availableQty.toLocaleString()} bottles</>
                  ) : (
                    <><AlertTriangle className="h-4 w-4" /> Insufficient! Available: {availableQty.toLocaleString()}, Required: {quantityProcessed.toLocaleString()}</>
                  )}
                </div>
              )}

              <Button
                onClick={handleSave}
                className="w-full gap-2"
                disabled={!selectedBranchId || !selectedSpecId || !selectedProductId || quantityProcessed <= 0 || !isSufficient || saving}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Production Record
              </Button>
            </CardContent>
          </Card>

          {/* Recent Records */}
          <Card>
            <CardHeader><CardTitle className="text-base">Recent Production Records</CardTitle></CardHeader>
            <CardContent>
              {records.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No production records yet.</p>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {records.map(r => (
                    <Card key={r.id} className="border-l-4 border-l-primary">
                      <CardContent className="p-3 text-sm space-y-1">
                        <div className="flex justify-between">
                          <span className="font-medium">{r.notes || "Production Run"}</span>
                          <span className="text-xs text-muted-foreground">{format(new Date(r.production_date), "dd MMM yyyy")}</span>
                        </div>
                        <div className="flex gap-3 text-xs text-muted-foreground">
                          <span>Processed: <strong>{r.total_bottles}</strong></span>
                          <span>Good: <strong className="text-success">{r.good_bottles}</strong></span>
                          {r.faulty_bottles > 0 && <span>Faulty: <strong className="text-destructive">{r.faulty_bottles}</strong></span>}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
