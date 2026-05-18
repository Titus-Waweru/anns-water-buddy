// Co-op Bank OpenAPI STK Push initiator
// Creates a PENDING payment record linked to a sale, then triggers STK push.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(p: string): string {
  const digits = String(p).replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return "254" + digits.slice(1);
  if (digits.startsWith("7") || digits.startsWith("1")) return "254" + digits;
  return digits;
}

// Simple in-memory token cache (per edge-runtime instance)
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getCoopToken(baseUrl: string, key: string, secret: string) {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 30_000) {
    return cachedToken.token;
  }
  const creds = btoa(`${key}:${secret}`);
  const res = await fetch(`${baseUrl}/token?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${creds}` },
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`Token failed: ${JSON.stringify(data)}`);
  }
  const ttlMs = (Number(data.expires_in) || 3600) * 1000;
  cachedToken = { token: data.access_token, expiresAt: now + ttlMs };
  return data.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { sale_id, amount, phone, narration } = body || {};

    if (!sale_id || !amount || !phone) {
      return new Response(
        JSON.stringify({ error: "sale_id, amount and phone are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authError } = await userClient.auth.getUser();
    if (authError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Prevent duplicate pending payment for same sale
    const { data: existing } = await admin
      .from("payments")
      .select("id, message_reference, status")
      .eq("sale_id", sale_id)
      .in("status", ["PENDING", "SUCCESS"])
      .maybeSingle();

    if (existing && existing.status === "SUCCESS") {
      return new Response(
        JSON.stringify({ error: "Sale already paid", message_reference: existing.message_reference }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const messageReference =
      existing?.message_reference || `WA-${sale_id.slice(0, 8)}-${Date.now()}`;
    const normalizedPhone = normalizePhone(phone);

    // Build the exact Co-op payload
    const callbackUrl =
      Deno.env.get("COOP_CALLBACK_URL") ||
      `${supabaseUrl}/functions/v1/mpesa-callback`;

    const coopPayload = {
      MessageReference: messageReference,
      CallBackUrl: callbackUrl,
      AccountReference: sale_id.slice(0, 12),
      Amount: Number(amount),
      MSISDN: normalizedPhone,
      Currency: "KES",
      Narration: narration || `Sale ${sale_id.slice(0, 8)}`,
    };

    // Upsert PENDING payment row
    if (existing) {
      await admin
        .from("payments")
        .update({
          amount: Number(amount),
          phone_number: normalizedPhone,
          status: "PENDING",
          raw_request: coopPayload,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await admin.from("payments").insert({
        provider: "coop",
        sale_id,
        amount: Number(amount),
        phone_number: normalizedPhone,
        message_reference: messageReference,
        transaction_currency: "KES",
        status: "PENDING",
        narration: coopPayload.Narration,
        initiated_by: userData.user.id,
        raw_request: coopPayload,
      });
    }

    // LIVE MODE — Co-op Bank OpenAPI. Credentials are REQUIRED. No stub fallback.
    const baseUrl = Deno.env.get("COOP_BASE_URL") || "https://openapi.co-opbank.co.ke";
    const stkPath = Deno.env.get("COOP_STK_PATH") || "/FT/stk/1.0.0";
    const consumerKey = Deno.env.get("COOP_CONSUMER_KEY");
    const consumerSecret = Deno.env.get("COOP_CONSUMER_SECRET");

    if (!consumerKey || !consumerSecret) {
      await admin
        .from("payments")
        .update({
          status: "FAILED",
          result_description: "Co-op credentials not configured on server.",
        })
        .eq("message_reference", messageReference);
      return new Response(
        JSON.stringify({
          error:
            "Payment gateway not configured. Set COOP_CONSUMER_KEY and COOP_CONSUMER_SECRET.",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    try {
      const token = await getCoopToken(baseUrl, consumerKey, consumerSecret);
      const stkRes = await fetch(`${baseUrl}${stkPath}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(coopPayload),
      });
      const stkData = await stkRes.json().catch(() => ({}));
      console.log("Co-op STK response:", stkRes.status, JSON.stringify(stkData));

      // If unauthorized, force-refresh token once and retry
      let finalRes = stkRes;
      let finalData = stkData;
      if (stkRes.status === 401) {
        cachedToken = null;
        const fresh = await getCoopToken(baseUrl, consumerKey, consumerSecret);
        finalRes = await fetch(`${baseUrl}${stkPath}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${fresh}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(coopPayload),
        });
        finalData = await finalRes.json().catch(() => ({}));
      }

      if (!finalRes.ok) {
        await admin
          .from("payments")
          .update({
            status: "FAILED",
            result_description: finalData?.ResultDesc || finalData?.message || "STK push request failed",
            raw_payload: finalData,
          })
          .eq("message_reference", messageReference);

        return new Response(
          JSON.stringify({ error: "STK push failed", details: finalData }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ ok: true, message_reference: messageReference, response: finalData }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } catch (err) {
      console.error("STK error:", err);
      await admin
        .from("payments")
        .update({
          status: "FAILED",
          result_description: String((err as Error).message),
        })
        .eq("message_reference", messageReference);
      return new Response(
        JSON.stringify({ error: String((err as Error).message) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } catch (e) {
    console.error("mpesa-stk-push error:", e);
    return new Response(JSON.stringify({ error: String((e as Error).message) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
