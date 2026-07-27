import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ ok: false, error: "Supabase service credentials are not configured." }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const {
    sale_id,
    message_reference,
    mpesa_receipt,
    phone_number,
    amount,
    payment_time,
    transaction_date,
    branch_id,
    entered_by,
    notes,
    narration,
  } = body || {};

  if (!message_reference) {
    return new Response(JSON.stringify({ ok: false, error: "message_reference is required." }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  const payload: Record<string, unknown> = {
    status: "SUCCESS",
    payment_method: "MPESA_MANUAL",
    payment_source: "Manual Entry",
    mpesa_receipt: mpesa_receipt || null,
    payment_time: payment_time || null,
    transaction_date: transaction_date || payment_time || null,
    phone_number: phone_number || null,
    amount: amount != null ? Number(amount) : null,
    notes: notes || null,
    entered_by: entered_by || null,
    result_code: "0",
    result_description: "Manual M-Pesa entry",
    updated_at: new Date().toISOString(),
  };

  try {
    const { data: existing, error: selectError } = await admin
      .from("payments")
      .select("id, sale_id")
      .eq("message_reference", message_reference)
      .maybeSingle();

    if (selectError) {
      console.error("mpesa-manual-entry select error", selectError);
      return new Response(JSON.stringify({ ok: false, error: "Failed to locate existing payment." }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    if (existing) {
      const { error: updateError } = await admin
        .from("payments")
        .update(payload)
        .eq("id", existing.id);
      if (updateError) {
        console.error("mpesa-manual-entry update error", updateError);
        return new Response(JSON.stringify({ ok: false, error: "Could not update payment." }), {
          status: 500,
          headers: corsHeaders,
        });
      }
    } else {
      const insertRow: Record<string, unknown> = {
        provider: "coop",
        sale_id: sale_id || null,
        message_reference,
        transaction_currency: "KES",
        initiated_by: entered_by || null,
        branch_id: branch_id || null,
        narration: narration || `Manual M-Pesa ${mpesa_receipt || "payment"}`,
        ...payload,
      };
      const { error: insertError } = await admin.from("payments").insert(insertRow);
      if (insertError) {
        console.error("mpesa-manual-entry insert error", insertError);
        return new Response(JSON.stringify({ ok: false, error: "Could not create payment." }), {
          status: 500,
          headers: corsHeaders,
        });
      }
    }

    if (sale_id) {
      const { error: saleError } = await admin
        .from("sales")
        .update({ payment_status: "PAID" })
        .eq("id", sale_id);
      if (saleError) {
        console.error("mpesa-manual-entry sale update error", saleError);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    console.error("mpesa-manual-entry unexpected error", err);
    return new Response(JSON.stringify({ ok: false, error: "Unexpected server error." }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
