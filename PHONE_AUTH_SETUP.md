# WhatsApp OTP for passengers — setup

The app code is done. For codes to actually arrive you must switch on phone
auth in Supabase (Dashboard → Authentication → Providers → Phone):

1. Enable the **Phone** provider.
2. Choose **Twilio** as the provider (the Supabase provider that supports the
   WhatsApp channel) and fill in Account SID, Auth Token and a
   WhatsApp-enabled sender (Messaging Service SID / WhatsApp number).
3. In Twilio, register your WhatsApp sender with Meta and get an
   authentication (OTP) message template approved. Meta needs a verified
   business for production; Twilio's WhatsApp sandbox works for testing.
4. Set the OTP length to 6 (default) and keep "Enable phone confirmations" on.
5. Run `sql/001_fixes_and_phone_auth.sql`.

How it works in the app
- Sign up → "Sign up with your WhatsApp number instead" (passengers only):
  name + number + terms → `signInWithOtp({ channel: "whatsapp", shouldCreateUser: true })`
  → user types the code → `verifyOtp({ type: "sms" })` → profile is created
  automatically as a passenger.
- Sign in → "Sign in with a WhatsApp code instead": same flow with
  `shouldCreateUser: false`, so unknown numbers get "create an account first".
- Numbers like 0803… are converted to +234803…; other countries need +code.
- Drivers and operators still register with email only.

If WhatsApp isn't set up yet, users will see "WhatsApp codes are not
available right now. Please use email instead."
