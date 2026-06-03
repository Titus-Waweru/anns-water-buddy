# Co-op Bank AWS Proxy — Deployment Guide

The proxy runs on the AWS server holding Elastic IP **13.62.244.124** (the IP
Co-operative Bank has whitelisted). Supabase Edge Functions call this proxy
instead of `openapi.co-opbank.co.ke` directly, so every outbound bank request
egresses from the whitelisted IP.

## New request path

```
Browser (wonderaqua.co.ke)
  └─► Supabase Edge Function   (mpesa-stk-push)
        └─► HTTPS to https://wonderaqua.co.ke/coop/token
              └─► nginx on AWS  (Elastic IP 13.62.244.124)  ◄── BANK SEES THIS IP
                    └─► HTTPS to https://openapi.co-opbank.co.ke/token
                          └─► Akamai → Co-op core
Callback: Co-op → https://<project>.functions.supabase.co/mpesa-callback
```

No browser-to-bank traffic anywhere in the flow.

## One-time AWS setup

Assumes Ubuntu 22.04+ on the AWS instance, DNS A record
`wonderaqua.co.ke → 13.62.244.124` already in place, and ports 80/443 open in
the security group.

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx

# 1. TLS certificate (Let's Encrypt)
sudo certbot --nginx -d wonderaqua.co.ke --non-interactive --agree-tos -m ops@wonderaqua.co.ke

# 2. Drop in the proxy config
sudo cp aws-proxy/nginx/coop-proxy.conf /etc/nginx/sites-available/coop-proxy.conf
sudo ln -sf /etc/nginx/sites-available/coop-proxy.conf /etc/nginx/sites-enabled/coop-proxy.conf

# 3. Validate + reload
sudo nginx -t && sudo systemctl reload nginx

# 4. Optional hardening: log rotation for the structured JSON log
sudo cp aws-proxy/logrotate/coop-proxy /etc/logrotate.d/coop-proxy
```

## Wire the Edge Function to the proxy

Add a single runtime secret in Supabase (Project Settings → Edge Functions →
Secrets) — no code change required:

```
COOP_PROXY_BASE_URL = https://wonderaqua.co.ke/coop
```

The `mpesa-stk-push` function reads this env var and rewrites every Co-op URL
(`https://openapi.co-opbank.co.ke/...` → `https://wonderaqua.co.ke/coop/...`).
Unsetting the secret reverts to direct bank calls.

## Verification — proves bank sees 13.62.244.124

### A) From the AWS box (sanity)

```bash
curl -sv https://wonderaqua.co.ke/coop/_health
# {"ok":true,"egress_ip":"13.62.244.124",...}
```

### B) From your laptop (forces the full Edge Function path)

```bash
curl -sS https://ltsjhyqjtssroftxjvht.supabase.co/functions/v1/mpesa-proxy-verify \
     -H "Authorization: Bearer $SUPABASE_ANON_KEY" | jq
```

Expected response includes:

```json
{
  "proxy_url": "https://wonderaqua.co.ke/coop/token",
  "proxy_status": 401,                  // Co-op rejects unauth GET — proves we REACHED it
  "akamai_blocked": false,
  "proxy_egress_ip_header": "13.62.244.124",
  "verdict": "Outbound bank traffic now egresses from the whitelisted AWS IP."
}
```

An Akamai 403 HTML response would mean the proxy itself isn't running, the env
var isn't set, or the DNS isn't pointing to 13.62.244.124.

### C) Confirm at the bank

Share the next `correlation_id` returned by `/functions/v1/mpesa-stk-push` with
Co-op support. They will see the request source IP as `13.62.244.124` in their
WAF logs — that is the definitive proof.

## Operational notes

- Logs: `/var/log/nginx/coop-proxy.access.log` (JSON, includes `correlation_id`).
- TLS auto-renews via certbot's systemd timer.
- The `geo $coop_allowed` block restricts the proxy to Supabase Edge ranges +
  localhost. Tighten further once you know your exact Edge egress CIDRs.
- All existing logic — PENDING payments, callbacks, `mpesa-reconcile` cron,
  correlation IDs, `PaymentsTrace` admin page — is preserved untouched.
