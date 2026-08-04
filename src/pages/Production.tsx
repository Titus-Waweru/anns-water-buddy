import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Factory, AlertTriangle, CheckCircle, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface BottleSpec {
  id: string;
  category: string;
  bottle_size: string;
  display_name: string;
  bottles_per_bale: number | null;
  is_active: boolean;
}

interface RawInventory {
  id: string;
  bottle_specification_id: string;
  branch_id: string | null;
  quantity_bottles: number;
}

interface Product {
  id: string;
  name: string;
  bottle_size: string;
  quantity: number;
  branch_id: string | null;
  bottle_specification_id: string | null;
}

interface ProductionRecord {
  id: string;
  production_date: string;
  branch_id: string | null;
  raw_bottle_specification_id: string | null;
  finished_product_id: string | null;
  total_bottles: number;
  faulty_bottles: number;
  good_bottles: number;
  raw_bottles_consumed: number | null;
  good_bottles_created: number | null;
  notes: string | null;
  created_at: string;
}

interface Branch {
  id: string;
  name: string;
  is_active: boolean;
  is_factory: boolean;
}

export default function Production() {
  const { hasRole, isAdmin, user, branchId } = useAuth();
  const canAccess = isAdmin || hasRole("stock_manager");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [specs, setSpecs] = useState<BottleSpec[]>([]);
  const [inventory, setInventory] = useState<RawInventory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [records, setRecords] = useState<ProductionRecord[]>([]);

  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [selectedSpecId, setSelectedSpecId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantityProcessed, setQuantityProcessed] = useState(0);
  const [faultyBottles, setFaultyBottles] = useState(0);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const selectedSpec = specs.find(s => s.id === selectedSpecId);
  const selectedProduct = products.find(p => p.id === selectedProductId);
  const goodBottles = Math.max(0, quantityProcessed - faultyBottles);

  // Raw stock for the chosen specification at the chosen branch
  const invRecord = inventory.find(
    i => i.bottle_specification_id === selectedSpecId && i.branch_id === selectedBranchId
  );
  const availableQty = invRecord?.quantity_bottles ?? 0;
  const isSufficient =
    selectedSpecId && selectedBranchId ? quantityProcessed <= availableQty : true;

  // Only finished goods mapped to the same specification AND branch can be produced —
  // this mirrors the database rule so the UI never offers an invalid combination.
  const matchingProducts = useMemo(
    () =>
      selectedSpecId && selectedBranchId
        ? products.filter(
            p => p.bottle_specification_id === selectedSpecId && p.branch_id === selectedBranchId
          )
        : [],
    [products, selectedSpecId, selectedBranchId]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [branchRes, specRes, invRes, prodRes, recRes] = await Promise.all([
      supabase.from("branches").select("id, name, is_active, is_factory").eq("is_active", true).order("name"),
      supabase.from("bottle_specifications").select("*").eq("is_active", true).order("category").order("bottle_size"),
      supabase.from("raw_bottle_inventory").select("id, branch_id, bottle_specification_id, quantity_bottles"),
      supabase.from("products").select("id, name, bottle_size, quantity, branch_id, bottle_specification_id").order("name"),
      supabase.from("production_records").select("*").order("production_date", { ascending: false }).order("created_at", { ascending: false }).limit(50),
    ]);
    if (branchRes.data) setBranches(branchRes.data as Branch[]);
    if (specRes.data) setSpecs(specRes.data as BottleSpec[]);
    if (invRes.data) setInventory(invRes.data as RawInventory[]);
    if (prodRes.data) setProducts(prodRes.data as Product[]);
    if (recRes.data) setRecords(recRes.data as unknown as ProductionRecord[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Default to the user's own branch (or the factory) so stock managers cannot pick the wrong site by accident.
  useEffect(() => {
    if (selectedBranchId || branches.length === 0) return;
    const preferred = branches.find(b => b.id === branchId) || branches.find(b => b.is_factory);
    if (preferred) setSelectedBranchId(preferred.id);
  }, [branches, branchId, selectedBranchId]);

  // Auto-select the finished product when exactly one valid mapping exists
  useEffect(() => {
    setSelectedProductId(matchingProducts.length === 1 ? matchingProducts[0].id : "");
  }, [matchingProducts]);

  const handleSave = async () => {
    if (!selectedBranchId) { toast.error("Select a branch"); return; }
    if (!selectedSpecId) { toast.error("Select a bottle specification"); return; }
    if (!selectedProductId) { toast.error("Select the matching finished product"); return; }
    if (!Number.isInteger(quantityProcessed) || quantityProcessed <= 0) { toast.error("Enter a whole number of bottles processed"); return; }
    if (!Number.isInteger(faultyBottles) || faultyBottles < 0) { toast.error("Faulty bottles must be zero or a whole number"); return; }
    if (faultyBottles > quantityProcessed) { toast.error("Faulty bottles cannot exceed processed quantity"); return; }
    if (goodBottles <= 0) { toast.error("A production run must yield at least one good bottle"); return; }
    if (!isSufficient) {
      toast.error(`Insufficient raw bottles. Available: ${availableQty}, required: ${quantityProcessed}`);
      return;
    }
    if (saving) return;

    setSaving(true);
    try {
      // Every stock movement (raw consumption, breakage log, finished-goods addition,
      // inventory log and the batch record) is committed atomically inside this function.
      const { error } = await supabase.rpc("record_bottle_production", {
        p_bottle_specification_id: selectedSpecId,
        p_finished_product_id: selectedProductId,
        p_processed: quantityProcessed,
        p_faulty: faultyBottles,
        p_branch_id: selectedBranchId,
        p_recorded_by: user!.id,
        p_notes: notes.trim() || `${selectedSpec?.display_name} → ${selectedProduct?.name}`,
      });

      if (error) throw new Error(error.message);

      toast.success(`Production recorded: ${goodBottles} good bottles from ${quantityProcessed} processed`);
      setSelectedSpecId("");
      setSelectedProductId("");
      setQuantityProcessed(0);
      setFaultyBottles(0);
      setNotes("");
      await fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to save production record");
    } finally {
      setSaving(false);
    }
  };

  if (!canAccess) {
    return <div className="p-6 text-center text-muted-foreground">You don't have permission to access Production.</div>;
  }

  const specName = (id: string | null) => specs.find(s => s.id === id)?.display_name;
  const productName = (id: string | null) => products.find(p => p.id === id)?.name;
  const branchName = (id: string | null) => branches.find(b => b.id === id)?.name;
  const balesUsed = selectedSpec?.bottles_per_bale
    ? (quantityProcessed / selectedSpec.bottles_per_bale).toFixed(2)
    : null;

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
          <Card>
            <CardHeader><CardTitle className="text-base">New Production Run</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Branch *</Label>
                <Select
                  value={selectedBranchId}
                  onValueChange={v => { setSelectedBranchId(v); setSelectedProductId(""); }}
                  disabled={!isAdmin && !!branchId}
                >
                  <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent>
                    {branches.map(b => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}{b.is_factory ? " (Factory)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Bottle Specification *</Label>
                <Select value={selectedSpecId} onValueChange={v => { setSelectedSpecId(v); setSelectedProductId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Select specification" /></SelectTrigger>
                  <SelectContent>
                    {specs.map(s => {
                      const stock = inventory.find(
                        i => i.bottle_specification_id === s.id && i.branch_id === selectedBranchId
                      )?.quantity_bottles ?? 0;
                      return (
                        <SelectItem key={s.id} value={s.id}>
                          {s.display_name} — {stock.toLocaleString()} raw in stock
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

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
                  </SelectContent>
                </Select>
                {selectedSpecId && matchingProducts.length === 0 && (
                  <p className="text-xs text-destructive mt-1">
                    No finished product at this branch is linked to "{selectedSpec?.display_name}".
                    Link one in Inventory before producing.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Bottles Processed *</Label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={quantityProcessed || ""}
                    onChange={e => setQuantityProcessed(Math.floor(Number(e.target.value) || 0))}
                    placeholder="e.g. 900"
                  />
                </div>
                <div>
                  <Label>Faulty / Broken</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    max={quantityProcessed || undefined}
                    value={faultyBottles || ""}
                    onChange={e => setFaultyBottles(Math.floor(Number(e.target.value) || 0))}
                    placeholder="e.g. 5"
                  />
                </div>
              </div>

              <div>
                <Label>Batch Notes</Label>
                <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Shift, operator, batch reference…" />
              </div>

              {quantityProcessed > 0 && (
                <Card className="bg-muted/50">
                  <CardContent className="p-3 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Raw bottles consumed</span>
                      <strong>{quantityProcessed.toLocaleString()}</strong>
                    </div>
                    {faultyBottles > 0 && (
                      <div className="flex justify-between text-destructive">
                        <span>Faulty / breakage</span>
                        <strong>-{faultyBottles.toLocaleString()}</strong>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-success border-t pt-2">
                      <span>Good bottles into stock</span>
                      <strong>{goodBottles.toLocaleString()}</strong>
                    </div>
                    {balesUsed && (
                      <div className="flex justify-between text-xs text-muted-foreground border-t pt-2">
                        <span>Equivalent bales ({selectedSpec?.bottles_per_bale}/bale)</span>
                        <span>{balesUsed}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Yield</span>
                      <span>{((goodBottles / quantityProcessed) * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Raw stock after run</span>
                      <span>{Math.max(0, availableQty - quantityProcessed).toLocaleString()}</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {selectedSpecId && selectedBranchId && quantityProcessed > 0 && (
                <div className={`flex items-center gap-2 text-sm ${isSufficient ? "text-success" : "text-destructive"}`}>
                  {isSufficient ? (
                    <><CheckCircle className="h-4 w-4" /> Available: {availableQty.toLocaleString()} raw bottles</>
                  ) : (
                    <><AlertTriangle className="h-4 w-4" /> Insufficient! Available: {availableQty.toLocaleString()}, required: {quantityProcessed.toLocaleString()}</>
                  )}
                </div>
              )}

              <Button
                onClick={handleSave}
                className="w-full gap-2"
                disabled={!selectedBranchId || !selectedSpecId || !selectedProductId || quantityProcessed <= 0 || goodBottles <= 0 || !isSufficient || saving}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Production Record
              </Button>
            </CardContent>
          </Card>

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
                        <div className="flex justify-between gap-2">
                          <span className="font-medium truncate">
                            {specName(r.raw_bottle_specification_id) || "Raw bottles"} → {productName(r.finished_product_id) || "Finished product"}
                          </span>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {format(new Date(r.production_date), "dd MMM yyyy")}
                          </span>
                        </div>
                        <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
                          <span>Processed: <strong>{r.raw_bottles_consumed ?? r.total_bottles}</strong></span>
                          <span>Good: <strong className="text-success">{r.good_bottles_created ?? r.good_bottles}</strong></span>
                          {r.faulty_bottles > 0 && <span>Faulty: <strong className="text-destructive">{r.faulty_bottles}</strong></span>}
                          {branchName(r.branch_id) && <span>{branchName(r.branch_id)}</span>}
                        </div>
                        <p className="text-[11px] text-muted-foreground font-mono">Batch {r.id.slice(0, 8).toUpperCase()}</p>
                        {r.notes && <p className="text-xs text-muted-foreground">{r.notes}</p>}
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
