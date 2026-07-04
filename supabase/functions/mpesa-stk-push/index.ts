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
  // If the Postman collection ships a pre-encoded `Authorization: Basic <b64>`
  // on the token request, preserve it verbatim instead of decode→re-encode.
  rawBasicAuth?: string;
  authMethod: "raw_header" | "basic_auth_object" | "reconstructed";
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
  // Raw base64 from the token request's `Authorization: Basic <b64>` header,
  // preserved verbatim so we send back to Co-op exactly what the Postman
  // collection ships — no decode / re-encode round trip.
  let tokenRawBasicAuth: string | undefined;

  walkItems(parsed.item || [], (it) => {
    const name = String(it.name || "").toLowerCase();
    const url = urlToString(it.request?.url);
    const lower = url.toLowerCase();
    const isTokenItem =
      name.includes("token") || lower.endsWith("/token") || lower.includes("/token?");
    if (url) {
      if (!tokenUrl && isTokenItem) {
        tokenUrl = url.split("?")[0];
      }
      if (!stkUrl && (name.includes("stk") || lower.includes("/stk/"))) {
        stkUrl = url;
      }
    }
    // Preserve raw Authorization header from the token request verbatim.
    if (isTokenItem && !tokenRawBasicAuth && Array.isArray(it.request?.header)) {
      for (const h of it.request.header) {
        if (String(h?.key || "").toLowerCase() !== "authorization") continue;
        const val = String(h?.value || "");
        const m = val.match(/Basic\s+([A-Za-z0-9+/=]+)/i);
        if (m) { tokenRawBasicAuth = m[1]; break; }
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

  // If we captured a raw Basic header, also derive user/pass from it as a
  // fallback for anything else that expects them (e.g. logs only — no re-encode).
  if (tokenRawBasicAuth && (!user || !pass)) {
    try {
      const decoded = atob(tokenRawBasicAuth);
      const idx = decoded.indexOf(":");
      if (idx > 0) {
        user = user || decoded.slice(0, idx);
        pass = pass || decoded.slice(idx + 1);
      }
    } catch { /* ignore */ }
  }

  // 5) Resolve {{var}} placeholders in URLs against collection vars
  const resolveVars = (s: string) =>
    s.replace(/\{\{(\w+)\}\}/g, (_, k) => collectionVars[String(k).toLowerCase()] ?? "");
  tokenUrl = resolveVars(tokenUrl);
  stkUrl = resolveVars(stkUrl);

  // Hard-coded production defaults if collection omits the URLs
  tokenUrl = tokenUrl || "https://openapi.co-opbank.co.ke/token";
  stkUrl = stkUrl || "https://openapi.co-opbank.co.ke/FT/stk/1.0.0";

  // PROXY OVERRIDE — when COOP_PROXY_BASE_URL is set (e.g. https://wonderaqua.co.ke/coop),
  // rewrite Co-op host so all outbound traffic egresses from the whitelisted AWS IP
  // (13.62.244.124) instead of the Supabase Edge Functions egress pool.
  const proxyBase = (Deno.env.get("COOP_PROXY_BASE_URL") || "").replace(/\/+$/, "");
  if (proxyBase) {
    const swap = (u: string) =>
      u.replace(/^https?:\/\/openapi\.co-opbank\.co\.ke/i, proxyBase);
    tokenUrl = swap(tokenUrl);
    stkUrl = swap(stkUrl);
  }


  if (!user || !pass) {
    throw new Error(
      "COOP_CONFIG_JSON has no credentials. Expected one of: auth.basic{username,password}, " +
      "collection variables (consumer_key/consumer_secret, client_id/client_secret, username/password), " +
      "or an Authorization: Basic <base64> header on the token request.",
    );
  }

  const authMethod: CoopConfig["authMethod"] = tokenRawBasicAuth
    ? "raw_header"
    : (parsed?.auth?.basic ? "basic_auth_object" : "reconstructed");

  cachedConfig = {
    tokenUrl,
    stkUrl,
    consumerKey: user,
    consumerSecret: pass,
    rawBasicAuth: tokenRawBasicAuth,
    authMethod,
  };
  return cachedConfig;
}

// Typed upstream error so the handler can decide HTTP status + UX message.
class UpstreamError extends Error {
  status: number;
  url: string;
  bodySnippet: string;
  isHtml: boolean;
  rawBody: string;
  constructor(status: number, url: string, bodyText: string) {
    super(`Upstream ${status} from ${url}`);
    this.status = status;
    this.url = url;
    this.rawBody = bodyText;
    this.bodySnippet = bodyText.slice(0, 500).replace(/\s+/g, " ").trim();
    this.isHtml = bodyText.trimStart().startsWith("<");
  }
}

function getProxyBase(): string {
  return (Deno.env.get("COOP_PROXY_BASE_URL") || "").replace(/\/+$/, "");
}

function usesProxy(url: string): boolean {
  const proxyBase = getProxyBase();
  return Boolean(proxyBase && url.toLowerCase().startsWith(proxyBase.toLowerCase()));
}

function redactTokenResponse(bodyText: string): unknown {
  try {
    const parsed = JSON.parse(bodyText);
    if (parsed && typeof parsed === "object" && "access_token" in parsed) {
      return { ...parsed, access_token: "[REDACTED]" };
    }
    return parsed;
  } catch {
    return bodyText.slice(0, 1000);
  }
}

async function getCoopTokenFromCfg(cfg: CoopConfig, correlationId: string) {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 30_000) {
    return cachedToken.token;
  }
  // Prefer the verbatim Basic <base64> string from the Postman collection's
  // token request (Co-op support said the collection's Authorization must be
  // consumed exactly as provided). Only reconstruct via btoa() as a fallback.
  const creds = cfg.rawBasicAuth ?? btoa(`${cfg.consumerKey}:${cfg.consumerSecret}`);
  const url = cfg.tokenUrl.split("?")[0];
  const form = new URLSearchParams({ grant_type: "client_credentials" });

  // Debug — safe, non-secret: shows which auth path was selected, confirms
  // credentials were extracted, and shows the exact token URL being called.
  console.log(JSON.stringify({
    evt: "coop_token_auth_debug",
    correlationId,
    auth_method: cfg.authMethod,
    raw_basic_auth_present: Boolean(cfg.rawBasicAuth),
    consumer_key_extracted: Boolean(cfg.consumerKey),
    consumer_secret_extracted: Boolean(cfg.consumerSecret),
    consumer_key_len: cfg.consumerKey?.length ?? 0,
    consumer_secret_len: cfg.consumerSecret?.length ?? 0,
    basic_creds_len: creds.length,
    basic_creds_prefix: creds.slice(0, 6),
    token_url: url,
    uses_proxy: usesProxy(url),
  }));

  const t0 = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "WonderAquaPOS/1.0 (+https://wonderaqua.co.ke)",
      "Cache-Control": "no-cache",
      "X-Correlation-Id": correlationId,
      ...(Deno.env.get("COOP_PROXY_SECRET")
        ? { "X-Proxy-Secret": Deno.env.get("COOP_PROXY_SECRET")! }
        : {}),
    },
    body: form.toString(),
  });
  const bodyText = await res.text();
  const ms = Date.now() - t0;
  console.log(JSON.stringify({
    evt: "coop_token",
    correlationId,
    url,
    method: "POST",
    auth_method: cfg.authMethod,
    content_type: "application/x-www-form-urlencoded",
    uses_proxy: usesProxy(url),
    status: res.status,
    duration_ms: ms,
    upstream_headers: {
      "x-akamai-request-id": res.headers.get("x-akamai-request-id"),
      "x-cache": res.headers.get("x-cache"),
      "x-proxy-egress-ip": res.headers.get("x-proxy-egress-ip"),
      "x-proxy-upstream": res.headers.get("x-proxy-upstream"),
      "server": res.headers.get("server"),
    },
    response: redactTokenResponse(bodyText),
  }));

  let data: any = {};
  try { data = JSON.parse(bodyText); } catch { /* HTML/error page */ }

  if (!res.ok || !data.access_token) {
    console.error(JSON.stringify({
      evt: "coop_token_error",
      correlationId,
      url,
      method: "POST",
      uses_proxy: usesProxy(url),
      status: res.status,
      raw_body: bodyText.slice(0, 1000),
    }));
    throw new UpstreamError(res.status, url, bodyText);
  }
  const ttlMs = (Number(data.expires_in) || 3600) * 1000;
  cachedToken = { token: data.access_token, expiresAt: now + ttlMs };
  return data.access_token as string;
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

    const operatorCode = Deno.env.get("COOP_OPERATOR_CODE") || "";
    if (!operatorCode) {
      console.warn(JSON.stringify({
        evt: "coop_operator_code_missing",
        correlationId,
        message: "COOP_OPERATOR_CODE env var is not set — Co-op will reject the STK request.",
      }));
    }

    const coopPayload = {
      MessageReference: messageReference,
      CallBackUrl: callbackUrl,
      OperatorCode: operatorCode,
      TransactionCurrency: "KES",
      MobileNumber: normalizedPhone,
      Narration: narration || `Sale ${sale_id.slice(0, 8)}`,
      Amount: Number(amount),
      MessageDateTime: new Date().toISOString(),
      OtherDetails: [
        { Name: "Wonder Aqua", Value: "1" },
      ],
    };

    console.log(JSON.stringify({
      evt: "coop_stk_flow_start",
      correlationId,
      sale_id,
      message_reference: messageReference,
      proxy_base_configured: Boolean(getProxyBase()),
      proxy_base: getProxyBase() || null,
      proxy_secret_configured: Boolean(Deno.env.get("COOP_PROXY_SECRET")),
      callback_url: callbackUrl,
      payload: coopPayload,
    }));

    // Upsert PENDING payment row
    if (existing) {
      await admin
        .from("payments")
        .update({
          amount: Number(amount),
          phone_number: normalizedPhone,
          status: "PENDING",
          raw_request: coopPayload,
          correlation_id: correlationId,
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
        correlation_id: correlationId,
      });
    }


    // LIVE MODE — Co-op Bank OpenAPI driven entirely by COOP_CONFIG_JSON.
    let cfg: CoopConfig;
    try {
      cfg = parseCoopConfig();
      console.log(JSON.stringify({
        evt: "coop_config_loaded",
        correlationId,
        token_url: cfg.tokenUrl,
        stk_url: cfg.stkUrl,
        token_uses_proxy: usesProxy(cfg.tokenUrl),
        stk_uses_proxy: usesProxy(cfg.stkUrl),
        proxy_base_configured: Boolean(getProxyBase()),
        proxy_secret_configured: Boolean(Deno.env.get("COOP_PROXY_SECRET")),
      }));
    } catch (e) {
      console.error(JSON.stringify({
        evt: "coop_config_error",
        correlationId,
        message: (e as Error).message,
      }));
      // Leave payment PENDING so it can be retried once secrets are fixed.
      return new Response(
        JSON.stringify({
          ok: false,
          fallback: true,
          error_code: "CONFIG_MISSING",
          message: "Payment gateway is being configured. Please retry later.",
          correlation_id: correlationId,
          message_reference: messageReference,
        }),
        { status: 200, headers: respHeaders },
      );
    }

    // Helper: build the graceful upstream-failure response (HTTP 200, fallback:true)
    const upstreamFallback = async (
      errorCode: string,
      upstreamStatus: number,
      upstreamUrl: string,
      bodySnippet: string,
    ) => {
      console.error(JSON.stringify({
        evt: "coop_upstream_blocked",
        correlationId,
        sale_id,
        message_reference: messageReference,
        error_code: errorCode,
        upstream_status: upstreamStatus,
        upstream_url: upstreamUrl,
        upstream_body: bodySnippet,
      }));
      // Keep payment PENDING — the bank never accepted it, so the cashier can retry.
      await admin
        .from("payments")
        .update({
          status: "PENDING",
          result_code: String(upstreamStatus),
          result_description:
            `Upstream ${errorCode} (${upstreamStatus}) — ${bodySnippet.slice(0, 180)}`,
          raw_payload: {
            stage: upstreamUrl.includes("/token") ? "TOKEN" : "STK",
            error_code: errorCode,
            upstream_status: upstreamStatus,
            upstream_url: upstreamUrl,
            raw_body: bodySnippet,
            correlation_id: correlationId,
            uses_proxy: usesProxy(upstreamUrl),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("message_reference", messageReference);
      return new Response(
        JSON.stringify({
          ok: false,
          fallback: true,
          error_code: errorCode,
          message: "Payment provider authorization pending. Please retry later.",
          correlation_id: correlationId,
          message_reference: messageReference,
        }),
        { status: 200, headers: respHeaders },
      );
    };

    try {
      const token = await getCoopTokenFromCfg(cfg, correlationId);

      const t0 = Date.now();
      const stkRes = await fetch(cfg.stkUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "WonderAquaPOS/1.0 (+https://wonderaqua.co.ke)",
          "X-Correlation-Id": correlationId,
          ...(Deno.env.get("COOP_PROXY_SECRET")
            ? { "X-Proxy-Secret": Deno.env.get("COOP_PROXY_SECRET")! }
            : {}),
        },
        body: JSON.stringify(coopPayload),
      });
      const stkText = await stkRes.text();
      let stkData: any = {};
      try { stkData = JSON.parse(stkText); } catch { /* HTML/error page */ }

      console.log(JSON.stringify({
        evt: "coop_stk",
        correlationId,
        sale_id,
        message_reference: messageReference,
        url: cfg.stkUrl,
        method: "POST",
        uses_proxy: usesProxy(cfg.stkUrl),
        request_payload: coopPayload,
        status: stkRes.status,
        duration_ms: Date.now() - t0,
        upstream_headers: {
          "x-akamai-request-id": stkRes.headers.get("x-akamai-request-id"),
          "x-cache": stkRes.headers.get("x-cache"),
          "x-proxy-egress-ip": stkRes.headers.get("x-proxy-egress-ip"),
          "x-proxy-upstream": stkRes.headers.get("x-proxy-upstream"),
          "server": stkRes.headers.get("server"),
        },
        response: stkData?.MessageReference ? stkData : stkText.slice(0, 500),
      }));

      // Refresh token + retry once on 401
      let finalRes = stkRes;
      let finalData = stkData;
      let finalText = stkText;
      if (stkRes.status === 401) {
        cachedToken = null;
        const fresh = await getCoopTokenFromCfg(cfg, correlationId);
        finalRes = await fetch(cfg.stkUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${fresh}`,
            "Content-Type": "application/json",
            Accept: "application/json",
            "User-Agent": "WonderAquaPOS/1.0 (+https://wonderaqua.co.ke)",
            "X-Correlation-Id": correlationId,
            ...(Deno.env.get("COOP_PROXY_SECRET")
              ? { "X-Proxy-Secret": Deno.env.get("COOP_PROXY_SECRET")! }
              : {}),
          },
          body: JSON.stringify(coopPayload),
        });
        finalText = await finalRes.text();
        try { finalData = JSON.parse(finalText); } catch { finalData = {}; }
        console.log(JSON.stringify({
          evt: "coop_stk_retry",
          correlationId,
          sale_id,
          message_reference: messageReference,
          url: cfg.stkUrl,
          method: "POST",
          uses_proxy: usesProxy(cfg.stkUrl),
          status: finalRes.status,
          upstream_headers: {
            "x-akamai-request-id": finalRes.headers.get("x-akamai-request-id"),
            "x-cache": finalRes.headers.get("x-cache"),
            "x-proxy-egress-ip": finalRes.headers.get("x-proxy-egress-ip"),
            "x-proxy-upstream": finalRes.headers.get("x-proxy-upstream"),
            "server": finalRes.headers.get("server"),
          },
          response: finalData?.MessageReference ? finalData : finalText.slice(0, 500),
        }));
      }

      if (!finalRes.ok) {
        // Treat WAF/auth blocks as retryable upstream failures, not hard FAILED.
        const isWafBlock =
          finalRes.status === 401 || finalRes.status === 403 ||
          finalRes.status === 503 || finalText.trimStart().startsWith("<");
        if (isWafBlock) {
          return upstreamFallback(
            finalRes.status === 403 ? "UPSTREAM_FORBIDDEN" : "UPSTREAM_UNAVAILABLE",
            finalRes.status,
            cfg.stkUrl,
            finalText.slice(0, 500).replace(/\s+/g, " ").trim(),
          );
        }
        await admin
          .from("payments")
          .update({
            status: "FAILED",
            result_code: String(finalRes.status),
            result_description:
              finalData?.ResultDesc || finalData?.message || "STK push request failed",
            raw_payload: {
              stage: "STK",
              status: finalRes.status,
              url: cfg.stkUrl,
              uses_proxy: usesProxy(cfg.stkUrl),
              response: finalData && Object.keys(finalData).length > 0 ? finalData : finalText.slice(0, 1000),
              correlation_id: correlationId,
            },
          })
          .eq("message_reference", messageReference);
        return new Response(
          JSON.stringify({
            ok: false,
            error_code: "STK_FAILED",
            message: finalData?.ResultDesc || "STK push failed",
            details: finalData,
            correlation_id: correlationId,
          }),
          { status: 200, headers: respHeaders },
        );
      }

      return new Response(
        JSON.stringify({
          ok: true,
          message_reference: messageReference,
          response: finalData,
          correlation_id: correlationId,
          token_url: cfg.tokenUrl,
          stk_url: cfg.stkUrl,
          uses_proxy: usesProxy(cfg.tokenUrl) && usesProxy(cfg.stkUrl),
        }),
        { status: 200, headers: respHeaders },
      );
    } catch (err) {
      if (err instanceof UpstreamError) {
        return upstreamFallback(
          err.status === 403 ? "UPSTREAM_FORBIDDEN" : "UPSTREAM_UNAVAILABLE",
          err.status,
          err.url,
          err.bodySnippet,
        );
      }
      console.error(JSON.stringify({
        evt: "stk_unhandled_error",
        correlationId,
        message: String((err as Error).message),
        stack: (err as Error).stack,
      }));
      // Leave payment PENDING for retry — don't poison the row.
      return new Response(
        JSON.stringify({
          ok: false,
          fallback: true,
          error_code: "UNEXPECTED_ERROR",
          message: "Payment provider unreachable. Please retry later.",
          correlation_id: correlationId,
          message_reference: messageReference,
        }),
        { status: 200, headers: respHeaders },
      );
    }
  } catch (e) {
    console.error(JSON.stringify({
      evt: "mpesa_stk_push_error",
      correlationId,
      message: String((e as Error).message),
      stack: (e as Error).stack,
    }));
    return new Response(
      JSON.stringify({
        ok: false,
        error_code: "INTERNAL_ERROR",
        message: "Internal error. Please retry.",
        correlation_id: correlationId,
      }),
      { status: 200, headers: respHeaders },
    );
  }
});
