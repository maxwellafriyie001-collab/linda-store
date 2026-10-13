// SQLite via sql.js (pure WASM, no native build). Persisted to DATA_DIR/linda.db after each write.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const initSqlJs = require('sql.js');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'linda.db');
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });

let db, timer;
const persist = () => { clearTimeout(timer); timer = setTimeout(flush, 50); };
const flush = () => { if (db) fs.writeFileSync(FILE, Buffer.from(db.export())); };
function all(sql, p = []) { const s = db.prepare(sql); s.bind(p); const r = []; while (s.step()) r.push(s.getAsObject()); s.free(); return r; }
const get = (sql, p) => all(sql, p)[0];
function run(sql, p = []) { db.run(sql, p); const id = get('SELECT last_insert_rowid() id').id; persist(); return { id, changes: db.getRowsModified() }; }
function tx(fn) { db.run('BEGIN'); try { const r = fn(); db.run('COMMIT'); persist(); return r; } catch (e) { db.run('ROLLBACK'); throw e; } }

function hash(pw) { const salt = crypto.randomBytes(16).toString('hex'); return salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex'); }
function verify(pw, stored) { const [salt, h] = String(stored).split(':'); const a = Buffer.from(h, 'hex'), b = crypto.scryptSync(pw, salt, 64); return a.length === b.length && crypto.timingSafeEqual(a, b); }

const SCHEMA = `
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, pw TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'buyer', store_name TEXT, stripe_account TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER);
CREATE TABLE IF NOT EXISTS categories(name TEXT PRIMARY KEY, icon TEXT);
CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY, seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, category TEXT NOT NULL, description TEXT, price_cents INTEGER NOT NULL, was_cents INTEGER,
  stock INTEGER NOT NULL DEFAULT 0, image TEXT, is_sample INTEGER DEFAULT 0, active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS cart_items(user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  qty INTEGER NOT NULL, PRIMARY KEY(user_id, product_id));
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY, buyer_id INTEGER REFERENCES users(id), subtotal_cents INTEGER, shipping_cents INTEGER,
  tax_cents INTEGER, total_cents INTEGER, ship_name TEXT, ship_address TEXT, payment_ref TEXT, payment_mode TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS order_items(id INTEGER PRIMARY KEY, order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE, product_id INTEGER,
  seller_id INTEGER, name TEXT, price_cents INTEGER, qty INTEGER, status TEXT NOT NULL DEFAULT 'placed');
CREATE TABLE IF NOT EXISTS reviews(id INTEGER PRIMARY KEY, product_id INTEGER REFERENCES products(id) ON DELETE CASCADE, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), body TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(product_id, user_id));`;

function seed() {
  if (get('SELECT COUNT(*) n FROM users').n) return;
  const src = fs.readFileSync(path.join(__dirname, 'public', 'data.js'), 'utf8');
  const { CATS, PRODUCTS } = new Function(src + ';return {CATS,PRODUCTS}')();
  tx(() => {
    for (const [c, i] of Object.entries(CATS)) db.run('INSERT INTO categories VALUES(?,?)', [c, i]);
    db.run(`INSERT INTO users(email,name,pw,role) VALUES(?,?,?,'admin')`, [process.env.ADMIN_EMAIL || 'admin@linda.local', 'Linda Admin', hash(process.env.ADMIN_PASSWORD || 'admin1234')]);
    db.run(`INSERT INTO users(email,name,pw,role,store_name) VALUES('samples@linda.local','Linda Sample Seller',?,'seller','Linda Sample Seller')`, [hash(crypto.randomBytes(12).toString('hex'))]);
    const sid = get(`SELECT id FROM users WHERE email='samples@linda.local'`).id;
    for (const p of PRODUCTS) db.run(`INSERT INTO products(seller_id,name,category,description,price_cents,was_cents,stock,image,is_sample) VALUES(?,?,?,?,?,?,?,?,1)`,
      [sid, p.name, p.cat, p.desc, Math.round(p.price * 100), p.was ? Math.round(p.was * 100) : null, 25 + (p.id * 7) % 50, `/img/p${p.id}.svg`]);
  });
}

async function init() {
  const SQL = await initSqlJs();
  db = fs.existsSync(FILE) ? new SQL.Database(fs.readFileSync(FILE)) : new SQL.Database();
  db.exec(SCHEMA); seed(); flush();
}
module.exports = { init, all, get, run, tx, hash, verify, flush, DATA_DIR };
