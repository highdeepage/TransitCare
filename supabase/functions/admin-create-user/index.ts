// Eko TransitCare - admin-create-user (Supabase Edge Function)
// Lets a signed-in ACTIVE ADMINISTRATOR create a passenger, driver or operator
// account that works immediately (email already confirmed, no email sent).
// The service-role key lives only here on the server, never in the website.

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

export interface Deps {
  createClient: (url: string, key: string, opts?: unknown) => any;
  env: (name: string) => string | undefined;
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const url = deps.env("SUPABASE_URL"), anon = deps.env("SUPABASE_ANON_KEY"), service = deps.env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json({ error: "Function is not configured." }, 500);

  const auth = req.headers.get("Authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return json({ error: "Please sign in again." }, 401);

  // 1. Who is calling? Ask the database with the caller's own token.
  const caller = deps.createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const who = await caller.auth.getUser();
  if (who.error || !who.data || !who.data.user) return json({ error: "Please sign in again." }, 401);
  const isAdmin = await caller.rpc("tc_is_admin");
  if (isAdmin.error || isAdmin.data !== true) return json({ error: "Only administrators can create accounts." }, 403);

  // 2. Validate input.
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const role = String(body.role || "").toLowerCase();
  const name = String(body.full_name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const phone = String(body.phone || "").trim();
  const password = String(body.password || "");
  const approve = body.approve !== false;
  if (!["passenger", "driver", "operator"].includes(role)) return json({ error: "Role must be passenger, driver or operator." }, 400);
  if (name.length < 2) return json({ error: "Enter the person's full name." }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter a valid email address." }, 400);
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return json({ error: "Password must be at least 8 characters with letters and numbers." }, 400);
  }

  // 3. Create the account, already confirmed.
  const admin = deps.createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const created = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: name, phone: phone || null, role },
  });
  if (created.error || !created.data || !created.data.user) {
    const msg = (created.error && created.error.message) || "";
    if (/already|registered|exists/i.test(msg)) return json({ error: "An account with this email already exists." }, 409);
    return json({ error: msg || "Could not create the account." }, 400);
  }
  const user = created.data.user;

  // 4. Make sure the profile has the right role and status.
  const status = role === "driver" ? (approve ? "approved" : "email_verified") : "active";
  const prof = await admin.from("profiles").upsert(
    { id: user.id, full_name: name, email, phone: phone || null, role, status },
    { onConflict: "id" },
  );
  if (prof.error) return json({ error: "Account created but the profile could not be saved: " + prof.error.message, id: user.id }, 500);

  return json({ ok: true, id: user.id, email, role, status });
}

// Start the server only when running on Deno (so the handler can be unit-tested in Node).
const D = (globalThis as any).Deno;
if (D && D.serve) {
  D.serve(async (req: Request) => {
    const { createClient } = await import("npm:@supabase/supabase-js@2");
    return handle(req, { createClient, env: (n: string) => D.env.get(n) });
  });
}
