// =========================================================
// EKO TRANSITCARE — Edge Function: send-transitcare-email
// Receives queued emails from the database and sends via Resend.
// =========================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL     = Deno.env.get("FROM_EMAIL") ?? "onboarding@resend.dev";
const FROM_NAME      = Deno.env.get("FROM_NAME")  ?? "Eko TransitCare";
const SHARED_SECRET  = Deno.env.get("SHARED_SECRET") ?? "";

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
  type?: string;
}

function htmlLayout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title></head>
<body style="margin:0;padding:0;background:#0A0E1F;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A0E1F;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,0.35);">
        <tr>
          <td style="background:linear-gradient(135deg,#1E1B4B 0%,#4F46E5 60%,#6D5FFA 100%);padding:26px 28px;color:#FFFFFF;">
            <p style="margin:0;font-size:22px;font-weight:800;letter-spacing:-0.02em;">🚌 Eko TransitCare</p>
            <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.82);">Know Your Ride Before You Leave.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 28px;color:#0F172A;font-size:15px;line-height:1.65;">
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="background:#F8FAFC;padding:20px 28px;border-top:1px solid #E7E9F2;color:#64748B;font-size:12px;text-align:center;">
            Powered by <strong style="color:#4F46E5;">Ajigbeda Girls Digital Queens</strong><br />
            © ${new Date().getFullYear()} Eko TransitCare. All rights reserved.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type, x-transitcare-secret",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      }
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  if (SHARED_SECRET) {
    const provided = req.headers.get("x-transitcare-secret") || "";
    if (provided !== SHARED_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
  }

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY is not set" }), { status: 500 });
  }

  let payload: EmailPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  if (!payload.to || !payload.subject || !payload.html) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
  }

  const html = htmlLayout(payload.subject, payload.html);

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [payload.to],
      subject: payload.subject,
      html,
      text: payload.text || undefined
    })
  });

  const result = await resendResponse.json();

  if (!resendResponse.ok) {
    console.error("[TransitCare] Resend error:", result);
    return new Response(
      JSON.stringify({ error: "Resend failed", detail: result }),
      { status: 502 }
    );
  }

  return new Response(
    JSON.stringify({ ok: true, id: result.id, to: payload.to, type: payload.type }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
