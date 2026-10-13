const express = require('express'), path = require('path'), crypto = require('crypto'), multer = require('multer');
const db = require('./db'), pay = require('./payments');
const app = express(), PORT = process.env.PORT || 8080;
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(db.DATA_DIR, 'uploads')));

const upload = multer({ storage: multer.diskStorage({ destination: path.join(db.DATA_DIR, 'uploads'),
  filename: (q, f, cb) => cb(null, crypto.randomBytes(8).toString('hex') + (path.extname(f.originalname).toLowerCase() || '.img')) }),
  limits: { fileSize: 3e6 }, fileFilter: (q, f, cb) => cb(null, /^image\/(png|jpeg|gif|webp)$/.test(f.mimetype)) });

// ---- sessions (HttpOnly cookie, stored in SQLite) ----
const cookie = (req, n) => (req.headers.cookie || '').split(/;\s*/).map(c => c.split('=')).find(([k]) => k === n)?.[1];
const pub = u => u && ({ id: u.id, email: u.email, name: u.name, role: u.role, store_name: u.store_name });
app.use((req, res, next) => {
  const t = cookie(req, 'sid');
  if (t) req.user = db.get('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?', [t, Date.now()]);
  next();
});
function login(res, uid) {
  const t = crypto.randomBytes(24).toString('hex');
  db.run('INSERT INTO sessions VALUES(?,?,?)', [t, uid, Date.now() + 30 * 864e5]);
  res.setHeader('Set-Cookie', `sid=${t}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${30 * 86400}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
}
const need = (...roles) => (req, res, next) => !req.user ? res.status(401).json({ error: 'Please log in' })
  : roles.length && !roles.includes(req.user.role) ? res.status(403).json({ error: 'Not allowed' }) : next();
const bad = (res, msg, c = 400) => res.status(c).json({ error: msg });
const W = fn => (req, res) => { try { const r = fn(req, res); if (r?.catch) r.catch(e => bad(res, e.message, 500)); } catch (e) { bad(res, e.message, 500); } };

// ---- auth ----
app.post('/api/signup', W((req, res) => {
  const { email, name, password, seller, store_name } = req.body || {};
  if (!/^\S+@\S+\.\S+$/.test(email || '') || !name || (password || '').length < 8) return bad(res, 'Valid email, name and 8+ char password required');
  if (db.get('SELECT 1 x FROM users WHERE email=?', [email.toLowerCase()])) return bad(res, 'Email already registered');
  const { id } = db.run('INSERT INTO users(email,name,pw,role,store_name) VALUES(?,?,?,?,?)',
    [email.toLowerCase(), name, db.hash(password), seller ? 'seller' : 'buyer', seller ? (store_name || name + "'s Store") : null]);
  login(res, id); res.json({ user: pub(db.get('SELECT * FROM users WHERE id=?', [id])) });
}));
app.post('/api/login', W((req, res) => {
  const u = db.get('SELECT * FROM users WHERE email=?', [String(req.body?.email || '').toLowerCase()]);
  if (!u || !db.verify(req.body.password || '', u.pw)) return bad(res, 'Wrong email or password', 401);
  login(res, u.id); res.json({ user: pub(u) });
}));
app.post('/api/logout', W((req, res) => { const t = cookie(req, 'sid'); if (t) db.run('DELETE FROM sessions WHERE token=?', [t]); res.setHeader('Set-Cookie', 'sid=; Path=/; Max-Age=0'); res.json({ ok: true }); }));
app.get('/api/me', (req, res) => res.json({ user: pub(req.user) || null, paymentMode: pay.MODE }));
app.post('/api/become-seller', need(), W((req, res) => {
  if (req.user.role === 'buyer') db.run(`UPDATE users SET role='seller', store_name=? WHERE id=?`, [req.body?.store_name || req.user.name + "'s Store", req.user.id]);
  res.json({ ok: true });
}));

// ---- catalog ----
const PSEL = `SELECT p.*, u.store_name seller, ROUND(AVG(r.rating),1) rating, COUNT(r.id) reviews FROM products p
  JOIN users u ON u.id=p.seller_id LEFT JOIN reviews r ON r.product_id=p.id`;
app.get('/api/categories', (req, res) => res.json(db.all('SELECT * FROM categories ORDER BY rowid')));
app.get('/api/products', W((req, res) => {
  const { q = '', category, min, max, sort, deals } = req.query, w = ['p.active=1'], a = [];
  for (const t of String(q).toLowerCase().split(/\s+/).filter(Boolean)) { w.push(`LOWER(p.name||' '||p.category||' '||IFNULL(p.description,'')) LIKE ?`); a.push(`%${t}%`); }
  if (category) { w.push('p.category=?'); a.push(category); }
  if (min) { w.push('p.price_cents>=?'); a.push(Math.round(min * 100)); }
  if (max) { w.push('p.price_cents<=?'); a.push(Math.round(max * 100)); }
  if (deals) w.push('p.was_cents IS NOT NULL');
  const order = { price_asc: 'p.price_cents', price_desc: 'p.price_cents DESC', rating: 'rating DESC NULLS LAST', newest: 'p.id DESC' }[sort] || 'p.id';
  res.json(db.all(`${PSEL} WHERE ${w.join(' AND ')} GROUP BY p.id ORDER BY ${order} LIMIT 200`, a));
}));
app.get('/api/products/:id', W((req, res) => {
  const p = db.get(`${PSEL} WHERE p.id=? GROUP BY p.id`, [req.params.id]);
  if (!p) return bad(res, 'Not found', 404);
  p.reviewList = db.all('SELECT r.rating,r.body,r.created_at,u.name FROM reviews r JOIN users u ON u.id=r.user_id WHERE product_id=? ORDER BY r.id DESC', [p.id]);
  p.canReview = !!(req.user && db.get(`SELECT 1 x FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.buyer_id=? AND oi.product_id=?`, [req.user.id, p.id])
    && !db.get('SELECT 1 x FROM reviews WHERE user_id=? AND product_id=?', [req.user.id, p.id]));
  res.json(p);
}));
app.post('/api/products/:id/reviews', need(), W((req, res) => {
  const pid = +req.params.id, rating = +req.body?.rating;
  if (!db.get(`SELECT 1 x FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.buyer_id=? AND oi.product_id=?`, [req.user.id, pid]))
    return bad(res, 'Only buyers who purchased this item can review it', 403);
  if (!(rating >= 1 && rating <= 5)) return bad(res, 'Rating 1–5 required');
  if (db.get('SELECT 1 x FROM reviews WHERE user_id=? AND product_id=?', [req.user.id, pid])) return bad(res, 'You already reviewed this');
  db.run('INSERT INTO reviews(product_id,user_id,rating,body) VALUES(?,?,?,?)', [pid, req.user.id, rating, String(req.body.body || '').slice(0, 2000)]);
  res.json({ ok: true });
}));

// ---- cart (per user) ----
const cartOf = uid => db.all(`SELECT c.qty, p.id, p.name, p.price_cents, p.image, p.stock, p.is_sample, u.store_name seller FROM cart_items c
  JOIN products p ON p.id=c.product_id JOIN users u ON u.id=p.seller_id WHERE c.user_id=? AND p.active=1`, [uid]);
function totals(items) { const s = items.reduce((a, i) => a + i.price_cents * i.qty, 0), sh = !s || s >= 3500 ? 0 : 599, t = Math.round(s * 0.07); return { subtotal: s, shipping: sh, tax: t, total: s + sh + t }; }
app.get('/api/cart', need(), (req, res) => { const items = cartOf(req.user.id); res.json({ items, ...totals(items) }); });
app.put('/api/cart/:pid', need(), W((req, res) => {
  const qty = Math.floor(+req.body?.qty || 0), p = db.get('SELECT * FROM products WHERE id=? AND active=1', [req.params.pid]);
  if (!p) return bad(res, 'Product not found', 404);
  if (qty <= 0) db.run('DELETE FROM cart_items WHERE user_id=? AND product_id=?', [req.user.id, p.id]);
  else db.run('INSERT INTO cart_items VALUES(?,?,?) ON CONFLICT(user_id,product_id) DO UPDATE SET qty=excluded.qty', [req.user.id, p.id, Math.min(qty, p.stock)]);
  const items = cartOf(req.user.id); res.json({ items, ...totals(items) });
}));

// ---- checkout & orders ----
app.post('/api/checkout', need(), W(async (req, res) => {
  const { name, address, city, state, zip } = req.body || {};
  if (!name || !address || !city || !state || !/^\d{5}$/.test(zip || '')) return bad(res, 'Complete shipping details required');
  const items = cartOf(req.user.id); if (!items.length) return bad(res, 'Cart is empty');
  for (const i of items) if (i.qty > i.stock) return bad(res, `Only ${i.stock} left of ${i.name}`);
  const t = totals(items);
  const orderId = db.tx(() => {
    const o = db.run(`INSERT INTO orders(buyer_id,subtotal_cents,shipping_cents,tax_cents,total_cents,ship_name,ship_address,payment_mode) VALUES(?,?,?,?,?,?,?,?)`,
      [req.user.id, t.subtotal, t.shipping, t.tax, t.total, name, `${address}, ${city}, ${state} ${zip}`, pay.MODE]).id;
    for (const i of items) {
      const p = db.get('SELECT seller_id FROM products WHERE id=?', [i.id]);
      db.run('INSERT INTO order_items(order_id,product_id,seller_id,name,price_cents,qty) VALUES(?,?,?,?,?,?)', [o, i.id, p.seller_id, i.name, i.price_cents, i.qty]);
      db.run('UPDATE products SET stock=stock-? WHERE id=?', [i.qty, i.id]);
    }
    db.run('DELETE FROM cart_items WHERE user_id=?', [req.user.id]); return o;
  });
  const r = await pay.charge({ orderId, amountCents: t.total, items, buyer: req.user });
  db.run('UPDATE orders SET payment_ref=? WHERE id=?', [r.ref, orderId]);
  res.json({ orderId, payment: r });
}));
const withItems = os => os.map(o => ({ ...o, items: db.all('SELECT oi.*, p.image FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id WHERE order_id=?', [o.id]) }));
app.get('/api/orders', need(), (req, res) => res.json(withItems(db.all('SELECT * FROM orders WHERE buyer_id=? ORDER BY id DESC', [req.user.id]))));

// ---- seller ----
app.get('/api/seller/products', need('seller', 'admin'), (req, res) => res.json(db.all('SELECT * FROM products WHERE seller_id=? ORDER BY id DESC', [req.user.id])));
function listing(req, res, existing) {
  const b = req.body, price = Math.round(+b.price * 100), stock = Math.floor(+b.stock);
  if (!b.name || !b.category || !(price > 0) || !(stock >= 0)) return bad(res, 'Name, category, price > 0 and stock ≥ 0 required');
  if (!db.get('SELECT 1 x FROM categories WHERE name=?', [b.category])) return bad(res, 'Unknown category');
  const img = req.file ? '/uploads/' + req.file.filename : existing?.image || null;
  if (existing) db.run('UPDATE products SET name=?,category=?,description=?,price_cents=?,stock=?,image=? WHERE id=?', [b.name, b.category, b.description || '', price, stock, img, existing.id]);
  else return res.json(db.run('INSERT INTO products(seller_id,name,category,description,price_cents,stock,image) VALUES(?,?,?,?,?,?,?)', [req.user.id, b.name, b.category, b.description || '', price, stock, img]));
  res.json({ ok: true });
}
const own = req => db.get('SELECT * FROM products WHERE id=? AND (seller_id=? OR ?)', [req.params.id, req.user.id, req.user.role === 'admin' ? 1 : 0]);
app.post('/api/seller/products', need('seller', 'admin'), upload.single('image'), W((req, res) => listing(req, res)));
app.put('/api/seller/products/:id', need('seller', 'admin'), upload.single('image'), W((req, res) => { const p = own(req); p ? listing(req, res, p) : bad(res, 'Not found', 404); }));
app.delete('/api/seller/products/:id', need('seller', 'admin'), W((req, res) => { const p = own(req); if (!p) return bad(res, 'Not found', 404); db.run('DELETE FROM products WHERE id=?', [p.id]); res.json({ ok: true }); }));
app.get('/api/seller/orders', need('seller', 'admin'), (req, res) => res.json(db.all(`SELECT oi.*, o.created_at, o.ship_name, o.ship_address FROM order_items oi
  JOIN orders o ON o.id=oi.order_id WHERE oi.seller_id=? ORDER BY oi.id DESC`, [req.user.id])));
app.put('/api/seller/orders/:itemId', need('seller', 'admin'), W((req, res) => {
  const s = req.body?.status; if (!['placed', 'shipped', 'delivered'].includes(s)) return bad(res, 'Bad status');
  const r = db.run('UPDATE order_items SET status=? WHERE id=? AND (seller_id=? OR ?)', [s, req.params.itemId, req.user.id, req.user.role === 'admin' ? 1 : 0]);
  r.changes ? res.json({ ok: true }) : bad(res, 'Not found', 404);
}));

// ---- admin ----
app.get('/api/admin/summary', need('admin'), (req, res) => res.json({
  stats: db.get(`SELECT (SELECT COUNT(*) FROM users) users,(SELECT COUNT(*) FROM users WHERE role='seller') sellers,(SELECT COUNT(*) FROM products) products,
    (SELECT COUNT(*) FROM orders) orders,(SELECT IFNULL(SUM(total_cents),0) FROM orders) gmv_cents`),
  users: db.all('SELECT id,email,name,role,store_name,created_at FROM users ORDER BY id DESC LIMIT 100'),
  orders: db.all('SELECT o.*, u.email FROM orders o JOIN users u ON u.id=o.buyer_id ORDER BY o.id DESC LIMIT 50'), paymentMode: pay.MODE }));
app.put('/api/admin/users/:id', need('admin'), W((req, res) => {
  if (!['buyer', 'seller', 'admin'].includes(req.body?.role)) return bad(res, 'Bad role');
  db.run('UPDATE users SET role=? WHERE id=?', [req.body.role, req.params.id]); res.json({ ok: true });
}));
app.put('/api/admin/products/:id', need('admin'), W((req, res) => { db.run('UPDATE products SET active=? WHERE id=?', [req.body?.active ? 1 : 0, req.params.id]); res.json({ ok: true }); }));
app.get('/healthz', (req, res) => res.send('ok'));
app.use((err, req, res, next) => bad(res, err.message, 500));

db.init().then(() => app.listen(PORT, () => console.log(`Linda running on http://localhost:${PORT} (payments: ${pay.MODE} mode)`)));
process.on('SIGTERM', () => { db.flush(); process.exit(0); }); process.on('SIGINT', () => { db.flush(); process.exit(0); });
