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

// --------- Co-op Postman-collection config parser ---------
// Single source of truth: COOP_CONFIG_JSON env var holds the raw Postman
// collection JSON provided by Co-op Bank. We parse it once per cold start.
type CoopConfig = {
  tokenUrl: string;
  stkUrl: string;
  consumerKey: string;
  consumerSecret: string;
};
let cachedConfig: CoopConfig | null = null;

function pickBasicAuth(node: any): { user?: string; pass?: string } {
  const basic = node?.auth?.basic;
  if (!basic) return {};
  // Postman v2.1: array of {key,value,type}. Older: object.
  if (Array.isArray(basic)) {
    const get = (k: string) =>
      basic.find((b: any) => b?.key === k)?.value;
    return { user: get("username"), pass: get("password") };
  }
  return { user: basic.username, pass: basic.password };
}

function urlToString(u: any): string {
  if (!u) return "";
  if (typeof u === "string") return u;
  if (typeof u.raw === "string") return u.raw;
  if (Array.isArray(u.host)) {
    const host = u.host.join(".");
    const path = Array.isArray(u.path) ? "/" + u.path.join("/") : "";
    const proto = u.protocol ? `${u.protocol}://` : "https://";
    return `${proto}${host}${path}`;
  }
  return "";
}

function walkItems(items: any[], cb: (it: any) => void) {
  for (const it of items || []) {
    if (Array.isArray(it.item)) walkItems(it.item, cb);
    if (it.request) cb(it);
  }
}

// Pull values from a Postman `variable` / `variables` array or object.
function readVars(node: any): Record<string, string> {
  const out: Record<string, string> = {};
  const v = node?.variable ?? node?.variables;
  if (Array.isArray(v)) {
    for (const item of v) {
      if (item?.key) out[String(item.key).toLowerCase()] = String(item.value ?? "");
    }
  } else if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v)) {
      out[k.toLowerCase()] = typeof val === "string" ? val
        : (val as any)?.value ?? "";
    }
  }
  return out;
}

function pickCredsFromVars(vars: Record<string, string>): { user?: string; pass?: string } {
  const userKeys = ["consumer_key", "consumerkey", "client_id", "clientid", "username", "api_key", "apikey", "user"];
  const passKeys = ["consumer_secret", "consumersecret", "client_secret", "clientsecret", "password", "api_secret", "apisecret", "secret", "pass"];
  let user: string | undefined;
  let pass: string | undefined;
  for (const k of userKeys) if (!user && vars[k]) user = vars[k];
  for (const k of passKeys) if (!pass && vars[k]) pass = vars[k];
  return { user, pass };
}

// Decode an "Authorization: Basic xxx" header value if present on a request.
function pickCredsFromAuthHeader(headers: any[]): { user?: string; pass?: string } {
  if (!Array.isArray(headers)) return {};
  for (const h of headers) {
    if (String(h?.key || "").toLowerCase() !== "authorization") continue;
    const val = String(h?.value || "");
    const m = val.match(/Basic\s+([A-Za-z0-9+/=]+)/i);
    if (!m) continue;
    try {
      const decoded = atob(m[1]);
      const idx = decoded.indexOf(":");
      if (idx > 0) return { user: decoded.slice(0, idx), pass: decoded.slice(idx + 1) };
    } catch { /* ignore */ }
  }
  return {};
}

function parseCoopConfig(): CoopConfig {
  if (cachedConfig) return cachedConfig;
  const raw = Deno.env.get("COOP_CONFIG_JSON");
  if (!raw) {
    throw new Error(
      "COOP_CONFIG_JSON not configured. Paste the Co-op Bank Postman collection JSON into this secret.",
    );
  }
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`COOP_CONFIG_JSON is not valid JSON: ${(e as Error).message}`);
  }

  // 1) Collection-level basic auth
  let { user, pass } = pickBasicAuth(parsed);

  // 2) Collection-level variables (consumer_key / consumer_secret etc.)
  const collectionVars = readVars(parsed);
  if (!user || !pass) {
    const v = pickCredsFromVars(collectionVars);
    user = user || v.user;
    pass = pass || v.pass;
  }

  let tokenUrl = "";
  let stkUrl = "";

  walkItems(parsed.item || [], (it) => {
    const name = String(it.name || "").toLowerCase();
    const url = urlToString(it.request?.url);
    const lower = url.toLowerCase();
    if (url) {
      if (!tokenUrl && (name.includes("token") || lower.endsWith("/token") || lower.includes("/token?"))) {
        tokenUrl = url.split("?")[0];
      }
      if (!stkUrl && (name.includes("stk") || lower.includes("/stk/"))) {
        stkUrl = url;
      }
    }
    // 3) Per-request basic auth fallback
    if ((!user || !pass) && it.request?.auth) {
      const a = pickBasicAuth(it.request);
      user = user || a.user;
      pass = pass || a.pass;
    }
    // 4) Per-request Authorization header fallback (Basic <base64>)
    if (!user || !pass) {
      const a = pickCredsFromAuthHeader(it.request?.header);
      user = user || a.user;
      pass = pass || a.pass;
    }
  });

  // 5) Resolve {{var}} placeholders in URLs against collection vars
  const resolveVars = (s: string) =>
    s.replace(/\{\{(\w+)\}\}/g, (_, k) => collectionVars[String(k).toLowerCase()] ?? "");
  tokenUrl = resolveVars(tokenUrl);
  stkUrl = resolveVars(stkUrl);

  // Hard-coded production defaults if collection omits the URLs
  tokenUrl = tokenUrl || "https://openapi.co-opbank.co.ke/token";
  stkUrl = stkUrl || "https://openapi.co-opbank.co.ke/FT/stk/1.0.0";

  if (!user || !pass) {
    throw new Error(
      "COOP_CONFIG_JSON has no credentials. Expected one of: auth.basic{username,password}, " +
      "collection variables (consumer_key/consumer_secret, client_id/client_secret, username/password), " +
      "or an Authorization: Basic <base64> header on the token request.",
    );
  }

  cachedConfig = {
    tokenUrl,
    stkUrl,
    consumerKey: user,
    consumerSecret: pass,
  };
  return cachedConfig;
}

async function getCoopTokenFromCfg(cfg: CoopConfig) {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 30_000) {
    return cachedToken.token;
  }
  const creds = btoa(`${cfg.consumerKey}:${cfg.consumerSecret}`);
  const url = cfg.tokenUrl.includes("grant_type=")
    ? cfg.tokenUrl
    : `${cfg.tokenUrl}?grant_type=client_credentials`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${creds}`,
      Accept: "application/json",
      "User-Agent": "WonderAquaPOS/1.0 (+https://wonderaqua.co.ke)",
      "Cache-Control": "no-cache",
    },
  });
  const bodyText = await res.text();
  let data: any = {};
  try { data = JSON.parse(bodyText); } catch { /* non-JSON (HTML/error page) */ }
  if (!res.ok || !data.access_token) {
    const snippet = bodyText.slice(0, 200).replace(/\s+/g, " ");
    console.error("Co-op token error:", res.status, url, snippet);
    throw new Error(
      `Token request to ${url} failed (HTTP ${res.status}). ` +
      `Upstream returned ${data?.error || data?.message || (bodyText.startsWith("<") ? "an HTML page" : "non-JSON")}: ${snippet}`,
    );
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

    // LIVE MODE — Co-op Bank OpenAPI driven entirely by COOP_CONFIG_JSON.
    let cfg: CoopConfig;
    try {
      cfg = parseCoopConfig();
    } catch (e) {
      await admin
        .from("payments")
        .update({
          status: "FAILED",
          result_description: (e as Error).message,
        })
        .eq("message_reference", messageReference);
      return new Response(
        JSON.stringify({ error: (e as Error).message }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    try {
      const token = await getCoopTokenFromCfg(cfg);
      const stkRes = await fetch(cfg.stkUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "WonderAquaPOS/1.0 (+https://wonderaqua.co.ke)",
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
        const fresh = await getCoopTokenFromCfg(cfg);
        finalRes = await fetch(cfg.stkUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${fresh}`,
            "Content-Type": "application/json",
            Accept: "application/json",
            "User-Agent": "WonderAquaPOS/1.0 (+https://wonderaqua.co.ke)",
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
