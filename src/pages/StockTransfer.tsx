import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRightLeft, AlertTriangle, CheckCircle, Loader2, Send, Building, Package } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Branch {
  id: string;
  name: string;
  is_active: boolean;
}

interface Product {
  id: string;
  name: string;
  bottle_size: string;
  quantity: number;
  branch_id: string | null;
}

interface TransferRecord {
  id: string;
  product_name: string;
  quantity: number;
  source_branch_id: string;
  destination_branch_id: string;
  transferred_by: string;
  notes: string | null;
  created_at: string;
}

export default function StockTransfer() {
  const { hasRole, isAdmin, user } = useAuth();
  const canAccess = isAdmin || hasRole("stock_manager");

  // Data
  const [branches, setBranches] = useState<Branch[]>([]);
  const [factoryBranch, setFactoryBranch] = useState<Branch | null>(null);
  const [destinationBranches, setDestinationBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);

  // Form state
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [selectedDestId, setSelectedDestId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState(0);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Derived values
  const selectedProduct = products.find(p => p.id === selectedProductId);
  const availableQty = selectedProduct?.quantity || 0;
  const isSufficient = selectedProductId ? quantity <= availableQty : true;
  const isValid = selectedSourceId && selectedDestId && selectedProductId && quantity > 0 && isSufficient && selectedSourceId !== selectedDestId;

  // Fetch all data
  const fetchData = useCallback(async () => {
    setLoading(true);
    const [branchRes, prodRes, transferRes] = await Promise.all([
      (supabase as any).from("branches").select("*").eq("is_active", true).order("name"),
      (supabase as any).from("products").select("*").order("name"),
      (supabase as any).from("stock_transfers").select("*").order("created_at", { ascending: false }).limit(50),
    ]);

    if (branchRes.data) {
      const allBranches = branchRes.data as Branch[];
      // Find Factory/Main Branch as source
      const factory = allBranches.find(
        b => b.name.toLowerCase().includes("factory") || b.name.toLowerCase().includes("main")
      );
      setFactoryBranch(factory || null);
      // Destination branches are all non-factory branches
      setDestinationBranches(
        allBranches.filter(
          b => !(b.name.toLowerCase().includes("factory") || b.name.toLowerCase().includes("main"))
        )
      );
      setBranches(allBranches);
    }
    if (prodRes.data) setProducts(prodRes.data as Product[]);
    if (transferRes.data) setTransfers(transferRes.data as TransferRecord[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-select factory branch as source
  useEffect(() => {
    if (factoryBranch) {
      setSelectedSourceId(factoryBranch.id);
    }
  }, [factoryBranch]);

  // Filter products available in the source branch
  const sourceProducts = selectedSourceId
    ? products.filter(p => p.branch_id === selectedSourceId && p.quantity > 0)
    : [];

  const handleSave = async () => {
    if (!selectedSourceId) { toast.error("Select source branch"); return; }
    if (!selectedDestId) { toast.error("Select destination branch"); return; }
    if (selectedSourceId === selectedDestId) { toast.error("Source and destination branches cannot be the same"); return; }
    if (!selectedProductId) { toast.error("Select a product to transfer"); return; }
    if (quantity <= 0) { toast.error("Enter quantity to transfer"); return; }
    if (!isSufficient) {
      toast.error(`Insufficient stock. Available: ${availableQty}, Required: ${quantity}`);
      return;
    }

    setSaving(true);
    try {
      const prodName = selectedProduct!.name;

      const { data: transferId, error: rpcErr } = await (supabase as any).rpc("process_stock_transfer", {
        p_product_id: selectedProductId,
        p_product_name: prodName,
        p_quantity: quantity,
        p_source_branch_id: selectedSourceId,
        p_destination_branch_id: selectedDestId,
        p_transferred_by: user!.id,
        p_notes: notes || `Transfer of ${prodName}`,
      });

      if (rpcErr) throw new Error(rpcErr.message);

      toast.success(`Transferred ${quantity} × ${prodName} successfully`);
      setSelectedProductId("");
      setQuantity(0);
      setNotes("");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to process transfer");
    }
    setSaving(false);
  };

  if (!canAccess) {
    return <div className="p-6 text-center text-muted-foreground">You don't have permission to access Stock Transfers.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ArrowRightLeft className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Stock Transfer</h1>
          <p className="text-sm text-muted-foreground">Distribute finished products from Factory to branches</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Transfer Form */}
          <Card>
            <CardHeader><CardTitle className="text-base">New Transfer</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {/* Source Branch (Factory) */}
              <div>
                <Label>Source Branch (Factory) *</Label>
                <Select value={selectedSourceId} onValueChange={setSelectedSourceId}>
                  <SelectTrigger><SelectValue placeholder="Select source branch" /></SelectTrigger>
                  <SelectContent>
                    {branches.filter(b => b.name.toLowerCase().includes("factory") || b.name.toLowerCase().includes("main")).map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Destination Branch */}
              <div>
                <Label>Destination Branch *</Label>
                <Select value={selectedDestId} onValueChange={v => { setSelectedDestId(v); setSelectedProductId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Select destination branch" /></SelectTrigger>
                  <SelectContent>
                    {destinationBranches.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Product Selection */}
              <div>
                <Label>Product *</Label>
                <Select value={selectedProductId} onValueChange={setSelectedProductId} disabled={!selectedSourceId}>
                  <SelectTrigger>
                    <SelectValue placeholder={selectedSourceId ? "Select product" : "Select source first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceProducts.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.bottle_size}) — Stock: {p.quantity}
                      </SelectItem>
                    ))}
                    {selectedSourceId && sourceProducts.length === 0 && (
                      <div className="px-2 py-1 text-xs text-muted-foreground">No products available in source branch</div>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Quantity */}
              <div>
                <Label>Quantity *</Label>
                <Input
                  type="number"
                  min={0}
                  value={quantity || ""}
                  onChange={e => setQuantity(Number(e.target.value))}
                  placeholder="e.g. 100"
                />
              </div>

              {/* Notes */}
              <div>
                <Label>Notes (optional)</Label>
                <Input
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. Monthly distribution to outlet"
                />
              </div>

              {/* Validation Summary */}
              {selectedSourceId && selectedDestId && selectedSourceId === selectedDestId && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4" /> Source and destination must be different
                </div>
              )}

              {selectedProductId && quantity > 0 && (
                <div className={`flex items-center gap-2 text-sm ${isSufficient ? "text-success" : "text-destructive"}`}>
                  {isSufficient ? (
                    <><CheckCircle className="h-4 w-4" /> Available: {availableQty.toLocaleString()} units</>
                  ) : (
                    <><AlertTriangle className="h-4 w-4" /> Insufficient! Available: {availableQty.toLocaleString()}, Required: {quantity.toLocaleString()}</>
                  )}
                </div>
              )}

              {/* Summary Card */}
              {selectedProductId && quantity > 0 && isSufficient && selectedSourceId !== selectedDestId && (
                <Card className="bg-muted/50">
                  <CardContent className="p-3 space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Building className="h-4 w-4 text-muted-foreground" />
                      <span>{branches.find(b => b.id === selectedSourceId)?.name} → {branches.find(b => b.id === selectedDestId)?.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedProduct?.name} × {quantity.toLocaleString()}</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Button
                onClick={handleSave}
                className="w-full gap-2"
                disabled={!isValid || saving}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Process Transfer
              </Button>
            </CardContent>
          </Card>

          {/* Recent Transfers */}
          <Card>
            <CardHeader><CardTitle className="text-base">Recent Transfers</CardTitle></CardHeader>
            <CardContent>
              {transfers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No transfers recorded yet.</p>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {transfers.map(t => {
                    const srcBranch = branches.find(b => b.id === t.source_branch_id);
                    const destBranch = branches.find(b => b.id === t.destination_branch_id);
                    return (
                      <Card key={t.id} className="border-l-4 border-l-primary">
                        <CardContent className="p-3 text-sm space-y-1">
                          <div className="flex justify-between">
                            <span className="font-medium">{t.product_name} × {t.quantity}</span>
                            <span className="text-xs text-muted-foreground">{format(new Date(t.created_at), "dd MMM yyyy HH:mm")}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Building className="h-3 w-3" />
                            <span>{srcBranch?.name || "Unknown"} → {destBranch?.name || "Unknown"}</span>
                          </div>
                          {t.notes && (
                            <p className="text-xs text-muted-foreground italic">{t.notes}</p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
