import { useState, useEffect, useRef } from "react";
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
import { Plus, ShoppingCart, Printer, Smartphone, Loader2, RefreshCw, X, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import SaleReceipt from "@/components/SaleReceipt";

type PaymentMode = "Cash" | "Mpesa" | "Credit";
type DiscountType = "percentage" | "fixed";

export default function Sales() {
  const { products, customers, sales, addSale, refetch, effectiveBranchId } = useData();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [stkPending, setStkPending] = useState<{ saleId: string; messageRef: string; startedAt: number } | null>(null);
  const [stkStatus, setStkStatus] = useState<"idle" | "sending" | "waiting" | "failed" | "timeout" | "cancelled">("idle");
  const [stkElapsed, setStkElapsed] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const clockRef = useRef<number | null>(null);

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

  // ---- Finalize a paid sale: deduct inventory, log, award loyalty, show receipt ----
  const finalizeSale = async (saleId: string) => {
    const { data: sale } = await supabase.from("sales").select("*").eq("id", saleId).maybeSingle();
    if (!sale) return;

    const product = products.find(p => p.id === sale.product_id);
    if (product) {
      await supabase.from("products")
        .update({ quantity: Math.max(0, product.quantity - sale.quantity) })
        .eq("id", sale.product_id);
      await supabase.from("inventory_logs").insert({
        product_id: sale.product_id,
        product_name: sale.product_name,
        type: "OUT",
        quantity: sale.quantity,
        reference: `Sale to ${sale.customer_name || "Walk-in"}`,
        date: sale.date,
        branch_id: sale.branch_id,
      });
    }

    const loyaltyPoints = Math.floor(sale.final_amount / 100);
    if (sale.customer_id && loyaltyPoints > 0) {
      await supabase.from("loyalty_points").insert({
        customer_id: sale.customer_id,
        sale_id: sale.id,
        points: loyaltyPoints,
        description: `Sale: ${sale.product_name} × ${sale.quantity}`,
      });
      const cust = customers.find(c => c.id === sale.customer_id);
      const newTotal = (cust?.loyalty_points || 0) + loyaltyPoints;
      await supabase.from("customers").update({ loyalty_points: newTotal }).eq("id", sale.customer_id);
    }

    const totalLoyalty = (selectedCustomer?.loyalty_points || 0) + loyaltyPoints;
    setReceiptData({
      id: sale.id,
      customerName: sale.customer_name || "Walk-in",
      productName: sale.product_name,
      quantity: sale.quantity,
      sellingPrice: sale.selling_price,
      totalAmount: sale.total_amount,
      discountAmount: sale.discount_amount,
      finalAmount: sale.final_amount,
      paymentMode: sale.payment_mode,
      profit: sale.profit,
      loyaltyPoints,
      totalLoyaltyPoints: totalLoyalty,
      rewardMessage: totalLoyalty >= 100 ? "🎉 Eligible for loyalty reward!" : null,
      date: sale.date,
    });
    refetch();
  };

  // ---- Poll for STK payment status ----
  useEffect(() => {
    if (!stkPending) return;
    let attempts = 0;
    const tick = async () => {
      attempts++;
      const { data } = await supabase
        .from("payments")
        .select("status, result_description")
        .eq("message_reference", stkPending.messageRef)
        .maybeSingle();

      if (data?.status === "SUCCESS") {
        if (pollRef.current) window.clearInterval(pollRef.current);
        setStkStatus("idle");
        toast.success("Payment confirmed!");
        await finalizeSale(stkPending.saleId);
        setStkPending(null);
        setOpen(false);
        return;
      }
      if (data?.status === "FAILED") {
        if (pollRef.current) window.clearInterval(pollRef.current);
        setStkStatus("failed");
        toast.error(data.result_description || "Payment failed");
        return;
      }
      // Timeout after ~2 minutes
      if (attempts > 40) {
        if (pollRef.current) window.clearInterval(pollRef.current);
        setStkStatus("failed");
        toast.error("Payment timed out. You can retry.");
      }
    };
    pollRef.current = window.setInterval(tick, 3000);
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, [stkPending]);

  const sendStkPush = async (saleId: string, phone: string, amount: number) => {
    setStkStatus("sending");
    try {
      const { data, error } = await supabase.functions.invoke("mpesa-stk-push", {
        body: { sale_id: saleId, amount, phone, narration: `Sale ${saleId.slice(0, 8)}` },
      });

      // Graceful upstream-blocked path: backend returns 200 + fallback:true.
      if (!error && data?.fallback) {
        setStkStatus("failed");
        toast.error(
          data.message || "Payment provider authorization pending. Please retry later.",
          { description: data.correlation_id ? `Ref: ${data.correlation_id}` : undefined },
        );
        // Keep the sale + payment as PENDING so the cashier can retry.
        if (data.message_reference) {
          setStkPending({ saleId, messageRef: data.message_reference });
        }
        return;
      }

      if (error || data?.ok === false || !data?.message_reference) {
        setStkStatus("failed");
        toast.error(
          data?.message || data?.error || error?.message || "STK push failed. Please retry.",
        );
        return;
      }

      setStkPending({ saleId, messageRef: data.message_reference });
      setStkStatus("waiting");
      toast.success("STK push sent. Waiting for payment confirmation…");
    } catch (e: any) {
      // Never let an exception blank-screen the POS.
      console.error("sendStkPush error:", e);
      setStkStatus("failed");
      toast.error("Payment provider unreachable. Please retry later.");
    }
  };

  const retryStk = async () => {
    if (!stkPending) return;
    await sendStkPush(stkPending.saleId, mpesaPhone, finalAmount);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!selectedProduct || form.quantity < 1) return;
    if (form.quantity > selectedProduct.quantity) {
      toast.error("Not enough stock available");
      return;
    }
    if (form.paymentMode === "Mpesa" && !mpesaPhone.trim()) {
      toast.error("Enter customer phone number for STK push");
      return;
    }

    setIsSubmitting(true);
    try {
      // Stable per-attempt idempotency key prevents duplicate inserts
      // from accidental double-clicks or retries.
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = `sale_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      }
      const idempotencyKey = idempotencyKeyRef.current;

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

      if (form.paymentMode === "Mpesa") {
        // Insert PENDING sale directly (skip context — it deducts inventory)
        const { data: sale, error } = await supabase
          .from("sales")
          .insert({
            ...saleData,
            branch_id: effectiveBranchId,
            recorded_by: user?.id,
            payment_status: "PENDING",
            idempotency_key: idempotencyKey,
          })
          .select()
          .single();
        if (error || !sale) {
          // 23505 = unique_violation → another tab already created this sale
          if ((error as any)?.code === "23505") {
            toast.info("This sale is already being processed.");
          } else {
            toast.error(error?.message || "Could not create sale");
          }
          return;
        }
        await sendStkPush(sale.id, mpesaPhone, finalAmount);
        return;
      }

      // Cash / Credit — standard path (PAID, deducts inventory in context)
      await addSale({ ...saleData, idempotency_key: idempotencyKey } as any);

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
        rewardMessage: totalLoyalty >= 100 ? "🎉 Eligible for loyalty reward!" : null,
        date: new Date().toISOString(),
      });

      toast.success("Sale recorded successfully!");
      idempotencyKeyRef.current = null;
      setForm({ customerId: "", productId: "", quantity: 1, discountType: "fixed", discountValue: 0, paymentMode: "Cash" });
      setMpesaPhone("");
      setOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeDialog = () => {
    if (stkStatus === "waiting" || stkStatus === "sending") {
      toast.info("Payment still pending. Cancel by retrying or wait for callback.");
      return;
    }
    setOpen(false);
    setStkPending(null);
    setStkStatus("idle");
    idempotencyKeyRef.current = null;
    setForm({ customerId: "", productId: "", quantity: 1, discountType: "fixed", discountValue: 0, paymentMode: "Cash" });
    setMpesaPhone("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sales</h1>
          <p className="text-sm text-muted-foreground">Record and track your sales</p>
        </div>
        <Dialog open={open} onOpenChange={v => v ? setOpen(true) : closeDialog()}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> New Sale</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Record Sale</DialogTitle></DialogHeader>

            {/* STK in progress overlay */}
            {stkPending && (stkStatus === "waiting" || stkStatus === "sending") && (
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-4 text-center space-y-2">
                  <Loader2 className="h-8 w-8 mx-auto text-primary animate-spin" />
                  <p className="font-medium">Awaiting payment confirmation…</p>
                  <p className="text-xs text-muted-foreground">
                    STK push sent to {mpesaPhone}. Ref: {stkPending.messageRef}
                  </p>
                </CardContent>
              </Card>
            )}

            {stkPending && stkStatus === "failed" && (
              <Card className="bg-destructive/5 border-destructive/30">
                <CardContent className="p-4 text-center space-y-3">
                  <p className="font-medium text-destructive">Payment not completed</p>
                  <div className="flex gap-2 justify-center">
                    <Button size="sm" variant="outline" onClick={retryStk} className="gap-2">
                      <RefreshCw className="h-4 w-4" /> Retry STK Push
                    </Button>
                    <Button size="sm" variant="ghost" onClick={closeDialog}>Cancel</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {!stkPending && (
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
                      <SelectItem value="Mpesa">M-Pesa (STK Push)</SelectItem>
                      <SelectItem value="Credit">Credit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {form.paymentMode === "Mpesa" && (
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="p-3 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Smartphone className="h-4 w-4 text-primary" />
                      Co-op Bank STK Push
                    </div>
                    <div>
                      <Label>Customer Phone *</Label>
                      <Input value={mpesaPhone} onChange={e => setMpesaPhone(e.target.value)} placeholder="e.g. 0712345678" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Customer will get an STK prompt. Sale finalizes only after payment confirmation.
                    </p>
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

              <Button type="submit" className="w-full gap-2" disabled={!form.productId || isSubmitting || stkStatus === "sending"}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {form.paymentMode === "Mpesa" ? "Send STK Push" : "Record Sale"}
              </Button>
            </form>
            )}
          </DialogContent>
        </Dialog>
      </div>

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
                      <div className="flex gap-1 justify-end flex-wrap">
                        <Badge variant="outline" className="text-[10px]">{s.payment_mode}</Badge>
                        {s.payment_status && s.payment_status !== "PAID" && (
                          <Badge variant={s.payment_status === "PENDING" ? "secondary" : "destructive"} className="text-[10px]">
                            {s.payment_status}
                          </Badge>
                        )}
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
