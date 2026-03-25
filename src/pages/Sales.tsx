import { useState } from "react";
import { useData } from "@/context/DataContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, ShoppingCart } from "lucide-react";
import { format } from "date-fns";

type PaymentMode = "Cash" | "Mpesa" | "Credit";
type DiscountType = "percentage" | "fixed";

export default function Sales() {
  const { products, customers, sales, addSale } = useData();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    customerId: "",
    productId: "",
    quantity: 1,
    discountType: "fixed" as DiscountType,
    discountValue: 0,
    paymentMode: "Cash" as PaymentMode,
  });

  const selectedProduct = products.find(p => p.id === form.productId);
  const selectedCustomer = customers.find(c => c.id === form.customerId);

  const subtotal = selectedProduct ? selectedProduct.selling_price * form.quantity : 0;
  const discountAmount = form.discountType === "percentage"
    ? subtotal * (form.discountValue / 100)
    : form.discountValue;
  const finalAmount = Math.max(0, subtotal - discountAmount);
  const profit = selectedProduct
    ? (selectedProduct.selling_price - selectedProduct.buying_price) * form.quantity - discountAmount
    : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || form.quantity < 1) return;
    await addSale({
      customer_id: form.customerId || null,
      customer_name: selectedCustomer?.name || "Walk-in",
      product_id: form.productId,
      product_name: selectedProduct.name,
      quantity: form.quantity,
      selling_price: selectedProduct.selling_price,
      buying_price: selectedProduct.buying_price,
      discount_type: form.discountType,
      discount_value: form.discountValue,
      total_amount: subtotal,
      discount_amount: discountAmount,
      final_amount: finalAmount,
      profit,
      payment_mode: form.paymentMode,
      date: new Date().toISOString(),
    });
    setForm({ customerId: "", productId: "", quantity: 1, discountType: "fixed", discountValue: 0, paymentMode: "Cash" });
    setOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sales</h1>
          <p className="text-sm text-muted-foreground">Record and track your sales</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> New Sale</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Record Sale</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Customer (optional)</Label>
                <Select value={form.customerId} onValueChange={v => setForm({ ...form, customerId: v })}>
                  <SelectTrigger><SelectValue placeholder="Walk-in customer" /></SelectTrigger>
                  <SelectContent>
                    {customers.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Product *</Label>
                <Select value={form.productId} onValueChange={v => setForm({ ...form, productId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                  <SelectContent>
                    {products.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name} ({p.bottle_size}) — {p.quantity} in stock</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Quantity</Label>
                  <Input type="number" min={1} max={selectedProduct?.quantity || 999} value={form.quantity} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} />
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
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Discount Type</Label>
                  <Select value={form.discountType} onValueChange={v => setForm({ ...form, discountType: v as DiscountType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fixed (KSh)</SelectItem>
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Discount Value</Label>
                  <Input type="number" min={0} value={form.discountValue || ""} onChange={e => setForm({ ...form, discountValue: Number(e.target.value) })} />
                </div>
              </div>

              {selectedProduct && (
                <Card className="bg-muted/50">
                  <CardContent className="p-3 space-y-1 text-sm">
                    <div className="flex justify-between"><span>Subtotal</span><span>KSh {subtotal.toLocaleString()}</span></div>
                    {discountAmount > 0 && <div className="flex justify-between text-destructive"><span>Discount</span><span>-KSh {discountAmount.toLocaleString()}</span></div>}
                    <div className="flex justify-between font-bold text-base border-t pt-1"><span>Total</span><span>KSh {finalAmount.toLocaleString()}</span></div>
                    <div className="flex justify-between text-success"><span>Profit</span><span>KSh {profit.toLocaleString()}</span></div>
                  </CardContent>
                </Card>
              )}

              <Button type="submit" className="w-full" disabled={!form.productId}>Record Sale</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {sales.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ShoppingCart className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No sales recorded yet. Record your first sale!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sales.map(s => (
            <Card key={s.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">{s.product_name} × {s.quantity}</p>
                    <p className="text-xs text-muted-foreground">{s.customer_name || "Walk-in"} · {format(new Date(s.date), "dd MMM yyyy, HH:mm")}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-foreground">KSh {s.final_amount.toLocaleString()}</p>
                    <div className="flex gap-1 justify-end">
                      <Badge variant="outline" className="text-[10px]">{s.payment_mode}</Badge>
                      <Badge className="text-[10px] bg-success">+KSh {s.profit.toLocaleString()}</Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
