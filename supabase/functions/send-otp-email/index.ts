import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, otp, type } = await req.json();

    if (!email || !otp) {
      return new Response(
        JSON.stringify({ error: "Missing email or otp" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const typeLabel = type === "signup" ? "Account Verification" : type === "reset" ? "Password Reset" : "Login Verification";

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f0f9ff;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f9ff;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;box-shadow:0 4px 24px rgba(0,60,120,0.08);overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0c2d48 0%,#145da0 50%,#2e8bc0 100%);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">
                💧 Wonder Aqua LTD
              </h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">
                Secure ${typeLabel}
              </p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <h2 style="margin:0 0 8px;color:#0c2d48;font-size:18px;font-weight:600;">
                Security Code
              </h2>
              <p style="margin:0 0 24px;color:#5a6a7a;font-size:14px;line-height:1.6;">
                Use the code below to complete your ${typeLabel.toLowerCase()}. This code is valid for <strong>5 minutes</strong>.
              </p>
              <!-- OTP Code -->
              <div style="background:linear-gradient(135deg,#f0f9ff,#e6f2ff);border:2px dashed #2e8bc0;border-radius:12px;padding:20px;text-align:center;margin:0 0 24px;">
                <span style="font-size:36px;font-weight:800;letter-spacing:8px;color:#0c2d48;font-family:'Courier New',monospace;">
                  ${otp}
                </span>
              </div>
              <p style="margin:0 0 16px;color:#5a6a7a;font-size:13px;line-height:1.5;">
                If you didn't request this code, please ignore this email. Your account is safe.
              </p>
              <hr style="border:none;border-top:1px solid #e8eef3;margin:20px 0;" />
              <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;line-height:1.5;">
                This is an automated message from Wonder Aqua LTD.<br />
                Do not share this code with anyone.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;padding:16px 40px;text-align:center;border-top:1px solid #e8eef3;">
              <p style="margin:0;color:#94a3b8;font-size:11px;">
                © ${new Date().getFullYear()} Wonder Aqua LTD · Water Distribution Management
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Wonder Aqua Security <security@wonderaqua.co.ke>",
        to: [email],
        subject: `${otp} — Wonder Aqua ${typeLabel}`,
        html: htmlContent,
      }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      console.error("Resend API error:", JSON.stringify(resendData));
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: resendData }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, messageId: resendData.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("send-otp-email error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
