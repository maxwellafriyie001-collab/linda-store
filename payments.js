// Payment abstraction. Default: TEST MODE stub — never charges anything.
// To go live, set PAYMENT_MODE=stripe and STRIPE_SECRET_KEY (+ STRIPE_WEBHOOK_SECRET, PUBLIC_URL), then implement the TODOs.
const crypto = require('crypto');
const MODE = process.env.PAYMENT_MODE === 'stripe' && process.env.STRIPE_SECRET_KEY ? 'stripe' : 'test';

async function charge({ orderId, amountCents, items, buyer }) {
  if (MODE === 'test') return { ok: true, mode: 'test', ref: 'test_' + crypto.randomBytes(6).toString('hex') };
  // TODO(stripe): npm i stripe; const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  // TODO(stripe): create a Checkout Session (mode:'payment') with line_items from `items`,
  //   success_url `${process.env.PUBLIC_URL}/#/done/${orderId}`, metadata:{orderId}; return { ok:true, mode:'stripe', redirectUrl: session.url, ref: session.id }.
  // TODO(stripe-connect): for multi-seller payouts, use payment_intent_data.transfer_group = `order_${orderId}` and after
  //   payment create stripe.transfers to each seller's users.stripe_account (minus platform fee, e.g. PLATFORM_FEE_PCT).
  // TODO(stripe-webhook): add POST /api/stripe/webhook verifying STRIPE_WEBHOOK_SECRET; mark order paid on checkout.session.completed.
  throw new Error('Stripe mode is not implemented yet — see TODOs in payments.js');
}
// TODO(stripe-connect): onboardSeller(user) -> stripe.accounts.create({type:'express'}) + accountLinks.create, save id to users.stripe_account.
async function onboardSeller() { return { ok: false, mode: MODE, message: 'Seller payouts not set up (test mode).' }; }
module.exports = { MODE, charge, onboardSeller };
