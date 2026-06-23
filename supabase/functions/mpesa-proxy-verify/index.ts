// Verifies that Co-op Bank traffic now egresses via the AWS proxy
// (Elastic IP 13.62.244.124) instead of the Supabase Edge runtime pool.
//
// Calls the proxy's /coop/token endpoint and inspects:
//   - presence of the X-Proxy-Egress-Ip header (proves nginx handled it)
//   - whether Akamai 403 HTML appears (would mean the proxy was bypassed)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const correlationId = crypto.randomUUID();
  const proxyBase = (Deno.env.get("COOP_PROXY_BASE_URL") || "").replace(/\/+$/, "");

  if (!proxyBase) {
    return new Response(
      JSON.stringify({
        ok: false,
        verdict:
          "COOP_PROXY_BASE_URL is not set. Add it (e.g. https://wonderaqua.co.ke/coop) in Edge Function secrets.",
        correlation_id: correlationId,
      }, null, 2),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Hit the proxy's /token endpoint with the internal proxy secret, but WITHOUT
  // bank credentials. This proves the Edge Function can reach nginx on AWS;
  // Co-op should then reject only at the bank-auth layer.
  const url = `${proxyBase}/token`;
  const t0 = Date.now();
  let probe: any = {};
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-Correlation-Id": correlationId,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "WonderAquaPOS-ProxyVerify/1.0",
        ...(Deno.env.get("COOP_PROXY_SECRET")
          ? { "X-Proxy-Secret": Deno.env.get("COOP_PROXY_SECRET")! }
          : {}),
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
    });
    const body = await res.text();
    const isHtml = body.trimStart().startsWith("<");
    const isAkamai = /Access Denied|edgesuite\.net/i.test(body);
    probe = {
      proxy_url: url,
      proxy_secret_configured: Boolean(Deno.env.get("COOP_PROXY_SECRET")),
      proxy_status: res.status,
      duration_ms: Date.now() - t0,
      response_is_html: isHtml,
      akamai_blocked: isAkamai,
      proxy_egress_ip_header: res.headers.get("x-proxy-egress-ip"),
      proxy_upstream_header: res.headers.get("x-proxy-upstream"),
      upstream_content_type: res.headers.get("content-type"),
      body_snippet: body.slice(0, 400).replace(/\s+/g, " ").trim(),
    };
  } catch (e) {
    probe = { error: String((e as Error).message), proxy_url: url };
  }

  const ok =
    probe.proxy_egress_ip_header === "13.62.244.124" && !probe.akamai_blocked;

  const verdict = !probe.proxy_egress_ip_header
    ? "Proxy did NOT respond with X-Proxy-Egress-Ip header — DNS or nginx config is wrong."
    : probe.akamai_blocked
    ? "Akamai WAF still blocking — DNS for wonderaqua.co.ke is NOT pointing at 13.62.244.124, or nginx is not proxying."
    : "Outbound bank traffic now egresses from the whitelisted AWS IP (13.62.244.124).";

  return new Response(
    JSON.stringify({
      ok,
      verdict,
      whitelisted_aws_ip: "13.62.244.124",
      correlation_id: correlationId,
      ...probe,
    }, null, 2),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId },
    },
  );
});
