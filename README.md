# ★ Linda — Where America Shops

A simple, clean multi-seller marketplace: Node.js (Express 5) + SQLite + a vanilla-JS frontend with no build step.

## Features
- Shoppers can sign up and log in. Passwords are hashed with scrypt, and sessions are HttpOnly cookies stored in SQLite.
- Sellers can sign up (or turn a buyer account into a seller account) and use a dashboard to create, edit and delete listings: image upload (PNG/JPG/GIF/WebP up to 3 MB), price, stock, category and description. They also see their incoming orders and set each one's status (placed → shipped → delivered).
- Search with category and price filters, plus sort (price, top rated, newest).
- Product pages with ratings and reviews. Only buyers who purchased the item can review it, one review each.
- Each user's cart is saved in the database. Checkout creates the order, decrements stock, and shows up in the buyer's order history.
- Payments go through `payments.js`, which defaults to a **test-mode stub (no charges)**. It has TODO hooks for Stripe Checkout, Connect and webhooks.
- A basic admin page (`#/admin`): stats, user roles, recent orders.
- 24 seeded sample products under **Linda Sample Seller**, all flagged `is_sample` and labelled "Sample product" in the UI.

## Run locally
```bash
npm install
npm start            # http://localhost:8080
npm test             # end-to-end API test (uses a temp DB on port 8099)
```
The default admin login is `admin@linda.local` / `admin1234`. **Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` before the first start in production.** The admin is created only when the DB is first seeded.

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | 8080 | HTTP port |
| `DATA_DIR` | `./data` | SQLite file (`linda.db`) + `uploads/` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | see above | first admin account |
| `PAYMENT_MODE` | `test` | `stripe` to enable Stripe (after implementing TODOs) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PUBLIC_URL` | — | Stripe Checkout/Connect |

## Deploy (free)
- **Render**: push this folder to a GitHub repo, then go to Render → New → Blueprint, which picks up `render.yaml`. The free plan has no persistent disk, so the DB and uploads reset on every deploy or restart. Fine for demos; for real use add a disk (paid) or move to Postgres plus S3/R2 for images.
- **Docker** anywhere (Fly.io, Railway, a VPS): `docker build -t linda . && docker run -p 8080:8080 -v linda-data:/data linda`.

## Going live with Stripe (TODO)
1. `npm i stripe`, set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PUBLIC_URL` and `PAYMENT_MODE=stripe`.
2. Implement `charge()` in `payments.js` (Checkout Session) and add the webhook route.
3. For multi-seller payouts, use Stripe Connect Express (`onboardSeller`) plus transfers per seller.

## Notes
- SQLite runs through `sql.js` (WASM), so there's no native build. The DB lives in memory and is written to disk after each write. That's fine at small scale; switch to `better-sqlite3` or Postgres as you grow.
- `scripts/screenshots.js` (needs `puppeteer-core` + Chrome) creates demo accounts and takes the UI screenshots.
