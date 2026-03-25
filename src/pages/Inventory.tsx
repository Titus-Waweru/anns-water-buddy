import { useState } from "react";
import { useData } from "@/context/DataContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertTriangle, Plus, Package } from "lucide-react";
import { format } from "date-fns";

export default function Inventory() {
  const { products, addProduct, inventoryLogs } = useData();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", bottleSize: "", buyingPrice: 0, sellingPrice: 0, quantity: 0, lowStockThreshold: 5 });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.bottleSize.trim()) return;
    addProduct(form);
    setForm({ name: "", bottleSize: "", buyingPrice: 0, sellingPrice: 0, quantity: 0, lowStockThreshold: 5 });
    setOpen(false);
  };

  const lowStockProducts = products.filter(p => p.quantity <= p.lowStockThreshold);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inventory</h1>
          <p className="text-sm text-muted-foreground">Manage your water bottle stock</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Add Product</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add New Product</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Product Name</Label>
                  <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Wonder Aqua" required />
                </div>
                <div>
                  <Label>Bottle Size</Label>
                  <Input value={form.bottleSize} onChange={e => setForm({ ...form, bottleSize: e.target.value })} placeholder="e.g. 20L" required />
                </div>
                <div>
                  <Label>Buying Price (KSh)</Label>
                  <Input type="number" min={0} value={form.buyingPrice || ""} onChange={e => setForm({ ...form, buyingPrice: Number(e.target.value) })} required />
                </div>
                <div>
                  <Label>Selling Price (KSh)</Label>
                  <Input type="number" min={0} value={form.sellingPrice || ""} onChange={e => setForm({ ...form, sellingPrice: Number(e.target.value) })} required />
                </div>
                <div>
                  <Label>Initial Quantity</Label>
                  <Input type="number" min={0} value={form.quantity || ""} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} required />
                </div>
                <div>
                  <Label>Low Stock Threshold</Label>
                  <Input type="number" min={0} value={form.lowStockThreshold || ""} onChange={e => setForm({ ...form, lowStockThreshold: Number(e.target.value) })} />
                </div>
              </div>
              <Button type="submit" className="w-full">Add Product</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Low Stock Alerts */}
      {lowStockProducts.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-destructive font-semibold text-sm mb-2">
              <AlertTriangle className="h-4 w-4" /> Low Stock Warning
            </div>
            {lowStockProducts.map(p => (
              <div key={p.id} className="flex justify-between text-sm py-1">
                <span>{p.name} ({p.bottleSize})</span>
                <Badge variant="destructive">{p.quantity} left</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Products List */}
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
            <Card key={p.id} className={p.quantity <= p.lowStockThreshold ? "border-destructive/40" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  {p.name}
                  <Badge variant={p.quantity <= p.lowStockThreshold ? "destructive" : "secondary"}>{p.quantity} in stock</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p className="text-muted-foreground">Size: <span className="text-foreground font-medium">{p.bottleSize}</span></p>
                <p className="text-muted-foreground">Buy: <span className="text-foreground font-medium">KSh {p.buyingPrice}</span> · Sell: <span className="text-foreground font-medium">KSh {p.sellingPrice}</span></p>
                <p className="text-muted-foreground">Margin: <span className="text-success font-medium">KSh {p.sellingPrice - p.buyingPrice}</span></p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Inventory History */}
      {inventoryLogs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Inventory History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {[...inventoryLogs].reverse().map(log => (
                <div key={log.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                  <div>
                    <p className="font-medium text-foreground">{log.productName}</p>
                    <p className="text-xs text-muted-foreground">{log.reference} · {format(new Date(log.date), "dd MMM yyyy, HH:mm")}</p>
                  </div>
                  <Badge variant={log.type === "IN" ? "default" : "secondary"} className={log.type === "IN" ? "bg-success" : ""}>
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
