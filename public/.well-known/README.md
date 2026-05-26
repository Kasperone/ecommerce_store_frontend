# `.well-known/`

Files here are served from the site root (Nuxt serves `public/` verbatim), e.g.
`public/.well-known/foo` → `https://<domain>/.well-known/foo`.

## `apple-developer-merchantid-domain-association`

Required for the in-page Apple Pay button (`<CheckoutWalletButton>`, Stripe
Express Checkout Element). Apple only serves Apple Pay on **registered domains**.

The file currently committed is a **placeholder** — Apple Pay is built but
keyless, so this hasn't been registered yet. To go live:

1. In the Stripe Dashboard → **Settings → Payment Method Domains**, add this
   site's domain.
2. Stripe shows the exact association-file contents (and can host it for you,
   but self-hosting here is the explicit, reviewable path).
3. Replace the entire contents of `apple-developer-merchantid-domain-association`
   with what Stripe gives you, deploy, then click **Verify** in Stripe.

Notes:

- Apple fetches this only at registration/verification time. It is inert in
  local dev, and the wallet button never renders there anyway (Safari + HTTPS +
  registered domain are all required).
- This is **frontend** territory: the buyer-facing domain is this Nuxt app, not
  the FastAPI backend.
