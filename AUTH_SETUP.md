# Eko TransitCare — sign-in setup (email code, Google, WhatsApp later)

The app code is finished. These steps are the Supabase / Google settings it depends on.
Do them in order; each one is a few minutes.

## 0. Database (once)
Supabase → SQL Editor → run, in this order:
1. `sql/001_fixes_and_phone_auth.sql`
2. `sql/002_features.sql`
3. `sql/003_secure_new_user.sql`  — **security fix**: stops anyone registering themselves as `admin`
   through the sign-up data, forces Google/phone sign-ups to be passengers, and stops users changing
   their own role/status/company. It ends by listing every current admin; make sure each one is yours.
4. `sql/004_admin_management.sql` — add / edit / suspend / demote / delete administrators.
5. `sql/005_terminals_users.sql` — terminal + route edit/delete, **route → terminal link** (a driver only
   sees terminals that serve the chosen route), and admin **Verify** of accounts. On first run it links
   each route to terminals whose location matches the route's origin; check them in Admin → Routes → Edit.

(`sql/000_inspect_schema.sql` only reads; run it if something misbehaves and send me the output.)

## 1. Email: 6-digit code instead of a link
1. Supabase → **Authentication → Emails → Templates → Confirm sign up**.
2. Subject: `Your Eko TransitCare verification code`.
3. Paste the contents of `email-templates/confirm-signup.html` (it contains the `{{ .Token }}` code AND a `{{ .ConfirmationURL }}` "Confirm my email" button, so the email and the app screen say the same thing).
   **If you skip this step Supabase keeps emailing a link and users never receive a code.**
4. **Authentication → Sign In / Providers → Email**: "Confirm email" ON; OTP length 6;
   **OTP expiry = 600 seconds** (the app shows a 10-minute countdown — keep them equal).
5. **Authentication → Emails → SMTP Settings**: your SMTP (Gmail app password for now,
   or Resend once you own a domain). Passwords/keys live only in Supabase, never in the repo.
6. **Authentication → URL Configuration**: Site URL `https://ekotransitcare.vercel.app`,
   Redirect URLs `https://ekotransitcare.vercel.app/**`.

Notes
- Supabase answers "Token has expired or is invalid" for both a wrong and an expired code,
  so the app says "incorrect, or it has just expired" unless its own countdown has run out.
- Resend has a 60-second cooldown; a new code cancels the previous one.
- Forgot-password still uses the existing reset link.

## 2. Google sign-in
1. Google Cloud Console → **APIs & Services → Credentials → Create credentials → OAuth client ID**
   (type: Web application). If asked, configure the consent screen first (External, app name
   Eko TransitCare, your support email).
2. **Authorised redirect URI**: `https://wjxldmgnglrrthzkzots.supabase.co/auth/v1/callback`
3. Copy the **Client ID** and **Client secret**.
4. Supabase → **Authentication → Sign In / Providers → Google** → enable, paste both, Save.
5. Done. The "Continue with Google" button now works. New Google users always become
   **passengers**; Google accounts whose email Google has not verified are refused and signed out.

## 3. WhatsApp OTP — intentionally OFF
The buttons say **Coming soon** and start nothing; no code is sent and nothing pretends to
succeed. In `script.js` the switch is `WHATSAPP_OTP_ENABLED: false`. When you are ready, set up a
WhatsApp provider in Supabase (Authentication → Providers → Phone) and flip it to `true`; the
sign-up / sign-in screens for it are already built.

## 4. Independent accounts
- An email account and a phone account are different Supabase users with different IDs and
  different passenger profiles. Nothing in the app merges them by name, email or phone.
- Platform behaviour to know: when someone signs in with Google using an email that already has
  an email/password account, Supabase itself links the two logins because both emails are
  verified. That is Supabase's built-in rule and cannot be switched off from the app.

## 5. Security notes
- Only the publishable (anon) key is in `script.js`. Never put service-role keys, SMTP passwords
  or OAuth secrets in the repo.
- Profiles are created with "insert unless it already exists", so one auth user can never get two profiles.
- Admin delete-user, ticket validation, trip sharing and the operator tools run as database
  functions that check who is calling; a passenger calling them is refused.


### Why the app says "Google sign-in is not available yet"
Google is only switched on when Supabase has a Google Client ID + Secret. Until you finish step 2,
Supabase refuses the request, and the app shows that message instead of a broken page. Nothing is
wrong with the code. Detailed steps:
1. console.cloud.google.com → create/select a project → **Google Auth Platform / OAuth consent screen**:
   External, app name, support email; later click **Publish app** (so everyone, not only test users, can sign in).
2. **Clients → Create client → Web application**. Authorised JavaScript origin `https://ekotransitcare.vercel.app`;
   Authorised redirect URI `https://wjxldmgnglrrthzkzots.supabase.co/auth/v1/callback`.
3. Copy Client ID + Client secret into Supabase → Authentication → Sign In / Providers → Google → enable → Save.
4. Reload the site and tap Continue with Google.

## 3. Admin creates accounts without email (Edge Function)
Admin → Users → **+ Add user** creates a passenger, driver or operator that works immediately.
It uses the Edge Function in `supabase/functions/admin-create-user/index.ts`:
Supabase → **Edge Functions → Deploy a new function → Via Editor**, name it exactly `admin-create-user`,
paste the file, Deploy. (SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY are provided automatically; never put the
service key in the website or GitHub.) If you skip this, the app falls back to normal sign-up + admin verify,
which also works, but Supabase may still email the person.

## 4. Email did not arrive?
Admin → Users shows **Not verified** next to such accounts. Press **Verify**; the person can sign in at once.
