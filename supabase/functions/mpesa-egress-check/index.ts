// Diagnostic: reveals the ACTUAL outbound IP used by this edge function
// and the raw response Co-op's WAF returns to that IP.
// No credentials are required to surface the WAF block — the 403 happens
// before authentication, so this is safe to expose to admins.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function fetchJson(url: string, timeoutMs = 5000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    const text = await res.text();
    try { return { status: res.status, body: JSON.parse(text) }; }
    catch { return { status: res.status, body: text.slice(0, 300) }; }
  } catch (e) {
    return { error: String((e as Error).message) };
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const correlationId = crypto.randomUUID();

  // 1) Detect THIS edge function's actual egress IP from multiple sources
  const [ipify, ifconfig, ipapi] = await Promise.all([
    fetchJson("https://api.ipify.org?format=json"),
    fetchJson("https://ifconfig.me/all.json"),
    fetchJson("https://ipapi.co/json/"),
  ]);

  const detectedIp =
    (ipify as any)?.body?.ip ||
    (ifconfig as any)?.body?.ip_addr ||
    (ipapi as any)?.body?.ip ||
    "unknown";

  // 2) Hit Co-op's token endpoint from THIS runtime — capture raw WAF response
  const coopUrl = "https://openapi.co-opbank.co.ke/token?grant_type=client_credentials";
  let coopProbe: any = {};
  try {
    const t0 = Date.now();
    const res = await fetch(coopUrl, {
      headers: {
        "User-Agent": "WonderAquaPOS-Diagnostic/1.0",
        Accept: "application/json",
        "X-Correlation-Id": correlationId,
      },
    });
    const body = await res.text();
    coopProbe = {
      url: coopUrl,
      status: res.status,
      duration_ms: Date.now() - t0,
      is_html: body.trimStart().startsWith("<"),
      akamai_reference: (body.match(/Reference&#32;&#35;([^\s<]+)/)?.[1]) || null,
      body_snippet: body.slice(0, 600).replace(/\s+/g, " ").trim(),
      response_headers: {
        server: res.headers.get("server"),
        "x-akamai-request-id": res.headers.get("x-akamai-request-id"),
        "x-cache": res.headers.get("x-cache"),
        "content-type": res.headers.get("content-type"),
      },
    };
  } catch (e) {
    coopProbe = { error: String((e as Error).message) };
  }

  const whitelistedAwsIp = "13.62.244.124";
  const matchesWhitelist = detectedIp === whitelistedAwsIp;

  const diagnosis = matchesWhitelist
    ? "Edge function IS using the whitelisted AWS IP. Bank-side issue."
    : `Edge function egress IP (${detectedIp}) does NOT match whitelisted AWS IP (${whitelistedAwsIp}). ` +
      "Supabase Edge Functions run on Deno Deploy's global pool — they do NOT use your AWS server's IP. " +
      "Either (a) whitelist Supabase egress IPs at the bank, or (b) route STK calls through your AWS server as a proxy.";

  return new Response(
    JSON.stringify({
      correlation_id: correlationId,
      runtime: {
        deno_version: (Deno as any).version?.deno,
        region: Deno.env.get("DENO_REGION") || Deno.env.get("SB_REGION") || "unknown",
      },
      detected_outbound_ip: detectedIp,
      whitelisted_aws_ip: whitelistedAwsIp,
      ip_matches_whitelist: matchesWhitelist,
      ip_sources: { ipify, ifconfig, ipapi },
      coop_probe: coopProbe,
      diagnosis,
      recommended_fixes: matchesWhitelist ? [
        "Confirm with bank that the consumer_key is enabled for production.",
        "Verify COOP_CONFIG_JSON contains LIVE (not sandbox) credentials.",
      ] : [
        `Ask the bank to whitelist the detected egress IP: ${detectedIp} (note: it can rotate).`,
        "Better: deploy a tiny proxy on your AWS box (13.62.244.124) that forwards /token and /FT/stk/1.0.0 to Co-op, and point COOP_CONFIG_JSON URLs at that proxy.",
        "Best: use a static-egress provider (QuotaGuard, Fixie) and whitelist that single IP at the bank.",
      ],
    }, null, 2),
    { headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId } },
  );
});
