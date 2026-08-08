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
import ProductSearch from "@/components/ProductSearch";
import CustomerSearch from "@/components/CustomerSearch";
import PaymentSuccessDialog, { PaymentSuccessData } from "@/components/PaymentSuccessDialog";
import { isValidPaymentRef, normalizePaymentRef } from "@/lib/paymentStatus";



type PaymentMode = "Cash" | "Mpesa" | "Credit";
type DiscountType = "percentage" | "fixed";

interface CartItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  sellingPrice: number;
  buyingPrice: number;
  subtotal: number;
  profit: number;
}

export default function Sales() {
  const { products, customers, sales, branches, addSale, addCartSale, finalizeSale: finalizeCartSale, refetch, effectiveBranchId } = useData();
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);
  const [paymentSuccess, setPaymentSuccess] = useState<PaymentSuccessData | null>(null);
  const [pendingReceipt, setPendingReceipt] = useState<any>(null);
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [stkPending, setStkPending] = useState<{ saleId: string; messageRef: string; startedAt: number; amount?: number; phone?: string } | null>(null);
  const [manualCodes, setManualCodes] = useState<Record<string, string>>({});
  const [stkStatus, setStkStatus] = useState<"idle" | "sending" | "waiting" | "still_processing" | "failed" | "cancelled">("idle");
  const [isCheckingNow, setIsCheckingNow] = useState(false);
  const [stkElapsed, setStkElapsed] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualForm, setManualForm] = useState({
    customerName: "",
    phone: "",
    amount: 0,
    mpesaCode: "",
    paymentTime: new Date().toISOString().slice(0, 16),
    notes: "",
  });
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const idempotencyKeyRef = useRef<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const clockRef = useRef<number | null>(null);

  const totalCartQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const addItemToCart = () => {
    if (!selectedProduct || form.quantity < 1) {
      toast.error("Select a product and enter a valid quantity.");
      return;
    }
    if (form.quantity > selectedProduct.quantity) {
      toast.error("Not enough stock available");
      return;
    }
    setCartItems(prev => {
      const existing = prev.find(item => item.productId === selectedProduct.id);
      if (existing) {
        const updatedQuantity = existing.quantity + form.quantity;
        return prev.map(item => item.productId === selectedProduct.id ? {
          ...item,
          quantity: updatedQuantity,
          subtotal: updatedQuantity * item.sellingPrice,
          profit: updatedQuantity * (item.sellingPrice - item.buyingPrice),
        } : item);
      }
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          productId: selectedProduct.id,
          productName: selectedProduct.name,
          quantity: form.quantity,
          sellingPrice: selectedProduct.selling_price,
          buyingPrice: selectedProduct.buying_price,
          subtotal: selectedProduct.selling_price * form.quantity,
          profit: (selectedProduct.selling_price - selectedProduct.buying_price) * form.quantity,
        },
      ];
    });
    setForm({ ...form, productId: "", quantity: 1 });
  };

  const updateCartItem = (id: string, quantity: number) => {
    setCartItems(prev => prev.map(item => item.id === id ? {
      ...item,
      quantity,
      subtotal: item.sellingPrice * quantity,
      profit: (item.sellingPrice - item.buyingPrice) * quantity,
    } : item));
  };

  const removeCartItem = (id: string) => {
    setCartItems(prev => prev.filter(item => item.id !== id));
  };

  const [form, setForm] = useState({
    customerId: "",
    productId: "",
    quantity: 1,
    discountType: "fixed" as DiscountType,
    discountValue: 0,
    paymentMode: "Cash" as PaymentMode,
    mpesaEntryMode: "stk" as "stk" | "manual",
    mpesaCode: "",
  });


  const selectedProduct = products.find(p => p.id === form.productId);
  const selectedCustomer = customers.find(c => c.id === form.customerId);

  const isCartSale = cartItems.length > 0;
  const singleItemSubtotal = selectedProduct ? selectedProduct.selling_price * form.quantity : 0;
  const cartSubtotal = cartItems.reduce((sum, item) => sum + item.subtotal, 0);
  const totalCost = cartItems.reduce((sum, item) => sum + item.buyingPrice * item.quantity, 0);
  const totalSellingValue = cartItems.reduce((sum, item) => sum + item.sellingPrice * item.quantity, 0);
  const totalExpectedProfit = totalSellingValue - totalCost;
  const subtotal = isCartSale ? cartSubtotal : singleItemSubtotal;
  const discountAmount = form.discountType === "percentage"
    ? subtotal * (form.discountValue / 100)
    : form.discountValue;
  const finalAmount = Math.max(0, subtotal - Math.min(subtotal, discountAmount));
  const profit = isCartSale
    ? totalExpectedProfit - Math.min(subtotal, discountAmount)
    : (selectedProduct ? (selectedProduct.selling_price - selectedProduct.buying_price) * form.quantity : 0) - Math.min(subtotal, discountAmount);

  const queryStatus = async (messageRef: string) => {
    const { data } = await supabase.functions.invoke("mpesa-transaction-status", {
      body: { message_reference: messageRef },
    });
    return data as { status?: string; result_description?: string; receipt?: string | null } | null;
  };

  useEffect(() => {
    if (!stkPending || stkStatus !== "waiting") return;
    setStkElapsed(Math.floor((Date.now() - stkPending.startedAt) / 1000));

    const tick = async () => {
      const elapsedMs = Date.now() - stkPending.startedAt;
      setStkElapsed(Math.floor(elapsedMs / 1000));

      const data = await queryStatus(stkPending.messageRef);

      if (data?.status === "SUCCESS") {
        if (pollRef.current) window.clearInterval(pollRef.current);
        setStkStatus("idle");
        toast.success("Payment confirmed!");
        const paidSaleId = stkPending.saleId;
        await finalizeCartSale(paidSaleId);
        await showStkReceipt(paidSaleId, data?.receipt);
        setStkPending(null);
        setForm({ customerId: "", productId: "", quantity: 1, discountType: "fixed", discountValue: 0, paymentMode: "Cash", mpesaEntryMode: "stk", mpesaCode: "" });
        setCartItems([]);
        setMpesaPhone("");
        setOpen(false);
        return;
      }
      if (data?.status === "FAILED") {
        if (pollRef.current) window.clearInterval(pollRef.current);
        setStkStatus("failed");
        toast.error(data.result_description || "Payment failed");
        return;
      }
      if (data?.status === "CANCELLED") {
        if (pollRef.current) window.clearInterval(pollRef.current);
        setStkStatus("cancelled");
        return;
      }
      if (elapsedMs > 120_000) {
        if (pollRef.current) window.clearInterval(pollRef.current);
        setStkStatus("still_processing");
      }
    };
    pollRef.current = window.setInterval(tick, 3000);
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, [stkPending, stkStatus]);

  const sendStkPush = async (saleId: string, phone: string, amount: number) => {
    setStkStatus("sending");
    try {
      const { data, error } = await supabase.functions.invoke("mpesa-stk-push", {
        body: { sale_id: saleId, amount, phone, narration: `Sale ${saleId.slice(0, 8)}` },
      });

      if (!error && data?.fallback) {
        setStkStatus("failed");
        toast.error(
          data.message || "Payment provider authorization pending. Please retry later.",
          { description: data.correlation_id ? `Ref: ${data.correlation_id}` : undefined },
        );
        // Always keep the sale in context so the cashier can retry or enter the
        // M-Pesa/bank code manually — even when the bank never issued a reference.
        setStkPending({ saleId, messageRef: data.message_reference || "", startedAt: Date.now(), amount, phone });
        return;
      }

      if (error || data?.ok === false || !data?.message_reference) {
        setStkStatus("failed");
        toast.error(
          data?.message || data?.error || error?.message || "STK push failed. You can enter the M-Pesa code manually.",
        );
        setStkPending({ saleId, messageRef: data?.message_reference || "", startedAt: Date.now(), amount, phone });
        return;
      }

      setStkPending({ saleId, messageRef: data.message_reference, startedAt: Date.now(), amount, phone });
      setStkStatus("waiting");
      toast.success("STK sent — waiting for customer to enter M-Pesa PIN…");
    } catch (e: any) {
      console.error("sendStkPush error:", e);
      setStkStatus("failed");
      toast.error("Payment provider unreachable. You can enter the M-Pesa code manually.");
      setStkPending({ saleId, messageRef: "", startedAt: Date.now(), amount, phone });
    }
  };


  const cancelStk = async () => {
    if (!stkPending || isCancelling) return;
    setIsCancelling(true);
    try {
      if (pollRef.current) window.clearInterval(pollRef.current);
      setStkStatus("cancelled");
      toast.info("Stopped checking. The bank transaction was not cancelled — check Payments Trace to resolve it.");
    } finally {
      setIsCancelling(false);
    }
  };



  const retryStk = async () => {
    if (!stkPending) return;
    await sendStkPush(stkPending.saleId, mpesaPhone, finalAmount);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const isCartSale = cartItems.length > 0;
    if (!isCartSale && (!selectedProduct || form.quantity < 1)) return;
    if (!isCartSale && form.quantity > selectedProduct.quantity) {
      toast.error("Not enough stock available");
      return;
    }
    if (isCartSale && cartItems.some(item => item.quantity < 1)) {
      toast.error("Cart contains an invalid quantity.");
      return;
    }
    if (form.paymentMode === "Mpesa" && !mpesaPhone.trim()) {
      toast.error("Enter customer phone number");
      return;
    }
    if (form.paymentMode === "Mpesa" && form.mpesaEntryMode === "manual") {
      if (!isValidPaymentRef(form.mpesaCode)) {
        toast.error("Enter a valid payment reference (6-50 letters, numbers or hyphens).");
        return;
      }
    }


    setIsSubmitting(true);
    try {
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = `sale_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      }
      const idempotencyKey = idempotencyKeyRef.current;

      const saleItemsPayload = cartItems.map(item => ({
        product_id: item.productId,
        product_name: item.productName,
        quantity: item.quantity,
        selling_price: item.sellingPrice,
        buying_price: item.buyingPrice,
        total_amount: item.subtotal,
        discount_amount: 0,
        profit: item.profit,
      }));

      const saleHeader = {
        customer_id: form.customerId || null,
        customer_name: selectedCustomer?.name || "Walk-in",
        product_id: isCartSale ? cartItems[0].productId : form.productId,
        product_name: isCartSale ? cartItems[0].productName : selectedProduct.name,
        quantity: isCartSale ? totalCartQuantity : form.quantity,
        selling_price: isCartSale ? cartItems[0].sellingPrice : selectedProduct.selling_price,
        buying_price: isCartSale ? cartItems[0].buyingPrice : selectedProduct.buying_price,
        discount_type: form.discountType,
        discount_value: form.discountValue,
        total_amount: subtotal,
        discount_amount: discountAmount,
        final_amount: finalAmount,
        profit,
        payment_mode: form.paymentMode,
        date: new Date().toISOString(),
      };

      if (form.paymentMode === "Mpesa" && form.mpesaEntryMode === "manual") {
        const code = normalizePaymentRef(form.mpesaCode);

        // Create the sale PENDING first — the RPC settles it atomically.
        let sale: any;
        if (isCartSale) {
          sale = await addCartSale({
            ...saleHeader,
            branch_id: effectiveBranchId,
            recorded_by: user?.id,
            payment_status: "PENDING",
            idempotency_key: idempotencyKey,
            items: saleItemsPayload,
          } as any);
          if (!sale) {
            toast.error("Could not create sale");
            return;
          }
        } else {
          const { data: singleSale, error } = await supabase
            .from("sales")
            .insert({
              ...saleHeader,
              branch_id: effectiveBranchId,
              recorded_by: user?.id,
              payment_status: "PENDING",
              idempotency_key: idempotencyKey,
            })
            .select()
            .single();
          if (error || !singleSale) {
            if ((error as any)?.code === "23505") {
              toast.info("This sale is already being processed.");
            } else {
              toast.error(error?.message || "Could not create sale");
            }
            return;
          }
          sale = singleSale;
        }

        const { error: rpcError } = await (supabase as any).rpc("record_manual_mpesa_payment", {
          p_sale_id: sale.id,
          p_mpesa_receipt: code,
          p_phone_number: mpesaPhone.trim(),
          p_amount: finalAmount,
          p_payment_time: new Date().toISOString(),
          p_notes: null,
          p_message_reference: null,
          p_branch_id: effectiveBranchId,
        });

        if (rpcError) {
          // Sale stays PENDING and un-deducted — nothing is left half-applied.
          toast.error(rpcError.message || "Could not record the manual M-Pesa payment.");
          await refetch();
          return;
        }

        const manualPoints = form.customerId ? Math.floor(finalAmount / 100) : 0;
        setPendingReceipt({
          id: sale.id,
          customerName: selectedCustomer?.name || "Walk-in",
          productName: isCartSale ? `${cartItems.length} items` : selectedProduct!.name,
          quantity: isCartSale ? totalCartQuantity : form.quantity,
          sellingPrice: isCartSale ? cartItems[0].sellingPrice : selectedProduct!.selling_price,
          totalAmount: subtotal,
          discountAmount,
          finalAmount,
          paymentMode: "Mpesa",
          profit,
          loyaltyPoints: manualPoints,
          totalLoyaltyPoints: (selectedCustomer?.loyalty_points || 0) + manualPoints,
          loyaltyPointsEarned: manualPoints,
          branchName: branches.find(b => b.id === effectiveBranchId)?.name || "",
          cashierName: profile?.full_name || "",
          mpesaReceipt: code,
          items: isCartSale ? cartItems.map(ci => ({
            productName: ci.productName,
            quantity: ci.quantity,
            sellingPrice: ci.sellingPrice,
            subtotal: ci.subtotal,
          })) : undefined,
          totalCost: isCartSale ? totalCost : undefined,
          expectedProfit: isCartSale ? totalExpectedProfit : undefined,
          date: new Date().toISOString(),
        });

        await refetch();
        setPaymentSuccess({
          amount: finalAmount,
          reference: code,
          date: new Date().toISOString(),
          method: "M-Pesa (Manual Entry)",
          customerName: selectedCustomer?.name || "Walk-in",
        });
        idempotencyKeyRef.current = null;
        setForm({ customerId: "", productId: "", quantity: 1, discountType: "fixed", discountValue: 0, paymentMode: "Cash", mpesaEntryMode: "stk", mpesaCode: "" });
        setCartItems([]);
        setMpesaPhone("");
        setOpen(false);
        return;
      }


      if (form.paymentMode === "Mpesa") {
        let sale: any;
        if (isCartSale) {
          sale = await addCartSale({
            ...saleHeader,
            branch_id: effectiveBranchId,
            recorded_by: user?.id,
            payment_status: "PENDING",
            idempotency_key: idempotencyKey,
            items: saleItemsPayload,
          } as any);
          if (!sale) {
            toast.error("Could not create sale");
            return;
          }
        } else {
          const { data: singleSale, error } = await supabase
            .from("sales")
            .insert({
              ...saleHeader,
              branch_id: effectiveBranchId,
              recorded_by: user?.id,
              payment_status: "PENDING",
              idempotency_key: idempotencyKey,
            })
            .select()
            .single();
          if (error || !singleSale) {
            if ((error as any)?.code === "23505") {
              toast.info("This sale is already being processed.");
            } else {
              toast.error(error?.message || "Could not create sale");
            }
            return;
          }
          sale = singleSale;
        }
        if ((sale as any).payment_status && (sale as any).payment_status !== "PENDING") {
          console.warn("Attempted STK push for non-pending sale", sale.id, (sale as any).payment_status);
          toast.error("Sale already marked paid — cannot send STK push.");
          return;
        }
        await sendStkPush(sale.id, mpesaPhone, finalAmount);
        return;
      }


      if (isCartSale) {
        await addCartSale({
          ...saleHeader,
          branch_id: effectiveBranchId,
          recorded_by: user?.id,
          payment_status: "PAID",
          idempotency_key: idempotencyKey,
          items: saleItemsPayload,
        } as any);
      } else {
        await addSale({ ...saleHeader, idempotency_key: idempotencyKey } as any);
      }

      const loyaltyPoints = Math.floor(finalAmount / 100);
      if (form.customerId && loyaltyPoints > 0) {
        await supabase.from("loyalty_points").insert({
          customer_id: form.customerId,
          points: loyaltyPoints,
          description: `Sale: ${isCartSale ? `${cartItems.length} items` : `${selectedProduct?.name || "product"} × ${form.quantity}`}`,
        });
        const newTotal = (selectedCustomer?.loyalty_points || 0) + loyaltyPoints;
        await supabase.from("customers").update({ loyalty_points: newTotal }).eq("id", form.customerId);
      }

      const totalLoyalty = (selectedCustomer?.loyalty_points || 0) + loyaltyPoints;
      const branchName = branches.find(b => b.id === effectiveBranchId)?.name || "";
      const cashierName = profile?.full_name || "";
      setReceiptData({
        id: crypto.randomUUID(),
        customerName: selectedCustomer?.name || "Walk-in",
        productName: isCartSale ? `${cartItems.length} items` : selectedProduct.name,
        quantity: isCartSale ? totalCartQuantity : form.quantity,
        sellingPrice: isCartSale ? cartItems[0].sellingPrice : selectedProduct.selling_price,
        totalAmount: subtotal,
        discountAmount,
        finalAmount,
        paymentMode: form.paymentMode,
        profit,
        loyaltyPoints,
        totalLoyaltyPoints: totalLoyalty,
        loyaltyPointsEarned: loyaltyPoints,
        branchName,
        cashierName,
        mpesaReceipt: null,
        items: isCartSale ? cartItems.map(ci => ({
          productName: ci.productName,
          quantity: ci.quantity,
          sellingPrice: ci.sellingPrice,
          subtotal: ci.subtotal,
        })) : undefined,
        totalCost: isCartSale ? totalCost : undefined,
        expectedProfit: isCartSale ? totalExpectedProfit : undefined,
        date: new Date().toISOString(),
      });

      toast.success("Sale recorded successfully!");
      idempotencyKeyRef.current = null;
      setForm({ customerId: "", productId: "", quantity: 1, discountType: "fixed", discountValue: 0, paymentMode: "Cash", mpesaEntryMode: "stk", mpesaCode: "" });
      setCartItems([]);

      setMpesaPhone("");
      setOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeDialog = () => {
    if (stkStatus === "waiting" || stkStatus === "sending") {
      toast.info("Cancel the pending STK first, or wait for the customer to complete payment.");
      return;
    }
    setOpen(false);
    setStkPending(null);
    setStkStatus("idle");
    setManualMode(false);
    idempotencyKeyRef.current = null;
    setForm({ customerId: "", productId: "", quantity: 1, discountType: "fixed", discountValue: 0, paymentMode: "Cash", mpesaEntryMode: "stk", mpesaCode: "" });
    setMpesaPhone("");
  };

  const showRetry = stkPending && (stkStatus === "failed" || stkStatus === "cancelled");

  const continueChecking = () => {
    if (!stkPending) return;
    setStkPending({ ...stkPending, startedAt: Date.now() });
    setStkStatus("waiting");
  };

  const refreshStatusNow = async () => {
    if (!stkPending || isCheckingNow) return;
    setIsCheckingNow(true);
    try {
      const data = await queryStatus(stkPending.messageRef);
      if (data?.status === "SUCCESS") {
        toast.success("Payment confirmed!");
        const paidSaleId = stkPending.saleId;
        try {
          // Idempotent RPC — the status check may already have settled the sale,
          // but the client-side call guarantees finalization with a user JWT.
          await finalizeCartSale(paidSaleId);
        } catch (finalizeError) {
          console.warn("Finalize after status check failed; the sale stays pending and reconcile will settle it.", finalizeError);
        }
        await showStkReceipt(paidSaleId, data?.receipt);
        setStkPending(null);
        setStkStatus("idle");
        setForm({ customerId: "", productId: "", quantity: 1, discountType: "fixed", discountValue: 0, paymentMode: "Cash", mpesaEntryMode: "stk", mpesaCode: "" });
        setCartItems([]);
        setMpesaPhone("");
        setOpen(false);
      } else if (data?.status === "FAILED") {
        setStkStatus("failed");
        toast.error(data.result_description || "Payment failed");
      } else if (data?.status === "CANCELLED") {
        setStkStatus("cancelled");
      } else {
        toast.info("Payment is still being processed by the bank.");
      }
    } finally {
      setIsCheckingNow(false);
    }
  };

  const openManualMode = () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    setStkStatus("idle");
    setManualForm({
      customerName: selectedCustomer?.name || "Walk-in",
      phone: mpesaPhone || "",
      amount: finalAmount || Number(stkPending ? 0 : 0),
      mpesaCode: "",
      paymentTime: new Date().toISOString().slice(0, 16),
      notes: "",
    });
    setManualMode(true);
  };

  const submitManualPayment = async () => {
    if (!stkPending) {
      toast.error("No sale is awaiting payment.");
      return;
    }
    const code = normalizePaymentRef(manualForm.mpesaCode);
    if (!isValidPaymentRef(code)) {
      toast.error("Enter a valid payment reference (6-50 letters, numbers or hyphens).");
      return;
    }
    if (!manualForm.phone.trim() || !manualForm.amount || manualForm.amount <= 0) {
      toast.error("Phone number and amount are required.");
      return;
    }
    setManualSubmitting(true);
    try {
      const paymentTimeIso = new Date(manualForm.paymentTime).toISOString();
      const { error } = await (supabase as any).rpc("record_manual_mpesa_payment", {
        p_sale_id: stkPending.saleId,
        p_mpesa_receipt: code,
        p_phone_number: manualForm.phone.trim(),
        p_amount: Number(manualForm.amount),
        p_payment_time: paymentTimeIso,
        p_notes: manualForm.notes || null,
        p_message_reference: stkPending.messageRef,
        p_branch_id: effectiveBranchId,
      });

      if (error) {
        toast.error(error.message || "Could not save manual payment.");
        return;
      }

      if (pollRef.current) window.clearInterval(pollRef.current);
      await refetch();
      setPaymentSuccess({
        amount: Number(manualForm.amount),
        reference: code,
        date: paymentTimeIso,
        method: "M-Pesa (Manual Entry)",
        customerName: manualForm.customerName || "Walk-in",
      });
      setManualMode(false);
      setStkPending(null);
      setStkStatus("idle");
      idempotencyKeyRef.current = null;
      setForm({ customerId: "", productId: "", quantity: 1, discountType: "fixed", discountValue: 0, paymentMode: "Cash", mpesaEntryMode: "stk", mpesaCode: "" });
      setCartItems([]);
      setMpesaPhone("");
      setOpen(false);
    } finally {
      setManualSubmitting(false);
    }
  };




  // Build a complete receipt from the DB rows (sales header + sale_items).
  // For cart/bulk sales the sales header only stores the FIRST product, so the
  // full line-item list must come from sale_items — otherwise the receipt would
  // silently drop every other product the customer bought.
  const buildReceiptData = (sale: any, saleItems: any[], opts?: { mpesaReceipt?: string | null }) => {
    const hasItems = Array.isArray(saleItems) && saleItems.length > 0;
    const earnedPoints = sale.customer_id ? Math.floor(Number(sale.final_amount) / 100) : 0;
    const branchName = branches.find(b => b.id === sale.branch_id)?.name || "";
    const cashierName = profile?.full_name || "";
    return {
      id: sale.id,
      customerName: sale.customer_name || "Walk-in",
      productName: hasItems ? `${saleItems.length} items` : sale.product_name,
      quantity: hasItems ? saleItems.reduce((sum: number, i: any) => sum + i.quantity, 0) : sale.quantity,
      sellingPrice: hasItems ? saleItems[0].selling_price : sale.selling_price,
      totalAmount: sale.total_amount,
      discountAmount: sale.discount_amount,
      finalAmount: sale.final_amount,
      paymentMode: sale.payment_mode,
      profit: sale.profit,
      loyaltyPoints: earnedPoints,
      loyaltyPointsEarned: earnedPoints,
      branchName,
      cashierName,
      mpesaReceipt: opts?.mpesaReceipt ?? null,
      items: hasItems ? saleItems.map((i: any) => ({
        productName: i.product_name,
        quantity: i.quantity,
        sellingPrice: i.selling_price,
        subtotal: i.total_amount,
      })) : undefined,
      totalCost: hasItems ? saleItems.reduce((sum: number, i: any) => sum + i.buying_price * i.quantity, 0) : undefined,
      expectedProfit: hasItems ? saleItems.reduce((sum: number, i: any) => sum + i.profit, 0) : undefined,
      date: sale.date || sale.created_at || new Date().toISOString(),
    };
  };

  // After an STK payment is confirmed, fetch the finalized sale + its line items
  // (source of truth) and present the PaymentSuccessDialog with a printable
  // receipt that lists EVERY product, not just the first one in the cart.
  const showStkReceipt = async (saleId: string, mpesaReceipt?: string | null) => {
    const [{ data: sale }, { data: saleItems }, { data: payment }] = await Promise.all([
      (supabase as any).from("sales").select("*").eq("id", saleId).maybeSingle(),
      (supabase as any).from("sale_items").select("*").eq("sale_id", saleId).order("created_at", { ascending: true }),
      (supabase as any).from("payments").select("mpesa_receipt").eq("sale_id", saleId).eq("status", "SUCCESS").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const receiptCode = mpesaReceipt || payment?.mpesa_receipt || null;
    if (!sale) {
      // Rare DB miss — fall back to the in-memory cart so the cashier can still print.
      if (cartItems.length > 0) {
        const earned = form.customerId ? Math.floor(finalAmount / 100) : 0;
        setPendingReceipt({
          id: saleId,
          customerName: selectedCustomer?.name || "Walk-in",
          productName: `${cartItems.length} items`,
          quantity: totalCartQuantity,
          sellingPrice: cartItems[0].sellingPrice,
          totalAmount: subtotal,
          discountAmount,
          finalAmount,
          paymentMode: "Mpesa",
          profit,
          loyaltyPoints: earned,
          loyaltyPointsEarned: earned,
          branchName: branches.find(b => b.id === effectiveBranchId)?.name || "",
          cashierName: profile?.full_name || "",
          mpesaReceipt: receiptCode,
          items: cartItems.map(ci => ({
            productName: ci.productName,
            quantity: ci.quantity,
            sellingPrice: ci.sellingPrice,
            subtotal: ci.subtotal,
          })),
          date: new Date().toISOString(),
        });
      }
      return;
    }
    setPendingReceipt(buildReceiptData(sale, saleItems || [], { mpesaReceipt: receiptCode }));
    setPaymentSuccess({
      amount: Number(sale.final_amount),
      reference: receiptCode || "STK",
      date: new Date().toISOString(),
      method: "M-Pesa (STK Push)",
      customerName: sale.customer_name || "Walk-in",
    });
  };

  // Reprint from the sales history list — loads sale_items so cart/bulk receipts
  // show every item instead of just the first product stored on the sales row.
  const printSaleReceipt = async (s: any) => {
    const { data: saleItems } = await (supabase as any)
      .from("sale_items")
      .select("*")
      .eq("sale_id", s.id)
      .order("created_at", { ascending: true });
    setReceiptData(buildReceiptData(s, saleItems || [], { mpesaReceipt: null }));
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

            {/* Manual M-Pesa entry (fallback when STK Push is unavailable) */}
            {manualMode && stkPending && (
              <Card className="bg-blue-500/5 border-blue-500/30">
                <CardContent className="p-4 space-y-3">
                  <div>
                    <p className="font-semibold text-blue-700 dark:text-blue-400">Manual M-Pesa entry</p>
                    <p className="text-xs text-muted-foreground">
                      Automatic STK Push is unavailable. Ask the customer to pay via M-Pesa and
                      record the transaction code from their SMS below.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <Label>Customer Name</Label>
                      <Input value={manualForm.customerName} onChange={e => setManualForm({ ...manualForm, customerName: e.target.value })} />
                    </div>
                    <div>
                      <Label>Phone Number *</Label>
                      <Input value={manualForm.phone} onChange={e => setManualForm({ ...manualForm, phone: e.target.value })} placeholder="0712345678" />
                    </div>
                    <div>
                      <Label>Amount (KSh) *</Label>
                      <Input type="number" min={1} value={manualForm.amount || ""} onChange={e => setManualForm({ ...manualForm, amount: Number(e.target.value) })} />
                    </div>
                    <div className="col-span-2">
                      <Label>M-Pesa Transaction Code *</Label>
                      <Input
                        value={manualForm.mpesaCode}
                        onChange={e => setManualForm({ ...manualForm, mpesaCode: e.target.value.toUpperCase() })}
                        placeholder="e.g. SFE1A2B3C4 or BANK-REF-2026-00123"
                        maxLength={50}
                        className="font-mono"
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">10 letters and digits from the M-Pesa SMS.</p>
                    </div>
                    <div className="col-span-2">
                      <Label>Payment Time</Label>
                      <Input type="datetime-local" value={manualForm.paymentTime} onChange={e => setManualForm({ ...manualForm, paymentTime: e.target.value })} />
                    </div>
                    <div className="col-span-2">
                      <Label>Notes (optional)</Label>
                      <Input value={manualForm.notes} onChange={e => setManualForm({ ...manualForm, notes: e.target.value })} placeholder="Any extra info" />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" className="flex-1 gap-2" onClick={submitManualPayment} disabled={manualSubmitting}>
                      {manualSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                      Save Manual Payment
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setManualMode(false)} disabled={manualSubmitting}>
                      Back
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* STK in progress overlay */}
            {!manualMode && stkPending && (stkStatus === "waiting" || stkStatus === "sending") && (
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-4 space-y-3">
                  <div className="text-center space-y-1">
                    <Loader2 className="h-8 w-8 mx-auto text-primary animate-spin" />
                    <p className="font-semibold">Waiting for customer payment…</p>
                    <p className="text-xs text-muted-foreground">
                      Will complete automatically once M-Pesa confirms.
                    </p>
                  </div>
                  <div className="text-sm space-y-1 border-t border-primary/10 pt-3">
                    <p className="flex items-center gap-2 text-success">
                      <CheckCircle2 className="h-4 w-4" /> STK sent to {mpesaPhone}
                    </p>
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Waiting for customer to enter M-Pesa PIN…
                    </p>
                    <p className="text-[11px] text-muted-foreground font-mono pt-1">
                      Ref: {stkPending.messageRef} · {stkElapsed}s elapsed
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1 gap-2" onClick={cancelStk} disabled={isCancelling}>
                      <X className="h-4 w-4" /> {isCancelling ? "Cancelling…" : "Cancel STK"}
                    </Button>
                    <Button size="sm" variant="secondary" className="flex-1 gap-2" onClick={openManualMode}>
                      <Smartphone className="h-4 w-4" /> Enter M-Pesa manually
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {!manualMode && stkPending && stkStatus === "still_processing" && (
              <Card className="bg-yellow-500/5 border-yellow-500/30">
                <CardContent className="p-4 text-center space-y-3">
                  <p className="font-medium text-yellow-700 dark:text-yellow-500">
                    Payment is still being processed.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Co-op has not returned a final result yet. You can keep checking, cancel polling,
                    or record the M-Pesa payment manually from the customer's SMS.
                  </p>
                  <p className="text-[11px] text-muted-foreground font-mono">Ref: {stkPending.messageRef}</p>
                  <div className="flex gap-2 justify-center flex-wrap">
                    <Button size="sm" variant="outline" onClick={refreshStatusNow} disabled={isCheckingNow} className="gap-2">
                      <RefreshCw className={`h-4 w-4 ${isCheckingNow ? "animate-spin" : ""}`} /> Refresh Status
                    </Button>
                    <Button size="sm" variant="outline" onClick={continueChecking} className="gap-2">
                      <Loader2 className="h-4 w-4" /> Continue Checking
                    </Button>
                    <Button size="sm" variant="secondary" onClick={openManualMode} className="gap-2">
                      <Smartphone className="h-4 w-4" /> Enter M-Pesa manually
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancelStk} disabled={isCancelling} className="gap-2">
                      <X className="h-4 w-4" /> Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {!manualMode && showRetry && (
              <Card className="bg-destructive/5 border-destructive/30">
                <CardContent className="p-4 text-center space-y-3">
                  <p className="font-medium text-destructive">
                    {stkStatus === "cancelled" ? "STK cancelled" : "Automatic STK Push failed"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    You can retry the STK Push, record the M-Pesa payment manually, or close.
                    The sale is preserved either way.
                  </p>
                  <div className="flex gap-2 justify-center flex-wrap">
                    <Button size="sm" variant="outline" onClick={retryStk} className="gap-2">
                      <RefreshCw className="h-4 w-4" /> Retry STK Push
                    </Button>
                    <Button size="sm" variant="secondary" onClick={openManualMode} className="gap-2">
                      <Smartphone className="h-4 w-4" /> Enter M-Pesa manually
                    </Button>
                    <Button size="sm" variant="ghost" onClick={closeDialog}>Close</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {!stkPending && !manualMode && (


            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Customer (optional)</Label>
                <CustomerSearch
                  customers={customers}
                  value={form.customerId}
                  onChange={v => setForm({ ...form, customerId: v })}
                />
                {selectedCustomer && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Credit balance: KSh {Number(selectedCustomer.credit_balance || 0).toLocaleString()} · {selectedCustomer.loyalty_points || 0} pts
                  </p>
                )}

              </div>
              <div>
                <Label>Product *</Label>
                <ProductSearch
                  products={products}
                  value={form.productId}
                  onChange={v => setForm({ ...form, productId: v })}
                />
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

              <div className="pt-2">
                <Button size="sm" onClick={addItemToCart} disabled={!form.productId || form.quantity < 1} className="gap-2">Add to cart</Button>
              </div>

              {form.paymentMode === "Mpesa" && (
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="p-3 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Smartphone className="h-4 w-4 text-primary" />
                      M-Pesa Payment
                    </div>
                    <div>
                      <Label>M-Pesa Method</Label>
                      <Select
                        value={form.mpesaEntryMode}
                        onValueChange={v => setForm({ ...form, mpesaEntryMode: v as "stk" | "manual", mpesaCode: "" })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="stk">Send STK Push (automatic)</SelectItem>
                          <SelectItem value="manual">Enter M-Pesa Manually</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Customer Phone *</Label>
                      <Input value={mpesaPhone} onChange={e => setMpesaPhone(e.target.value)} placeholder="e.g. 0712345678" />
                    </div>
                    {form.mpesaEntryMode === "manual" && (
                      <div>
                        <Label>M-Pesa Transaction Code *</Label>
                        <Input
                          value={form.mpesaCode}
                          onChange={e => setForm({ ...form, mpesaCode: e.target.value.toUpperCase() })}
                          placeholder="e.g. SFE1A2B3C4 or BANK-REF-2026-00123"
                          maxLength={50}
                          className="font-mono"
                        />
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Reference from the customer's M-Pesa or bank SMS (6-50 characters). Duplicates are rejected.
                        </p>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {form.mpesaEntryMode === "stk"
                        ? "Customer gets an STK prompt. Sale finalizes only after payment confirmation."
                        : "Sale finalizes immediately once the M-Pesa code is saved."}
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

              {cartItems.length > 0 && (
                <Card className="bg-muted/10">
                  <CardContent className="p-3 space-y-2 max-h-[200px] overflow-y-auto">
                    <div className="flex items-center justify-between font-medium">Cart <span className="text-sm text-muted-foreground">{totalCartQuantity} items</span></div>
                    {cartItems.map(ci => (
                      <div key={ci.id} className="flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="truncate">{ci.productName} × {ci.quantity}</div>
                          <div className="text-xs text-muted-foreground">KSh {ci.sellingPrice.toLocaleString()} each</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input type="number" value={ci.quantity} min={1} className="w-20" onChange={e => updateCartItem(ci.id, Number(e.target.value))} />
                          <div className="text-right">KSh {ci.subtotal.toLocaleString()}</div>
                          <Button size="icon" variant="ghost" onClick={() => removeCartItem(ci.id)}><X className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    ))}
                    <div className="pt-3 border-t border-border space-y-2 text-sm">
                      <div className="flex justify-between"><span>Total Selling Value</span><span>KSh {totalSellingValue.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span>Total Cost</span><span>KSh {totalCost.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span>Total Expected Profit</span><span>KSh {totalExpectedProfit.toLocaleString()}</span></div>
                      <div className="flex justify-between font-semibold text-foreground"><span>Grand Total</span><span>KSh {finalAmount.toLocaleString()}</span></div>
                    </div>
                  </CardContent>
                </Card>
              )}

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

              <Button
                type="submit"
                className="w-full gap-2"
                disabled={!(isCartSale || form.productId) || isSubmitting || stkStatus === "sending"}
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {form.paymentMode === "Mpesa"
                  ? (form.mpesaEntryMode === "manual" ? "Save M-Pesa Payment" : "Send STK Push")
                  : "Record Sale"}
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

      <PaymentSuccessDialog
        data={paymentSuccess}
        onClose={() => setPaymentSuccess(null)}
        onPrintReceipt={pendingReceipt ? () => { setPaymentSuccess(null); setReceiptData(pendingReceipt); setPendingReceipt(null); } : undefined}
      />

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
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => printSaleReceipt(s)}>
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