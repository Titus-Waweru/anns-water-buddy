// Co-op Bank Transaction Status query.
// Co-op has confirmed that STK Push does NOT deliver callbacks in production.
// Payment completion must be discovered by actively polling the
// Transaction Status API using the MessageReference from the STK request.
//
// This function:
//   1. Loads Co-op credentials + statusUrl from COOP_CONFIG_JSON.
//   2. Fetches a token (same auth logic as mpesa-stk-push).
//   3. Calls the status endpoint via the AWS proxy for a given MessageReference.
//   4. Interprets the ResultCode/StatusCode and updates the `payments` +
//      `sales` rows exactly like mpesa-callback used to.
//   5. Returns { status, result_code, result_description, raw } to the caller.
//
// It does NOT re-issue STK, mutate the sale in any other way, or duplicate
// payment records. It reuses the existing PENDING row keyed by message_reference.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// -------------------- Co-op config (mirrors mpesa-stk-push) --------------------
type CoopConfig = {
  tokenUrl: string;
  statusUrl: string;
  consumerKey: string;
  consumerSecret: string;
  rawBasicAuth?: string;
};
let cachedConfig: CoopConfig | null = null;
let cachedToken: { token: string; expiresAt: number } | null = null;

function pickBasicAuth(node: any): { user?: string; pass?: string } {
  const basic = node?.auth?.basic;
  if (!basic) return {};
  if (Array.isArray(basic)) {
    const get = (k: string) => basic.find((b: any) => b?.key === k)?.value;
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
function readVars(node: any): Record<string, string> {
  const out: Record<string, string> = {};
  const v = node?.variable ?? node?.variables;
  if (Array.isArray(v)) {
    for (const item of v) {
      if (item?.key) out[String(item.key).toLowerCase()] = String(item.value ?? "");
    }
  } else if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v)) {
      out[k.toLowerCase()] = typeof val === "string" ? val : (val as any)?.value ?? "";
    }
  }
  return out;
}
function pickCredsFromVars(vars: Record<string, string>) {
  const userKeys = ["consumer_key","consumerkey","client_id","clientid","username","api_key","apikey","user"];
  const passKeys = ["consumer_secret","consumersecret","client_secret","clientsecret","password","api_secret","apisecret","secret","pass"];
  let user: string | undefined, pass: string | undefined;
  for (const k of userKeys) if (!user && vars[k]) user = vars[k];
  for (const k of passKeys) if (!pass && vars[k]) pass = vars[k];
  return { user, pass };
}
function pickRawBasic(headers: any[]): string | undefined {
  if (!Array.isArray(headers)) return undefined;
  for (const h of headers) {
    if (String(h?.key || "").toLowerCase() !== "authorization") continue;
    const m = String(h?.value || "").match(/Basic\s+([A-Za-z0-9+/=]+)/i);
    if (m) return m[1];
  }
  return undefined;
}

function parseCoopConfig(): CoopConfig {
  if (cachedConfig) return cachedConfig;
  const raw = Deno.env.get("COOP_CONFIG_JSON");
  if (!raw) throw new Error("COOP_CONFIG_JSON not configured");
  const parsed = JSON.parse(raw);

  let { user, pass } = pickBasicAuth(parsed);
  const collectionVars = readVars(parsed);
  if (!user || !pass) {
    const v = pickCredsFromVars(collectionVars);
    user = user || v.user;
    pass = pass || v.pass;
  }

  let tokenUrl = "";
  let statusUrl = "";
  let tokenRawBasic: string | undefined;

  walkItems(parsed.item || [], (it) => {
    const name = String(it.name || "").toLowerCase();
    const url = urlToString(it.request?.url);
    const lower = url.toLowerCase();
    const isTokenItem =
      name.includes("token") || lower.endsWith("/token") || lower.includes("/token?");
    // Heuristic: transaction status / query / enquiry endpoints
    const isStatusItem =
      name.includes("status") || name.includes("query") || name.includes("enquiry") ||
      lower.includes("/status") || lower.includes("/query") || lower.includes("/enquiry");
    if (url) {
      if (!tokenUrl && isTokenItem) tokenUrl = url.split("?")[0];
      if (!statusUrl && isStatusItem) statusUrl = url;
    }
    if (isTokenItem && !tokenRawBasic) {
      const b = pickRawBasic(it.request?.header);
      if (b) tokenRawBasic = b;
    }
  });

  if (tokenRawBasic && (!user || !pass)) {
    try {
      const decoded = atob(tokenRawBasic);
      const idx = decoded.indexOf(":");
      if (idx > 0) { user = user || decoded.slice(0, idx); pass = pass || decoded.slice(idx + 1); }
    } catch { /* ignore */ }
  }

  const resolveVars = (s: string) =>
    s.replace(/\{\{(\w+)\}\}/g, (_, k) => collectionVars[String(k).toLowerCase()] ?? "");
  tokenUrl = resolveVars(tokenUrl) || "https://openapi.co-opbank.co.ke/token";
  statusUrl = resolveVars(statusUrl) ||
    (Deno.env.get("COOP_STATUS_URL") || "https://openapi.co-opbank.co.ke/FT/stk/1.0.0/status");

  const proxyBase = (Deno.env.get("COOP_PROXY_BASE_URL") || "").replace(/\/+$/, "");
  if (proxyBase) {
    const swap = (u: string) => u.replace(/^https?:\/\/openapi\.co-opbank\.co\.ke/i, proxyBase);
    tokenUrl = swap(tokenUrl);
    statusUrl = swap(statusUrl);
  }

  if (!user || !pass) throw new Error("COOP_CONFIG_JSON missing credentials");

  cachedConfig = {
    tokenUrl,
    statusUrl,
    consumerKey: user,
    consumerSecret: pass,
    rawBasicAuth: tokenRawBasic,
  };
  return cachedConfig;
}

async function getToken(cfg: CoopConfig, correlationId: string): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 30_000) return cachedToken.token;
  const creds = cfg.rawBasicAuth ?? btoa(`${cfg.consumerKey}:${cfg.consumerSecret}`);
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "WonderAquaPOS/1.0",
      "X-Correlation-Id": correlationId,
      ...(Deno.env.get("COOP_PROXY_SECRET")
        ? { "X-Proxy-Secret": Deno.env.get("COOP_PROXY_SECRET")! }
        : {}),
    },
    body: "grant_type=client_credentials",
  });
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch { /* */ }
  if (!res.ok || !data.access_token) {
    throw new Error(`Token fetch failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const ttl = (Number(data.expires_in) || 3600) * 1000;
  cachedToken = { token: data.access_token, expiresAt: now + ttl };
  return data.access_token;
}

// Interpret Co-op status response into { status, code, desc, receipt }.
function interpret(raw: any): {
  status: "PENDING" | "SUCCESS" | "FAILED" | "CANCELLED";
  code: string | null;
  desc: string | null;
  receipt: string | null;
} {
  if (!raw || typeof raw !== "object") {
    return { status: "PENDING", code: null, desc: null, receipt: null };
  }
  const node = raw.Data || raw;
  const codeVal = node.ResultCode ?? node.StatusCode ?? node.MessageCode;
  const desc = node.ResultDesc ?? node.StatusDescription ?? node.MessageDescription ?? null;
  const receipt = node.TransactionID ?? node.ThirdPartyTransID ?? node.MpesaReceiptNumber ?? null;
  if (codeVal == null) return { status: "PENDING", code: null, desc, receipt: null };
  const code = String(codeVal);
  // Co-op: "0" = success. 1032 = cancelled by user. Others = failed.
  if (code === "0") return { status: "SUCCESS", code, desc, receipt };
  if (code === "1032") return { status: "CANCELLED", code, desc, receipt: null };
  // "still processing" style codes — treat as PENDING so cashier keeps polling.
  const descLower = (desc || "").toLowerCase();
  if (descLower.includes("processing") || descLower.includes("pending") || descLower.includes("in progress")) {
    return { status: "PENDING", code, desc, receipt: null };
  }
  return { status: "FAILED", code, desc, receipt: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const correlationId = req.headers.get("x-correlation-id") || crypto.randomUUID();
  const respHeaders = { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId };

  try {
    const body = await req.json().catch(() => ({}));
    const messageReference: string | undefined = body?.message_reference;
    if (!messageReference) {
      return new Response(JSON.stringify({ ok: false, error: "message_reference is required" }),
        { status: 400, headers: respHeaders });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: payment } = await admin
      .from("payments")
      .select("id, sale_id, status, message_reference")
      .eq("message_reference", messageReference)
      .maybeSingle();

    if (!payment) {
      return new Response(JSON.stringify({ ok: false, error: "payment not found" }),
        { status: 404, headers: respHeaders });
    }

    // Terminal states — return current status without hitting Co-op again.
    if (payment.status === "SUCCESS" || payment.status === "FAILED" || payment.status === "CANCELLED") {
      return new Response(JSON.stringify({
        ok: true, status: payment.status, terminal: true, message_reference: messageReference,
      }), { status: 200, headers: respHeaders });
    }

    const cfg = parseCoopConfig();
    const token = await getToken(cfg, correlationId);

    // Co-op status query payload — MessageReference is the required lookup key.
    // MessageDateTime keeps parity with STK request format.
    const statusPayload = {
      MessageReference: messageReference,
      MessageDateTime: new Date().toISOString(),
    };

    const t0 = Date.now();
    const res = await fetch(cfg.statusUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "WonderAquaPOS/1.0",
        "X-Correlation-Id": correlationId,
        ...(Deno.env.get("COOP_PROXY_SECRET")
          ? { "X-Proxy-Secret": Deno.env.get("COOP_PROXY_SECRET")! }
          : {}),
      },
      body: JSON.stringify(statusPayload),
    });
    const text = await res.text();
    let data: any = {};
    try { data = JSON.parse(text); } catch { /* html/error */ }

    console.log(JSON.stringify({
      evt: "coop_tx_status",
      correlationId,
      message_reference: messageReference,
      status_code: res.status,
      duration_ms: Date.now() - t0,
      response: data && Object.keys(data).length ? data : text.slice(0, 400),
    }));

    // Upstream error: keep PENDING, surface message to caller so UI shows retry.
    if (!res.ok) {
      return new Response(JSON.stringify({
        ok: false,
        status: "PENDING",
        upstream_status: res.status,
        error: `Upstream ${res.status}`,
        raw: text.slice(0, 500),
        message_reference: messageReference,
      }), { status: 200, headers: respHeaders });
    }

    const { status, code, desc, receipt } = interpret(data);

    // Persist the response so PaymentsTrace shows it and reconcile sees it.
    const update: Record<string, unknown> = {
      raw_payload: data,
      updated_at: new Date().toISOString(),
    };
    if (code) update.result_code = code;
    if (desc) update.result_description = desc;
    if (receipt) update.narration = `Receipt ${receipt}`;

    if (status !== "PENDING") {
      update.status = status;
    }

    await admin.from("payments").update(update).eq("id", payment.id);

    if (status === "SUCCESS" && payment.sale_id) {
      await admin.from("sales").update({ payment_status: "PAID" }).eq("id", payment.sale_id);
    } else if ((status === "FAILED" || status === "CANCELLED") && payment.sale_id) {
      await admin.from("sales").update({ payment_status: status }).eq("id", payment.sale_id);
    }

    return new Response(JSON.stringify({
      ok: true,
      status,
      result_code: code,
      result_description: desc,
      receipt,
      message_reference: messageReference,
      raw: data,
    }), { status: 200, headers: respHeaders });
  } catch (err) {
    console.error(JSON.stringify({
      evt: "tx_status_error",
      correlationId,
      message: (err as Error).message,
    }));
    return new Response(JSON.stringify({
      ok: false, status: "PENDING", error: (err as Error).message,
    }), { status: 200, headers: respHeaders });
  }
});
