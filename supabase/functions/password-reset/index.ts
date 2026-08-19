import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function sha256(value: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Returns the auth user for an email without sending any email.
async function findUser(email: string) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (error) return null;
  return data?.user ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const action = String(body.action ?? "");
    const email = String(body.email ?? "").trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Invalid email address" }, 400);
    }

    if (action === "request") {
      const user = await findUser(email);
      // Always respond success to avoid leaking which emails exist.
      if (!user) return json({ success: true });

      // Throttle: max 1 code per 45s
      const { data: recent } = await admin
        .from("password_reset_otps")
        .select("created_at")
        .eq("email", email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (recent && Date.now() - new Date(recent.created_at).getTime() < 45_000) {
        return json({ error: "Please wait a moment before requesting another code." }, 429);
      }

      const code = String(Math.floor(100000 + Math.random() * 900000));
      const code_hash = await sha256(`${email}:${code}`);

      const { error: insErr } = await admin.from("password_reset_otps").insert({
        email,
        code_hash,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
      if (insErr) return json({ error: "Could not start password reset. Try again." }, 500);

      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-otp-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY },
        body: JSON.stringify({ email, otp: code, type: "reset" }),
      });
      if (!res.ok) {
        console.error("send-otp-email failed", await res.text());
        return json({ error: "Failed to send verification code. Try again." }, 502);
      }

      return json({ success: true });
    }

    if (action === "confirm") {
      const code = String(body.code ?? "").trim();
      const password = String(body.password ?? "");
      if (!/^\d{6}$/.test(code)) return json({ error: "Invalid code." }, 400);
      if (password.length < 6) return json({ error: "Password must be at least 6 characters." }, 400);

      const { data: row } = await admin
        .from("password_reset_otps")
        .select("*")
        .eq("email", email)
        .is("used_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!row) return json({ error: "No active reset request. Request a new code." }, 400);
      if (new Date(row.expires_at).getTime() < Date.now()) {
        return json({ error: "Code expired. Request a new code." }, 400);
      }
      if (row.attempts >= 5) {
        return json({ error: "Too many attempts. Request a new code." }, 429);
      }

      const hash = await sha256(`${email}:${code}`);
      if (hash !== row.code_hash) {
        await admin.from("password_reset_otps").update({ attempts: row.attempts + 1 }).eq("id", row.id);
        return json({ error: "Invalid code. Please try again." }, 400);
      }

      const user = await findUser(email);
      if (!user) return json({ error: "Account not found." }, 400);

      const { error: updErr } = await admin.auth.admin.updateUserById(user.id, {
        password,
        email_confirm: true,
      });
      if (updErr) return json({ error: updErr.message }, 400);

      await admin.from("password_reset_otps").update({ used_at: new Date().toISOString() }).eq("id", row.id);

      return json({ success: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("password-reset error", e);
    return json({ error: "Unexpected error. Please try again." }, 500);
  }
});
