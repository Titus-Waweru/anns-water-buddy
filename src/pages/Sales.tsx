import { useState, useEffect } from "react";
import { useData } from "@/context/DataContext";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, ShoppingCart, Printer, Smartphone } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import SaleReceipt from "@/components/SaleReceipt";

type PaymentMode = "Cash" | "Mpesa" | "Credit";
type DiscountType = "percentage" | "fixed";

export default function Sales() {
  const { products, customers, sales, addSale } = useData();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);
  const [hasDaraja, setHasDaraja] = useState(false);
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [mpesaCode, setMpesaCode] = useState("");
  const [form, setForm] = useState({
    customerId: "",
    productId: "",
    quantity: 1,
    discountType: "fixed" as DiscountType,
    discountValue: 0,
    paymentMode: "Cash" as PaymentMode,
  });

  // Check if Daraja is configured
  useEffect(() => {
    supabase.from("system_settings").select("setting_value").eq("setting_key", "mpesa_consumer_key").maybeSingle()
      .then(({ data }) => { setHasDaraja(!!data?.setting_value); });
  }, []);

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
    if (form.quantity > selectedProduct.quantity) {
      toast.error("Not enough stock available");
      return;
    }

    // For Mpesa manual mode, require transaction code
    if (form.paymentMode === "Mpesa" && !hasDaraja && !mpesaCode.trim()) {
      toast.error("Enter M-Pesa transaction code");
      return;
    }

    const saleData = {
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
    };

    await addSale(saleData);

    // Award loyalty points (1 point per 100 KSh)
    const loyaltyPoints = Math.floor(finalAmount / 100);
    if (form.customerId && loyaltyPoints > 0) {
      await supabase.from("loyalty_points").insert({
        customer_id: form.customerId,
        points: loyaltyPoints,
        description: `Sale: ${selectedProduct.name} × ${form.quantity}`,
      });
      const newTotal = (selectedCustomer?.loyalty_points || 0) + loyaltyPoints;
      await supabase.from("customers").update({ loyalty_points: newTotal }).eq("id", form.customerId);
    }

    const totalLoyalty = (selectedCustomer?.loyalty_points || 0) + loyaltyPoints;
    const rewardMessage = totalLoyalty >= 100 ? "🎉 Eligible for loyalty reward!" : null;

    setReceiptData({
      id: crypto.randomUUID(),
      customerName: selectedCustomer?.name || "Walk-in",
      productName: selectedProduct.name,
      quantity: form.quantity,
      sellingPrice: selectedProduct.selling_price,
      totalAmount: subtotal,
      discountAmount,
      finalAmount,
      paymentMode: form.paymentMode,
      profit,
      loyaltyPoints,
      totalLoyaltyPoints: totalLoyalty,
      rewardMessage,
      mpesaCode: form.paymentMode === "Mpesa" ? mpesaCode : undefined,
      date: new Date().toISOString(),
    });

    toast.success("Sale recorded successfully!");
    setForm({ customerId: "", productId: "", quantity: 1, discountType: "fixed", discountValue: 0, paymentMode: "Cash" });
    setMpesaPhone(""); setMpesaCode("");
    setOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sales</h1>
          <p className="text-sm text-muted-foreground">Record and track your sales</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> New Sale</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
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

              {/* M-Pesa fields */}
              {form.paymentMode === "Mpesa" && (
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="p-3 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Smartphone className="h-4 w-4 text-primary" />
                      {hasDaraja ? "STK Push Available" : "Manual M-Pesa Entry"}
                    </div>
                    <div>
                      <Label>Phone Number</Label>
                      <Input value={mpesaPhone} onChange={e => setMpesaPhone(e.target.value)} placeholder="e.g. 254712345678" />
                    </div>
                    {!hasDaraja && (
                      <div>
                        <Label>Transaction Code *</Label>
                        <Input value={mpesaCode} onChange={e => setMpesaCode(e.target.value.toUpperCase())} placeholder="e.g. QHL34D2K9R" className="font-mono" />
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

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
                    {form.customerId && <div className="flex justify-between text-primary text-xs border-t pt-1"><span>Loyalty Points</span><span>+{Math.floor(finalAmount / 100)} pts</span></div>}
                  </CardContent>
                </Card>
              )}

              <Button type="submit" className="w-full" disabled={!form.productId}>Record Sale</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Receipt Dialog */}
      {receiptData && (
        <Dialog open={!!receiptData} onOpenChange={() => setReceiptData(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Sale Receipt</DialogTitle></DialogHeader>
            <SaleReceipt data={receiptData} onClose={() => setReceiptData(null)} />
          </DialogContent>
        </Dialog>
      )}

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
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground truncate">{s.product_name} × {s.quantity}</p>
                    <p className="text-xs text-muted-foreground">{s.customer_name || "Walk-in"} · {format(new Date(s.date), "dd MMM yyyy, HH:mm")}</p>
                  </div>
                  <div className="text-right flex items-center gap-2 shrink-0">
                    <div>
                      <p className="font-bold text-foreground">KSh {s.final_amount.toLocaleString()}</p>
                      <div className="flex gap-1 justify-end">
                        <Badge variant="outline" className="text-[10px]">{s.payment_mode}</Badge>
                        <Badge className="text-[10px] bg-success">+KSh {s.profit.toLocaleString()}</Badge>
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setReceiptData({
                      id: s.id,
                      customerName: s.customer_name || "Walk-in",
                      productName: s.product_name,
                      quantity: s.quantity,
                      sellingPrice: s.selling_price,
                      totalAmount: s.total_amount,
                      discountAmount: s.discount_amount,
                      finalAmount: s.final_amount,
                      paymentMode: s.payment_mode,
                      profit: s.profit,
                      loyaltyPoints: Math.floor(s.final_amount / 100),
                      date: s.date,
                    })}>
                      <Printer className="h-4 w-4" />
                    </Button>
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
