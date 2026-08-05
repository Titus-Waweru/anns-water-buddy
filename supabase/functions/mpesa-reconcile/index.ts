// Scheduled reconciliation for PENDING Co-op/M-Pesa payments.
//
// Co-op has confirmed STK Push does NOT deliver callbacks. Reconciliation now
// works by actively querying the Co-op Transaction Status API (via the shared
// mpesa-transaction-status edge function) for every PENDING payment in the
// lookback window. That function updates payments + sales when it sees a final
// status. This job never fails a payment on its own — PENDING stays PENDING
// until Co-op returns a definitive result.
//
// Triggered every 2 minutes by pg_cron, or manually from the admin trace page.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const correlationId =
    req.headers.get("x-correlation-id") || crypto.randomUUID();
  const respHeaders = {
    ...corsHeaders,
    "Content-Type": "application/json",
    "X-Correlation-Id": correlationId,
  };

  const startedAt = Date.now();
  const summary = {
    correlation_id: correlationId,
    scanned: 0,
    finalized_success: 0,
    finalized_failed: 0,
    finalized_cancelled: 0,
    still_pending: 0,
    errors: 0,
  };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const lookbackHours = Number(Deno.env.get("RECONCILE_LOOKBACK_HOURS") || "24");
    const lookbackIso = new Date(Date.now() - lookbackHours * 3600_000).toISOString();

    const { data: pending, error } = await admin
      .from("payments")
      .select("id, message_reference, created_at")
      .eq("status", "PENDING")
      .gte("created_at", lookbackIso)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw error;

    summary.scanned = pending?.length || 0;

    const statusUrl = `${supabaseUrl}/functions/v1/mpesa-transaction-status`;

    for (const p of pending || []) {
      try {
        console.log(JSON.stringify({
          evt: "reconcile_invoke_status",
          correlationId,
          payment_id: p.id,
          message_reference: p.message_reference,
          url: statusUrl,
        }));
        const res = await fetch(statusUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
            apikey: anonKey,
            "X-Correlation-Id": correlationId,
          },
          body: JSON.stringify({ message_reference: p.message_reference }),
        });
        const data = await res.json().catch(() => ({} as any));
        console.log(JSON.stringify({
          evt: "reconcile_status_result",
          correlationId,
          payment_id: p.id,
          message_reference: p.message_reference,
          http_status: res.status,
          returned_status: data?.status,
          upstream_status: data?.upstream_status,
          result_code: data?.result_code,
          result_description: data?.result_description,
        }));
        const status = data?.status || "PENDING";
        if (status === "SUCCESS") summary.finalized_success++;
        else if (status === "FAILED") summary.finalized_failed++;
        else if (status === "CANCELLED") summary.finalized_cancelled++;
        else summary.still_pending++;
      } catch (e) {
        summary.errors++;
        console.error(JSON.stringify({
          evt: "reconcile_item_error",
          correlationId,
          payment_id: p.id,
          message_reference: p.message_reference,
          message: (e as Error).message,
        }));
      }
    }

    // Age-out: payments the bank never resolved. After the expiry window the
    // prompt can no longer be acted on, so stop showing it as pending. The sale
    // is marked FAILED (never PAID) so stock and balances stay untouched.
    const expiryMinutes = Number(Deno.env.get("PENDING_EXPIRY_MINUTES") || "60");
    const expiryIso = new Date(Date.now() - expiryMinutes * 60_000).toISOString();
    const { data: stale } = await admin
      .from("payments")
      .select("id, sale_id, message_reference")
      .eq("status", "PENDING")
      .lt("created_at", expiryIso)
      .limit(200);

    for (const p of stale || []) {
      try {
        await admin.from("payments").update({
          status: "FAILED",
          error_category: "EXPIRED_NO_RESPONSE",
          result_code: "EXPIRED",
          result_description: `No final response from Co-op within ${expiryMinutes} minutes`,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", p.id).eq("status", "PENDING");
        if (p.sale_id) await settleSale(admin, p.sale_id, "FAILED");
        summary.expired++;
      } catch (e) {
        summary.errors++;
        console.error(JSON.stringify({
          evt: "reconcile_expire_error",
          correlationId,
          payment_id: p.id,
          message: (e as Error).message,
        }));
      }
    }

    console.log(JSON.stringify({
      evt: "reconcile_done",
      ...summary,
      duration_ms: Date.now() - startedAt,
    }));


    return new Response(JSON.stringify({ ok: true, ...summary }), {
      status: 200,
      headers: respHeaders,
    });
  } catch (err) {
    console.error(JSON.stringify({
      evt: "reconcile_fatal",
      correlationId,
      message: (err as Error).message,
    }));
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message, ...summary }),
      { status: 200, headers: respHeaders },
    );
  }
});
