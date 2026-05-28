// Scheduled reconciliation for PENDING Co-op/M-Pesa payments.
//
// Strategy:
// 1. Scan payments still in PENDING.
// 2. If the callback already delivered a raw_payload (ResultCode present) but
//    status wasn't promoted (race / propagation failure), finalize the
//    payment + linked sale based on that ResultCode.
// 3. Age out payments older than RECONCILE_MAX_AGE_MIN (default 15 min) with
//    no callback as FAILED so the cashier UI stops spinning.
//
// Triggered every 2 minutes by pg_cron, or manually from the admin trace page.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function extractResultCode(raw: any): { code: string | null; desc: string | null; receipt: string | null } {
  if (!raw || typeof raw !== "object") return { code: null, desc: null, receipt: null };
  // Co-op flat / nested
  const coop = raw.Data || raw;
  if (coop?.ResultCode != null || coop?.StatusCode != null) {
    return {
      code: String(coop.ResultCode ?? coop.StatusCode),
      desc: coop.ResultDesc ?? coop.StatusDescription ?? null,
      receipt: coop.TransactionID || coop.ThirdPartyTransID || null,
    };
  }
  // Daraja
  const stk = raw?.Body?.stkCallback;
  if (stk?.ResultCode != null) {
    const items = stk.CallbackMetadata?.Item || [];
    const receipt = items.find((i: any) => i.Name === "MpesaReceiptNumber")?.Value || null;
    return { code: String(stk.ResultCode), desc: stk.ResultDesc ?? null, receipt: receipt ? String(receipt) : null };
  }
  return { code: null, desc: null, receipt: null };
}

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
    aged_out: 0,
    errors: 0,
  };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const maxAgeMin = Number(Deno.env.get("RECONCILE_MAX_AGE_MIN") || "15");
    const lookbackHours = Number(Deno.env.get("RECONCILE_LOOKBACK_HOURS") || "24");

    const lookbackIso = new Date(Date.now() - lookbackHours * 3600_000).toISOString();
    const ageOutIso = new Date(Date.now() - maxAgeMin * 60_000).toISOString();

    const { data: pending, error } = await admin
      .from("payments")
      .select("id, sale_id, status, raw_payload, message_reference, created_at, correlation_id")
      .eq("status", "PENDING")
      .gte("created_at", lookbackIso)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) throw error;

    summary.scanned = pending?.length || 0;

    for (const p of pending || []) {
      try {
        const { code, desc, receipt } = extractResultCode(p.raw_payload);
        if (code != null) {
          const isSuccess = code === "0";
          const status = isSuccess ? "SUCCESS" : "FAILED";
          await admin
            .from("payments")
            .update({
              status,
              result_code: code,
              result_description: desc,
              narration: receipt ? `Receipt ${receipt}` : undefined,
              updated_at: new Date().toISOString(),
            })
            .eq("id", p.id);
          if (p.sale_id) {
            await admin
              .from("sales")
              .update({ payment_status: isSuccess ? "PAID" : "FAILED" })
              .eq("id", p.sale_id);
          }
          if (isSuccess) summary.finalized_success++; else summary.finalized_failed++;
          continue;
        }

        // No callback yet — age out if too old
        if (p.created_at < ageOutIso) {
          await admin
            .from("payments")
            .update({
              status: "FAILED",
              result_code: "TIMEOUT",
              result_description: `No callback received within ${maxAgeMin} minutes`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", p.id);
          if (p.sale_id) {
            await admin
              .from("sales")
              .update({ payment_status: "FAILED" })
              .eq("id", p.sale_id);
          }
          summary.aged_out++;
        }
      } catch (e) {
        summary.errors++;
        console.error(JSON.stringify({
          evt: "reconcile_item_error",
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
      stack: (err as Error).stack,
    }));
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message, ...summary }),
      { status: 200, headers: respHeaders },
    );
  }
});
