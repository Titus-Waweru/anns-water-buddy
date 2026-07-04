// Co-op Bank STK callback handler.
// Matches by MessageReference, updates payments row, then propagates
// payment_status to the linked sale.
// Also defensively supports legacy Safaricom Daraja-shaped callbacks.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Always 200 OK — bank should never retry on our errors.
  const ok = () =>
    new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    if (req.method !== "POST") return ok();

    const body = await req.json().catch(() => ({}));
    console.log("Callback received:", JSON.stringify(body));

    // --- Extract fields from either Co-op or Daraja shapes ---
    let messageReference: string | null = null;
    let resultCode: string | number | null = null;
    let resultDesc: string | null = null;
    let amount: number | null = null;
    let phone: string | null = null;
    let transactionDate: string | null = null;
    let receipt: string | null = null;

    // Co-op shape (flat or nested under Data)
    const coop = body?.Data || body;
    if (coop?.MessageReference) {
      messageReference = String(coop.MessageReference);
      resultCode = coop.ResultCode ?? coop.StatusCode ?? null;
      resultDesc = coop.ResultDesc ?? coop.StatusDescription ?? null;
      amount = coop.Amount != null ? Number(coop.Amount) : null;
      phone = coop.MSISDN ? String(coop.MSISDN) : null;
      transactionDate = coop.MessageDateTime || coop.TransactionDate || null;
      receipt = coop.TransactionID || coop.ThirdPartyTransID || null;
    }

    // Daraja shape fallback
    const stk = body?.Body?.stkCallback;
    if (!messageReference && stk) {
      resultCode = stk.ResultCode ?? null;
      resultDesc = stk.ResultDesc ?? null;
      messageReference =
        stk.MerchantRequestID || stk.CheckoutRequestID || null;
      const items = stk.CallbackMetadata?.Item || [];
      const get = (n: string) => items.find((i: any) => i.Name === n)?.Value;
      amount = get("Amount") != null ? Number(get("Amount")) : null;
      phone = get("PhoneNumber") ? String(get("PhoneNumber")) : null;
      receipt = get("MpesaReceiptNumber") ? String(get("MpesaReceiptNumber")) : null;
      const td = get("TransactionDate");
      if (td) {
        const s = String(td);
        transactionDate = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}Z`;
      }
    }

    if (!messageReference) {
      console.log(JSON.stringify({ evt: "callback_no_message_reference", body }));
      return ok();
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const isSuccess = String(resultCode) === "0";
    const status = isSuccess ? "SUCCESS" : "FAILED";

    console.log(JSON.stringify({
      evt: "callback_received",
      message_reference: messageReference,
      result_code: resultCode,
      result_desc: resultDesc,
      amount, phone, receipt,
    }));

    // Find the linked payment
    const { data: payment, error: findErr } = await admin
      .from("payments")
      .select("id, sale_id, status")
      .eq("message_reference", messageReference)
      .maybeSingle();

    if (findErr) console.error(JSON.stringify({ evt: "callback_lookup_error", error: findErr.message }));


    if (!payment) {
      console.log(JSON.stringify({ evt: "callback_no_payment_row", message_reference: messageReference }));
      return ok();
    }

    // Idempotency: don't overwrite a terminal state
    if (payment.status === "SUCCESS" || payment.status === "CANCELLED") {
      console.log(JSON.stringify({ evt: "callback_duplicate_ignored", payment_id: payment.id, current_status: payment.status }));
      return ok();
    }


    const { error: upErr } = await admin
      .from("payments")
      .update({
        status,
        result_code: resultCode != null ? String(resultCode) : null,
        result_description: resultDesc,
        transaction_date: transactionDate
          ? new Date(transactionDate).toISOString()
          : new Date().toISOString(),
        raw_payload: body,
        amount: amount ?? undefined,
        phone_number: phone ?? undefined,
        narration: receipt ? `Receipt ${receipt}` : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id);

    if (upErr) console.error("Payment update error:", upErr);

    // Propagate to sale
    if (payment.sale_id) {
      const { error: saleErr } = await admin
        .from("sales")
        .update({
          payment_status: isSuccess ? "PAID" : "FAILED",
        })
        .eq("id", payment.sale_id);
      if (saleErr) console.error("Sale update error:", saleErr);
    }

    console.log(`Callback processed: ref=${messageReference} status=${status}`);
    return ok();
  } catch (err) {
    console.error("Callback fatal error:", err);
    return ok();
  }
});
