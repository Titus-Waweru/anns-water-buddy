import { useState } from "react";
import { useData } from "@/context/DataContext";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Plus, Package, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";

interface StockAdj {
  id: string;
  product_id: string;
  product_name: string;
  adjustment_type: string;
  quantity: number;
  reason: string | null;
  status: string;
  created_at: string;
}

export default function Inventory() {
  const { products, addProduct, inventoryLogs, refetch } = useData();
  const { user, isAdmin, hasRole, branchId, roles } = useAuth();
  const [open, setOpen] = useState(false);
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjustments, setAdjustments] = useState<StockAdj[]>([]);

  const isCashier = roles.includes("cashier") && !isAdmin;
  const canAddProduct = isAdmin || hasRole("stock_manager");
  const canAdjust = isAdmin || hasRole("stock_manager");

  const [form, setForm] = useState({
    name: "", bottle_size: "", buying_price: 0, selling_price: 0, quantity: 0,
    low_stock_threshold: 5,
  });

  const [adjForm, setAdjForm] = useState({
    productId: "", adjustmentType: "increase" as "increase" | "decrease", quantity: 0, reason: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.bottle_size.trim()) return;

    await addProduct({
      ...form,
      branch_id: branchId,
    } as any);

    setForm({ name: "", bottle_size: "", buying_price: 0, selling_price: 0, quantity: 0, low_stock_threshold: 5 });
    setOpen(false);
    toast.success("Product added!");
  };

  const fetchAdjustments = async () => {
    let q = supabase.from("stock_adjustments").select("*").order("created_at", { ascending: false });
    if (!isAdmin && branchId) q = q.eq("branch_id", branchId);
    const { data } = await q;
    if (data) setAdjustments(data as StockAdj[]);
  };

  const handleAdjSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjForm.productId || adjForm.quantity <= 0 || !adjForm.reason.trim()) {
      toast.error("Fill all required fields");
      return;
    }
    const product = products.find(p => p.id === adjForm.productId);
    if (!product) return;

    const autoApprove = isAdmin;
    const { error } = await supabase.from("stock_adjustments").insert({
      product_id: adjForm.productId,
      product_name: product.name,
      adjustment_type: adjForm.adjustmentType,
      quantity: adjForm.quantity,
      reason: adjForm.reason,
      requested_by: user!.id,
      branch_id: branchId,
      status: autoApprove ? "approved" : "pending",
      approved_by: autoApprove ? user!.id : null,
    });

    if (error) { toast.error("Failed to submit adjustment"); return; }

    if (autoApprove) {
      const newQty = adjForm.adjustmentType === "increase"
        ? product.quantity + adjForm.quantity
        : Math.max(0, product.quantity - adjForm.quantity);
      await supabase.from("products").update({ quantity: newQty }).eq("id", product.id);
      await supabase.from("inventory_logs").insert({
        product_id: product.id, product_name: product.name,
        type: adjForm.adjustmentType === "increase" ? "IN" : "OUT",
        quantity: adjForm.quantity,
        reference: `Stock Adjustment: ${adjForm.reason}`,
        branch_id: branchId,
      });
      refetch();
    }

    toast.success(autoApprove ? "Adjustment applied!" : "Adjustment submitted for approval");
    setAdjForm({ productId: "", adjustmentType: "increase", quantity: 0, reason: "" });
    setAdjOpen(false);
    fetchAdjustments();
  };

  const handleApproveAdj = async (adj: StockAdj, approve: boolean) => {
    if (approve) {
      const product = products.find(p => p.id === adj.product_id);
      if (product) {
        const newQty = adj.adjustment_type === "increase"
          ? product.quantity + adj.quantity
          : Math.max(0, product.quantity - adj.quantity);
        await supabase.from("products").update({ quantity: newQty }).eq("id", product.id);
        await supabase.from("inventory_logs").insert({
          product_id: product.id, product_name: adj.product_name,
          type: adj.adjustment_type === "increase" ? "IN" : "OUT",
          quantity: adj.quantity,
          reference: `Stock Adjustment: ${adj.reason || "Approved"}`,
          branch_id: branchId,
        });
      }
    }
    await supabase.from("stock_adjustments").update({
      status: approve ? "approved" : "rejected",
      approved_by: user!.id,
    }).eq("id", adj.id);
    toast.success(approve ? "Adjustment approved" : "Adjustment rejected");
    fetchAdjustments();
    refetch();
  };

  const lowStockProducts = products.filter(p => p.quantity <= p.low_stock_threshold);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inventory</h1>
          <p className="text-sm text-muted-foreground">
            {isCashier ? "View current stock levels" : "Manage your product catalog and stock"}
          </p>
        </div>
        {!isCashier && (
          <div className="flex gap-2">
            {canAdjust && (
              <Dialog open={adjOpen} onOpenChange={v => { setAdjOpen(v); if (v) fetchAdjustments(); }}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2"><ClipboardCheck className="h-4 w-4" /> Stock Adjustment</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader><DialogTitle>Stock Adjustments</DialogTitle></DialogHeader>
                  <form onSubmit={handleAdjSubmit} className="space-y-4">
                    <div>
                      <Label>Product *</Label>
                      <Select value={adjForm.productId} onValueChange={v => setAdjForm({ ...adjForm, productId: v })}>
                        <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                        <SelectContent>
                          {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.bottle_size}) — {p.quantity} in stock</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Type</Label>
                        <Select value={adjForm.adjustmentType} onValueChange={v => setAdjForm({ ...adjForm, adjustmentType: v as any })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="increase">Increase</SelectItem>
                            <SelectItem value="decrease">Decrease</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Quantity *</Label>
                        <Input type="number" min={1} value={adjForm.quantity || ""} onChange={e => setAdjForm({ ...adjForm, quantity: Number(e.target.value) })} required />
                      </div>
                    </div>
                    <div>
                      <Label>Reason *</Label>
                      <Textarea value={adjForm.reason} onChange={e => setAdjForm({ ...adjForm, reason: e.target.value })} placeholder="Explain adjustment reason..." required />
                    </div>
                    <Button type="submit" className="w-full">
                      {isAdmin ? "Apply Adjustment" : "Submit for Approval"}
                    </Button>
                  </form>

                  {adjustments.length > 0 && (
                    <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
                      <p className="text-sm font-semibold text-foreground">Recent Adjustments</p>
                      {adjustments.map(adj => (
                        <div key={adj.id} className="flex items-center justify-between text-sm border rounded-lg p-2">
                          <div>
                            <p className="font-medium text-foreground">{adj.product_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {adj.adjustment_type === "increase" ? "+" : "-"}{adj.quantity} · {adj.reason}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={adj.status === "approved" ? "default" : adj.status === "rejected" ? "destructive" : "secondary"}
                              className={adj.status === "approved" ? "bg-success" : ""}>
                              {adj.status}
                            </Badge>
                            {isAdmin && adj.status === "pending" && (
                              <div className="flex gap-1">
                                <Button size="sm" variant="ghost" className="h-6 text-xs text-success" onClick={() => handleApproveAdj(adj, true)}>✓</Button>
                                <Button size="sm" variant="ghost" className="h-6 text-xs text-destructive" onClick={() => handleApproveAdj(adj, false)}>✗</Button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            )}
            {canAddProduct && (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2 gradient-bg border-0"><Plus className="h-4 w-4" /> Add Product</Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader><DialogTitle>Add New Product</DialogTitle></DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Product Name *</Label>
                        <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Wonder Aqua" required />
                      </div>
                      <div>
                        <Label>Category / Size *</Label>
                        <Input value={form.bottle_size} onChange={e => setForm({ ...form, bottle_size: e.target.value })} placeholder="e.g. 20L, 500ml" required />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Buying Price (KSh)</Label>
                        <Input type="number" min={0} value={form.buying_price || ""} onChange={e => setForm({ ...form, buying_price: Number(e.target.value) })} required />
                      </div>
                      <div>
                        <Label>Selling Price (KSh)</Label>
                        <Input type="number" min={0} value={form.selling_price || ""} onChange={e => setForm({ ...form, selling_price: Number(e.target.value) })} required />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Initial Stock</Label>
                        <Input type="number" min={0} value={form.quantity || ""} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} />
                      </div>
                      <div>
                        <Label>Low Stock Threshold</Label>
                        <Input type="number" min={0} value={form.low_stock_threshold || ""} onChange={e => setForm({ ...form, low_stock_threshold: Number(e.target.value) })} />
                      </div>
                    </div>
                    <Button type="submit" className="w-full gradient-bg border-0">Add Product</Button>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        )}
      </div>

      {lowStockProducts.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-destructive font-semibold text-sm mb-2">
              <AlertTriangle className="h-4 w-4" /> Low Stock Warning
            </div>
            {lowStockProducts.map(p => (
              <div key={p.id} className="flex justify-between text-sm py-1">
                <span>{p.name} ({p.bottle_size})</span>
                <Badge variant="destructive">{p.quantity} left</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {products.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No products yet. Add your first product to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map(p => (
            <Card key={p.id} className={`stat-card ${p.quantity <= p.low_stock_threshold ? "border-destructive/40" : ""}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  {p.name}
                  <Badge variant={p.quantity <= p.low_stock_threshold ? "destructive" : "secondary"}>{p.quantity} in stock</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p className="text-muted-foreground">Size: <span className="text-foreground font-medium">{p.bottle_size}</span></p>
                <p className="text-muted-foreground">Buy: <span className="text-foreground font-medium">KSh {p.buying_price}</span> · Sell: <span className="text-foreground font-medium">KSh {p.selling_price}</span></p>
                <p className="text-muted-foreground">Margin: <span className="text-success font-medium">KSh {p.selling_price - p.buying_price}</span></p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {inventoryLogs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Inventory History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {inventoryLogs.map(log => (
                <div key={log.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                  <div>
                    <p className="font-medium text-foreground">{log.product_name}</p>
                    <p className="text-xs text-muted-foreground">{log.reference}</p>
                  </div>
                  <Badge variant={log.type === "IN" ? "default" : "destructive"} className={log.type === "IN" ? "bg-success" : ""}>
                    {log.type === "IN" ? "+" : "-"}{log.quantity}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
