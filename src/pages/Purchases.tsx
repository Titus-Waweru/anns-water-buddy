import { useState, useEffect, useCallback } from "react";
import { useData } from "@/context/DataContext";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Plus, Truck, FlaskConical } from "lucide-react";
import PurchaseVoucherPrint from "@/components/PurchaseVoucherPrint";
import { format } from "date-fns";
import { toast } from "sonner";

type PaymentMode = "Cash" | "Mpesa" | "Credit";

interface BottleSpec {
  id: string;
  category: string;
  bottle_size: string;
  display_name: string;
  bottles_per_bale: number;
  is_active: boolean;
}

interface RawPurchase {
  id: string;
  supplier_name: string;
  specification_name: string;
  bales: number;
  total_bottles: number;
  cost_per_bottle: number;
  total_cost: number;
  payment_mode: string;
  date: string;
}

export default function Purchases() {
  const { products, suppliers, purchases, addPurchase, effectiveBranchId } = useData();
  const { isAdmin, hasRole, user } = useAuth();
  const canManage = isAdmin || hasRole("stock_manager");

  // Finished product purchase state
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    supplierId: "",
    productId: "",
    quantity: 1,
    buyingPrice: 0,
    paymentMode: "Cash" as PaymentMode,
  });

  // Raw bottle purchase state
  const [rawOpen, setRawOpen] = useState(false);
  const [specs, setSpecs] = useState<BottleSpec[]>([]);
  const [rawPurchases, setRawPurchases] = useState<RawPurchase[]>([]);
  const [rawForm, setRawForm] = useState({
    supplierId: "",
    specificationId: "",
    bales: 1,
    costPerBottle: 0,
    paymentMode: "Cash" as PaymentMode,
  });

  const selectedProduct = products.find(p => p.id === form.productId);
  const selectedSupplier = suppliers.find(s => s.id === form.supplierId);
  const totalCost = form.quantity * form.buyingPrice;

  const selectedSpec = specs.find(s => s.id === rawForm.specificationId);
  const totalBottles = selectedSpec ? rawForm.bales * selectedSpec.bottles_per_bale : 0;
  const rawTotalCost = totalBottles * rawForm.costPerBottle;

  // Fetch bottle specs and raw purchases
  const fetchRawData = useCallback(async () => {
    const [specRes, purchRes] = await Promise.all([
      (supabase as any).from("bottle_specifications").select("*").eq("is_active", true).order("category").order("bottle_size"),
      (supabase as any).from("raw_bottle_inventory_logs").select("*").eq("type", "IN").order("date", { ascending: false }).limit(50),
    ]);
    if (specRes.data) setSpecs(specRes.data as unknown as BottleSpec[]);
    if (purchRes.data) setRawPurchases(purchRes.data as unknown as RawPurchase[]);
  }, []);

  useEffect(() => { fetchRawData(); }, [fetchRawData]);

  // Finished product purchase submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !form.supplierId || form.quantity < 1) return;
    await addPurchase({
      supplier_id: form.supplierId,
      supplier_name: selectedSupplier?.name || "",
      product_id: form.productId,
      product_name: selectedProduct.name,
      quantity: form.quantity,
      buying_price: form.buyingPrice,
      total_cost: totalCost,
      payment_mode: form.paymentMode,
      date: new Date().toISOString(),
    });
    setForm({ supplierId: "", productId: "", quantity: 1, buyingPrice: 0, paymentMode: "Cash" });
    setOpen(false);
  };

  // Raw bottle purchase submit
  const handleRawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawForm.supplierId || !rawForm.specificationId || rawForm.bales < 1 || rawForm.costPerBottle <= 0) {
      toast.error("Fill all required fields");
      return;
    }
    if (!selectedSpec) return;
    if (!effectiveBranchId) {
      toast.error("Please select a working branch before recording raw bottle purchases.");
      return;
    }

    const supplier = suppliers.find(s => s.id === rawForm.supplierId);
    const bottlesPerBale = selectedSpec.bottles_per_bale;
    const totalBottlesCalc = rawForm.bales * bottlesPerBale;

    // 1. Update raw bottle inventory (upsert)
    const { data: existingInv, error: fetchErr } = await (supabase as any)
      .from("raw_bottle_inventory")
      .select("*")
      .eq("bottle_specification_id", rawForm.specificationId)
      .eq("branch_id", effectiveBranchId)
      .maybeSingle();

    if (fetchErr) {
      toast.error("Failed to check existing inventory: " + fetchErr.message);
      return;
    }

    if (existingInv) {
      const newQty = existingInv.quantity_bottles + totalBottlesCalc;

      const { error: updateErr } = await (supabase as any).from("raw_bottle_inventory").update({
        quantity_bottles: newQty,
      }).eq("id", existingInv.id);

      if (updateErr) {
        toast.error("Failed to update raw inventory: " + updateErr.message);
        return;
      }
    } else {
      const { error: insertErr } = await (supabase as any).from("raw_bottle_inventory").insert({
        bottle_specification_id: rawForm.specificationId,
        branch_id: effectiveBranchId,
        quantity_bottles: totalBottlesCalc,
      });

      if (insertErr) {
        toast.error("Failed to create raw inventory: " + insertErr.message);
        return;
      }
    }

    // 2. Create raw bottle inventory log
    const { error: logErr } = await (supabase as any).from("raw_bottle_inventory_logs").insert({
      branch_id: effectiveBranchId,
      bottle_specification_id: rawForm.specificationId,
      movement_type: "PURCHASE",
      quantity_bottles: totalBottlesCalc,
      reference: `Purchase from ${supplier?.name || "Unknown"}`,
      recorded_by: user?.id,
    });

    if (logErr) {
      toast.error("Failed to record inventory log: " + logErr.message);
      return;
    }

    toast.success(`Raw bottle purchase recorded: ${totalBottlesCalc} bottles`);
    setRawForm({ supplierId: "", specificationId: "", bales: 1, costPerBottle: 0, paymentMode: "Cash" });
    setRawOpen(false);
    fetchRawData();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Purchases</h1>
          <p className="text-sm text-muted-foreground">Record stock purchases from suppliers</p>
        </div>
        <div className="flex gap-2">
          {canManage && (
            <Dialog open={rawOpen} onOpenChange={setRawOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2"><FlaskConical className="h-4 w-4" /> Buy Raw Bottles</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Purchase Raw Bottles</DialogTitle></DialogHeader>
                <form onSubmit={handleRawSubmit} className="space-y-4">
                  <div>
                    <Label>Supplier *</Label>
                    <Select value={rawForm.supplierId} onValueChange={v => setRawForm({ ...rawForm, supplierId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                      <SelectContent>
                        {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Bottle Specification *</Label>
                    <Select value={rawForm.specificationId} onValueChange={v => {
                      const spec = specs.find(x => x.id === v);
                      setRawForm({ ...rawForm, specificationId: v, costPerBottle: 0 });
                    }}>
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
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Number of Bales *</Label>
                      <Input type="number" min={1} value={rawForm.bales} onChange={e => setRawForm({ ...rawForm, bales: Number(e.target.value) })} />
                    </div>
                    <div>
                      <Label>Cost per Bottle (KSh) *</Label>
                      <Input type="number" min={0} step={0.01} value={rawForm.costPerBottle || ""} onChange={e => setRawForm({ ...rawForm, costPerBottle: Number(e.target.value) })} />
                    </div>
                  </div>
                  <div>
                    <Label>Payment Mode</Label>
                    <Select value={rawForm.paymentMode} onValueChange={v => setRawForm({ ...rawForm, paymentMode: v as PaymentMode })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="Mpesa">Mpesa</SelectItem>
                        <SelectItem value="Credit">Credit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedSpec && rawForm.bales > 0 && (
                    <Card className="bg-muted/50">
                      <CardContent className="p-3 text-sm space-y-1">
                        <div className="flex justify-between"><span>Bottles per bale</span><span>{selectedSpec.bottles_per_bale}</span></div>
                        <div className="flex justify-between"><span>Total bottles</span><strong>{totalBottles.toLocaleString()}</strong></div>
                        <div className="flex justify-between font-bold border-t pt-1"><span>Total Cost</span><span>KSh {rawTotalCost.toLocaleString()}</span></div>
                      </CardContent>
                    </Card>
                  )}
                  <Button type="submit" className="w-full" disabled={!rawForm.supplierId || !rawForm.specificationId || rawForm.bales < 1 || rawForm.costPerBottle <= 0}>
                    Record Raw Bottle Purchase
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> New Purchase</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Record Purchase</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Supplier *</Label>
                  <Select value={form.supplierId} onValueChange={v => setForm({ ...form, supplierId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                    <SelectContent>
                      {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Product *</Label>
                  <Select value={form.productId} onValueChange={v => {
                    const p = products.find(x => x.id === v);
                    setForm({ ...form, productId: v, buyingPrice: p?.buying_price || 0 });
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                    <SelectContent>
                      {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.bottle_size})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Quantity</Label>
                    <Input type="number" min={1} value={form.quantity} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label>Buying Price (KSh)</Label>
                    <Input type="number" min={0} value={form.buyingPrice || ""} onChange={e => setForm({ ...form, buyingPrice: Number(e.target.value) })} />
                  </div>
                </div>
                <div>
                  <Label>Payment Mode</Label>
                  <Select value={form.paymentMode} onValueChange={v => setForm({ ...form, paymentMode: v as PaymentMode })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Mpesa">Mpesa</SelectItem>
                      <SelectItem value="Credit">Credit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Card className="bg-muted/50">
                  <CardContent className="p-3 text-sm">
                    <div className="flex justify-between font-bold"><span>Total Cost</span><span>KSh {totalCost.toLocaleString()}</span></div>
                  </CardContent>
                </Card>
                <Button type="submit" className="w-full" disabled={!form.productId || !form.supplierId}>Record Purchase</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Tabs: Finished Products | Raw Bottles */}
      <Tabs defaultValue="finished">
        <TabsList>
          <TabsTrigger value="finished" className="gap-2"><Truck className="h-4 w-4" /> Finished Products</TabsTrigger>
          <TabsTrigger value="raw" className="gap-2"><FlaskConical className="h-4 w-4" /> Raw Bottles</TabsTrigger>
        </TabsList>

        <TabsContent value="finished" className="mt-4">
          {purchases.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Truck className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No finished product purchases recorded yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {purchases.map(p => (
                <Card key={p.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-foreground">{p.product_name} × {p.quantity}</p>
                      <p className="text-xs text-muted-foreground">{p.supplier_name} · {format(new Date(p.date), "dd MMM yyyy, HH:mm")}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <PurchaseVoucherPrint
                        type="purchase"
                        data={{
                          id: p.id,
                          product_name: p.product_name,
                          quantity: p.quantity,
                          buying_price: p.buying_price,
                          total_cost: p.total_cost,
                          payment_mode: p.payment_mode,
                          supplier_name: p.supplier_name,
                          date: p.date,
                        }}
                      />
                      <div className="text-right">
                        <p className="font-bold text-foreground">KSh {p.total_cost.toLocaleString()}</p>
                        <Badge variant="outline" className="text-[10px]">{p.payment_mode}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="raw" className="mt-4">
          {rawPurchases.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FlaskConical className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No raw bottle purchases recorded yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {rawPurchases.map(p => (
                <Card key={p.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-foreground">{p.specification_name} × {p.bales} bales ({p.total_bottles} bottles)</p>
                      <p className="text-xs text-muted-foreground">{p.supplier_name} · {format(new Date(p.date), "dd MMM yyyy, HH:mm")}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-foreground">KSh {p.total_cost.toLocaleString()}</p>
                      <Badge variant="outline" className="text-[10px]">{p.payment_mode}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
