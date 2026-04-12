# Deferred Work

## Local dev credentials for Stripe and Twilio

**Source:** Review of tech-spec-local-supabase-dev (2026-04-11)

`.env.local` only covers Supabase credentials. Code paths touching Stripe (payment holds, webhooks) or Twilio (SMS OTP) will fail locally without test-mode keys. Consider adding Stripe test keys and Twilio dev credentials (or stubs) to `.env.local` in a follow-up story.
