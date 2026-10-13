// End-to-end API test. Starts a server on a temp DB, runs main flows, exits non-zero on failure.
const { spawn } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const PORT = 8099, BASE = `http://localhost:${PORT}`, DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'linda-'));
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, DATA_DIR, PAYMENT_MODE: 'test' }, stdio: 'inherit' });
function client() {
  let ck = '';
  return async (method, url, body, form) => {
    const r = await fetch(BASE + url, { method, headers: { cookie: ck, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: form || (body && JSON.stringify(body)) });
    const sc = r.headers.get('set-cookie'); if (sc) ck = sc.split(';')[0];
    return { s: r.status, d: await r.json().catch(() => null) };
  };
}
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ✓', m); };
(async () => {
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/healthz'); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
  const anon = client(), buyer = client(), seller = client(), admin = client();
  let r = await anon('GET', '/api/products'); ok(r.d.length === 24 && r.d.every(p => p.is_sample && p.seller === 'Linda Sample Seller'), '24 seeded sample products by Linda Sample Seller');
  r = await anon('GET', '/api/products?q=camp'); ok(r.d.some(p => p.name.includes('Camping')), 'keyword search');
  r = await anon('GET', '/api/products?category=Books&sort=price_asc&max=100'); ok(r.d.every(p => p.category === 'Books') && r.d.every((p, i, a) => !i || a[i - 1].price_cents <= p.price_cents), 'category filter + price sort');
  r = await anon('GET', '/api/cart'); ok(r.s === 401, 'cart requires login');
  r = await seller('POST', '/api/signup', { email: 'sam@shop.test', name: 'Sam Seller', password: 'password1', seller: 1, store_name: 'Sam\'s Goods' }); ok(r.d.user.role === 'seller', 'seller signup');
  const fd = new FormData(); fd.append('name', 'Handmade Oak Cutting Board'); fd.append('category', 'Home & Kitchen'); fd.append('price', '39.50'); fd.append('stock', '5'); fd.append('description', 'Solid oak.');
  fd.append('image', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64')], { type: 'image/png' }), 'board.png');
  r = await seller('POST', '/api/seller/products', null, fd); const pid = r.d.id; ok(pid, 'seller creates listing with image upload');
  r = await anon('GET', '/api/products/' + pid); ok(r.d.image.startsWith('/uploads/') && !r.d.is_sample && r.d.seller === "Sam's Goods", 'listing is public with uploaded image');
  const img = await fetch(BASE + r.d.image); ok(img.ok, 'uploaded image served');
  const fd2 = new FormData(); fd2.append('name', 'Handmade Oak Cutting Board XL'); fd2.append('category', 'Home & Kitchen'); fd2.append('price', '44'); fd2.append('stock', '5');
  r = await seller('PUT', '/api/seller/products/' + pid, null, fd2); ok(r.d.ok, 'seller edits listing');
  r = await buyer('PUT', '/api/seller/products/' + pid, null, fd2); ok(r.s === 401, 'non-seller cannot edit');
  r = await buyer('POST', '/api/signup', { email: 'bea@buyer.test', name: 'Bea Buyer', password: 'password1' }); ok(r.d.user.role === 'buyer', 'buyer signup');
  r = await buyer('POST', '/api/products/' + pid + '/reviews', { rating: 5, body: 'x' }); ok(r.s === 403, 'cannot review before buying');
  await buyer('PUT', '/api/cart/' + pid, { qty: 2 }); r = await buyer('PUT', '/api/cart/9', { qty: 1 });
  ok(r.d.items.length === 2 && r.d.subtotal === 8800 + r.d.items.find(i => i.id === 9).price_cents, 'cart add + totals');
  r = await buyer('PUT', '/api/cart/9', { qty: 0 }); ok(r.d.items.length === 1, 'cart remove');
  await buyer('PUT', '/api/cart/9', { qty: 1 });
  const b2 = client(); await b2('POST', '/api/login', { email: 'bea@buyer.test', password: 'password1' }); r = await b2('GET', '/api/cart'); ok(r.d.items.length === 2, 'cart persisted per user across sessions');
  r = await b2('POST', '/api/login', { email: 'bea@buyer.test', password: 'wrong' }); ok(r.s === 401, 'wrong password rejected');
  r = await buyer('POST', '/api/checkout', { name: 'Bea Buyer', address: '1 Main St', city: 'Dayton', state: 'OH', zip: '45402' }); ok(r.d.orderId && r.d.payment.mode === 'test', 'checkout creates order (test payment)');
  r = await buyer('GET', '/api/cart'); ok(!r.d.items.length, 'cart emptied after checkout');
  r = await buyer('GET', '/api/orders'); ok(r.d.length === 1 && r.d[0].items.length === 2, 'buyer order history');
  r = await anon('GET', '/api/products/' + pid); ok(r.d.stock === 3, 'stock decremented');
  r = await seller('GET', '/api/seller/orders'); ok(r.d.length === 1 && r.d[0].status === 'placed', 'seller sees only own incoming order item');
  r = await seller('PUT', '/api/seller/orders/' + r.d[0].id, { status: 'shipped' }); ok(r.d.ok, 'seller marks shipped');
  r = await buyer('GET', '/api/orders'); ok(r.d[0].items.find(i => i.product_id === pid).status === 'shipped', 'buyer sees shipped status');
  r = await buyer('POST', '/api/products/' + pid + '/reviews', { rating: 5, body: 'Beautiful board!' }); ok(r.d.ok, 'buyer reviews purchased item');
  r = await buyer('POST', '/api/products/' + pid + '/reviews', { rating: 1 }); ok(r.s === 400, 'no duplicate reviews');
  r = await anon('GET', '/api/products/' + pid); ok(r.d.rating === 5 && r.d.reviewList.length === 1, 'rating shown on product');
  r = await buyer('GET', '/api/admin/summary'); ok(r.s === 403, 'admin page protected');
  r = await admin('POST', '/api/login', { email: 'admin@linda.local', password: 'admin1234' }); r = await admin('GET', '/api/admin/summary'); ok(r.d.stats.orders === 1 && r.d.stats.users === 4, 'admin summary');
  r = await seller('DELETE', '/api/seller/products/' + pid); ok(r.d.ok, 'seller deletes listing');
  console.log(`\nAll ${n} checks passed.`); srv.kill(); process.exit(0);
})().catch(e => { console.error('FAIL:', e.message); srv.kill(); process.exit(1); });
