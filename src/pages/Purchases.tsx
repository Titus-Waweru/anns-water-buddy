import { useState } from "react";
import { useData } from "@/context/DataContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Truck } from "lucide-react";
import { format } from "date-fns";

type PaymentMode = "Cash" | "Mpesa" | "Credit";

export default function Purchases() {
  const { products, suppliers, purchases, addPurchase } = useData();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    supplierId: "",
    productId: "",
    quantity: 1,
    buyingPrice: 0,
    paymentMode: "Cash" as PaymentMode,
  });

  const selectedProduct = products.find(p => p.id === form.productId);
  const selectedSupplier = suppliers.find(s => s.id === form.supplierId);
  const totalCost = form.quantity * form.buyingPrice;

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Purchases</h1>
          <p className="text-sm text-muted-foreground">Record stock purchases from suppliers</p>
        </div>
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

      {purchases.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Truck className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No purchases recorded yet.</p>
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
                <div className="text-right">
                  <p className="font-bold text-foreground">KSh {p.total_cost.toLocaleString()}</p>
                  <Badge variant="outline" className="text-[10px]">{p.payment_mode}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
