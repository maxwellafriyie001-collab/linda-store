const $ = s => document.querySelector(s), app = $('#app'), money = c => '$' + (c / 100).toFixed(2);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function api(url, opt = {}) {
  if (opt.json) { opt.body = JSON.stringify(opt.json); opt.headers = { 'Content-Type': 'application/json' }; }
  const r = await fetch(url, opt), d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Request failed'); return d;
}
let ME = null, CATS = [];
const stars = n => n ? `<span class="stars-y">${'★'.repeat(Math.round(n))}${'☆'.repeat(5 - Math.round(n))}</span>` : '<span class="muted">No reviews</span>';
async function refreshHeader() {
  ME = (await api('/api/me')).user;
  $('#who').innerHTML = ME ? `Hi, ${esc(ME.name.split(' ')[0])} <a href="#/orders">Orders</a>${ME.role !== 'buyer' ? '<a href="#/seller">Sell</a>' : '<a href="#/seller">Start selling</a>'}${ME.role === 'admin' ? '<a href="#/admin">Admin</a>' : ''}<a href="#" onclick="logout();return false">Log out</a>`
    : `<a href="#/login">Log in</a><a href="#/signup">Sign up</a><a href="#/signup/seller">Sell on Linda</a>`;
  $('#cc').textContent = ME ? (await api('/api/cart')).items.reduce((a, i) => a + i.qty, 0) : 0;
}
window.logout = async () => { await api('/api/logout', { method: 'POST' }); await refreshHeader(); location.hash = '#/'; };
$('#sf').onsubmit = e => { e.preventDefault(); location.hash = '#/s/' + encodeURIComponent($('#q').value.trim()); };
const card = p => `<a class="card" href="#/p/${p.id}"><img src="${esc(p.image || '/img/p1.svg')}" alt="" loading="lazy">${p.is_sample ? '<span class="tag">Sample product</span>' : ''}<h3>${esc(p.name)}</h3>
  <div>${stars(p.rating)} <span class="muted">${p.reviews || ''}</span></div><span class="price">${money(p.price_cents)}</span>${p.was_cents ? `<span class="was">${money(p.was_cents)}</span>` : ''}<div class="muted">by ${esc(p.seller)}</div></a>`;
const grid = l => l.length ? `<div class="grid">${l.map(card).join('')}</div>` : '<p>No products found. Try another search or loosen the filters.</p>';
const needLogin = () => { location.hash = '#/login/' + encodeURIComponent(location.hash); return ''; };
const sumBox = t => `<div class="box"><h3>Order summary</h3><p>Subtotal: ${money(t.subtotal)}</p><p>Shipping: ${t.shipping ? money(t.shipping) : 'FREE'}</p><p>Est. tax: ${money(t.tax)}</p><h3>Total: ${money(t.total)}</h3>`;
const catOpts = sel => CATS.map(c => `<option ${c.name === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');

const routes = {
  async ''() {
    const deals = await api('/api/products?deals=1');
    return `<section class="hero"><div><h1>Where America Shops</h1><p>Simple shopping from American sellers. Free shipping over $35.</p><a class="btn" href="#/s/?deals=1">See today's deals</a> <a class="btn alt" href="#/signup/seller">Sell on Linda</a></div><div class="stars">★★★</div></section>
    <h2>Shop by category</h2><div class="grid">${CATS.map(c => `<a class="tile" href="#/c/${encodeURIComponent(c.name)}"><span>${c.icon}</span>${esc(c.name)}</a>`).join('')}</div>
    <h2>Today's deals</h2>${grid(deals.slice(0, 4))}`;
  },
  c: c => routes.s('', 'category=' + encodeURIComponent(c)),
  async s(q, qs = '') {
    const f = new URLSearchParams(qs); if (q) f.set('q', q); $('#q').value = q || '';
    const r = await api('/api/products?' + f);
    const title = f.get('category') ? esc(f.get('category')) : f.get('deals') ? 'Deals' : q ? `“${esc(q)}”` : 'All products';
    return `<h2>${title} <span class="muted">${r.length} result${r.length == 1 ? '' : 's'}</span></h2>
    <form class="filters" onsubmit="applyF(event)"><label>Category<br><select name="category"><option value="">All</option>${catOpts(f.get('category'))}</select></label>
    <label>Min $<br><input name="min" type="number" min="0" style="width:90px" value="${esc(f.get('min') || '')}"></label><label>Max $<br><input name="max" type="number" min="0" style="width:90px" value="${esc(f.get('max') || '')}"></label>
    <label>Sort<br><select name="sort">${[['', 'Featured'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['rating', 'Top rated'], ['newest', 'Newest']].map(([v, l]) => `<option value="${v}" ${f.get('sort') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <input type="hidden" name="deals" value="${f.get('deals') || ''}"><button class="btn sm">Apply</button></form>${grid(r)}`;
  },
  async p(id) {
    const p = await api('/api/products/' + id);
    return `<p><a href="#/c/${encodeURIComponent(p.category)}">← ${esc(p.category)}</a></p><div class="pd"><img src="${esc(p.image || '/img/p1.svg')}" alt=""><div>
    ${p.is_sample ? '<span class="tag">Sample product — not for sale</span>' : ''}<h1>${esc(p.name)}</h1><div>${stars(p.rating)} ${p.rating || ''} <span class="muted">(${p.reviews} review${p.reviews == 1 ? '' : 's'})</span></div>
    <p class="muted">Sold by ${esc(p.seller)}</p><p class="price" style="font-size:28px">${money(p.price_cents)}${p.was_cents ? `<span class="was">${money(p.was_cents)}</span>` : ''}</p>
    <p>${esc(p.description)}</p><p>${p.stock > 0 ? `<b style="color:#1d6b33">In stock</b> <span class="muted">(${p.stock} left)</span>` : '<b style="color:var(--red)">Out of stock</b>'}</p>
    ${p.stock > 0 ? `<label>Qty <input type="number" min="1" max="${p.stock}" value="1" id="pq" class="qty"></label><br><button class="btn" onclick="add(${p.id})">Add to cart</button>` : ''}</div></div>
    <div class="box" style="margin-top:20px"><h2>Customer reviews</h2>
    ${p.canReview ? `<form onsubmit="review(event,${p.id})"><label>Your rating</label><select name="rating" class="f" style="width:auto">${[5, 4, 3, 2, 1].map(n => `<option value="${n}">${'★'.repeat(n)}</option>`).join('')}</select><label>Your review</label><textarea class="f" name="body"></textarea><p class="err" id="err"></p><button class="btn sm">Post review</button></form>`
      : `<p class="muted">Only verified buyers can write reviews.</p>`}
    ${p.reviewList.map(r => `<div class="rev">${stars(r.rating)} <b>${esc(r.name)}</b> <span class="muted">· Verified purchase · ${r.created_at.slice(0, 10)}</span><p>${esc(r.body)}</p></div>`).join('') || '<p>No reviews yet.</p>'}</div>`;
  },
  async cart() {
    if (!ME) return needLogin();
    const c = await api('/api/cart');
    if (!c.items.length) return `<h2>Your cart is empty</h2><a class="btn" href="#/">Start shopping</a>`;
    return `<h2>Your cart</h2><div class="cols"><table>${c.items.map(i => `<tr><td><img src="${esc(i.image)}"></td><td><a href="#/p/${i.id}">${esc(i.name)}</a><br><small>by ${esc(i.seller)}</small> ${i.is_sample ? '<span class="tag">Sample product</span>' : ''}</td>
      <td><input class="qty" type="number" min="1" max="${i.stock}" value="${i.qty}" onchange="setQ(${i.id},this.value)"></td><td>${money(i.price_cents * i.qty)}</td><td><button class="link" onclick="setQ(${i.id},0)">Remove</button></td></tr>`).join('')}</table>
      ${sumBox(c)}<a class="btn" style="width:100%;text-align:center" href="#/checkout">Checkout</a></div></div>`;
  },
  async checkout() {
    if (!ME) return needLogin();
    const c = await api('/api/cart'); if (!c.items.length) return routes.cart();
    return `<h2>Checkout</h2><div class="cols"><form class="box" onsubmit="placeOrder(event)"><h3>Ship to</h3><label>Full name</label><input class="f" name="name" required value="${esc(ME.name)}"><label>Address</label><input class="f" name="address" required>
    <div class="row"><div><label>City</label><input class="f" name="city" required></div><div><label>State</label><input class="f" name="state" required maxlength="2"></div><div><label>ZIP</label><input class="f" name="zip" required pattern="\\d{5}"></div></div>
    <h3>Payment</h3><p class="box" style="background:#f2f5fb">🔒 <b>Test mode</b> — no card needed and nothing will be charged. Real payments (Stripe) will be switched on later.</p>
    <p class="err" id="err"></p><button class="btn" style="width:100%">Place order · ${money(c.total)}</button></form>
    <div>${sumBox(c)}${c.items.map(i => `<p class="muted">${i.qty} × ${esc(i.name)}</p>`).join('')}</div></div></div>`;
  },
  done: n => `<div class="box" style="text-align:center"><h1>★ Thank you!</h1><p>Order <b>#${esc(n)}</b> is placed. (Test mode: no payment taken.)</p><a class="btn" href="#/orders">View my orders</a> <a class="btn alt" href="#/">Keep shopping</a></div>`,
  async orders() {
    if (!ME) return needLogin();
    const os = await api('/api/orders');
    return `<h2>Your orders</h2>` + (os.map(o => `<div class="box" style="margin-bottom:14px"><b>Order #${o.id}</b> <span class="muted">· ${o.created_at.slice(0, 10)} · Total ${money(o.total_cents)} · Ship to ${esc(o.ship_address)}</span>
      <table>${o.items.map(i => `<tr><td><img src="${esc(i.image || '/img/p1.svg')}"></td><td><a href="#/p/${i.product_id}">${esc(i.name)}</a></td><td>${i.qty} × ${money(i.price_cents)}</td><td><span class="status ${i.status}">${i.status}</span></td><td><a href="#/p/${i.product_id}">Write a review</a></td></tr>`).join('')}</table></div>`).join('') || '<p>No orders yet.</p>');
  },
  login: back => `<div class="auth box"><h2>Log in</h2><form onsubmit="auth(event,'login')"><label>Email</label><input class="f" name="email" type="email" required><label>Password</label><input class="f" name="password" type="password" required>
    <p class="err" id="err"></p><input type="hidden" name="back" value="${esc(back)}"><button class="btn" style="width:100%">Log in</button></form><p>New here? <a href="#/signup">Create an account</a></p></div>`,
  signup: kind => `<div class="auth box"><h2>${kind === 'seller' ? 'Sell on Linda' : 'Create your account'}</h2><form onsubmit="auth(event,'signup')"><label>Name</label><input class="f" name="name" required><label>Email</label><input class="f" name="email" type="email" required>
    <label>Password (8+ characters)</label><input class="f" name="password" type="password" minlength="8" required>
    ${kind === 'seller' ? '<label>Store name</label><input class="f" name="store_name" required><input type="hidden" name="seller" value="1">' : ''}
    <p class="err" id="err"></p><button class="btn" style="width:100%">${kind === 'seller' ? 'Create seller account' : 'Sign up'}</button></form>
    <p>${kind === 'seller' ? '<a href="#/signup">Just want to shop?</a>' : '<a href="#/signup/seller">Want to sell?</a>'} · <a href="#/login">Log in</a></p></div>`,
  async seller(tab = 'listings') {
    if (!ME) return needLogin();
    if (ME.role === 'buyer') return `<div class="auth box"><h2>Start selling</h2><p>Turn your account into a seller account.</p><label>Store name</label><input class="f" id="sn"><br><br><button class="btn" onclick="becomeSeller()">Become a seller</button></div>`;
    const tabs = `<h2>Seller dashboard <span class="muted">${esc(ME.store_name || '')}</span></h2><div class="tabs"><a href="#/seller/listings" class="${tab === 'listings' ? 'on' : ''}">Listings</a><a href="#/seller/new" class="${tab === 'new' ? 'on' : ''}">+ New listing</a><a href="#/seller/orders" class="${tab === 'orders' ? 'on' : ''}">Incoming orders</a></div>`;
    if (tab === 'orders') {
      const os = await api('/api/seller/orders');
      return tabs + (os.length ? `<table><tr><td><b>Order</b></td><td><b>Item</b></td><td><b>Qty</b></td><td><b>Ship to</b></td><td><b>Status</b></td></tr>${os.map(o => `<tr><td>#${o.order_id}<br><small>${o.created_at.slice(0, 10)}</small></td><td>${esc(o.name)}</td><td>${o.qty}</td><td>${esc(o.ship_name)}<br><small>${esc(o.ship_address)}</small></td>
        <td><select onchange="setStatus(${o.id},this.value)">${['placed', 'shipped', 'delivered'].map(s => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td></tr>`).join('')}</table>` : '<p>No orders yet.</p>');
    }
    if (tab === 'new' || tab.startsWith('edit')) {
      const id = tab.split(':')[1], p = id ? (await api('/api/seller/products')).find(x => x.id == id) || {} : {};
      return tabs + `<form class="box" style="max-width:640px" onsubmit="saveListing(event,${id || 0})"><label>Product name</label><input class="f" name="name" required value="${esc(p.name || '')}">
      <div class="row"><div><label>Category</label><select class="f" name="category">${catOpts(p.category)}</select></div><div><label>Price ($)</label><input class="f" name="price" type="number" step="0.01" min="0.01" required value="${p.price_cents ? (p.price_cents / 100).toFixed(2) : ''}"></div><div><label>Stock</label><input class="f" name="stock" type="number" min="0" required value="${p.stock ?? ''}"></div></div>
      <label>Description</label><textarea class="f" name="description">${esc(p.description || '')}</textarea><label>Image ${p.image ? '(leave empty to keep current)' : ''}</label><input class="f" type="file" name="image" accept="image/*">
      <p class="err" id="err"></p><button class="btn">${id ? 'Save changes' : 'Publish listing'}</button></form>`;
    }
    const ps = await api('/api/seller/products');
    return tabs + (ps.length ? `<table>${ps.map(p => `<tr><td><img src="${esc(p.image || '/img/p1.svg')}"></td><td><a href="#/p/${p.id}">${esc(p.name)}</a><br><small>${esc(p.category)}</small> ${p.is_sample ? '<span class="tag">Sample product</span>' : ''}</td><td>${money(p.price_cents)}</td><td>${p.stock} in stock</td>
      <td><a class="btn sm alt" href="#/seller/edit:${p.id}">Edit</a> <button class="link" onclick="delListing(${p.id})">Delete</button></td></tr>`).join('')}</table>` : '<p>No listings yet. <a href="#/seller/new">Create your first listing</a>.</p>');
  },
  async admin() {
    if (!ME || ME.role !== 'admin') return '<p>Admins only.</p>';
    const a = await api('/api/admin/summary'), s = a.stats;
    return `<h2>Admin</h2><div class="grid">${[['Users', s.users], ['Sellers', s.sellers], ['Products', s.products], ['Orders', s.orders], ['Sales', money(s.gmv_cents)], ['Payments', a.paymentMode + ' mode']].map(([k, v]) => `<div class="box"><div class="muted">${k}</div><h2 style="margin:4px 0">${v}</h2></div>`).join('')}</div>
    <h3>Users</h3><table>${a.users.map(u => `<tr><td>${esc(u.name)}<br><small>${esc(u.email)}</small></td><td>${esc(u.store_name || '')}</td><td><select onchange="setRole(${u.id},this.value)">${['buyer', 'seller', 'admin'].map(r => `<option ${r === u.role ? 'selected' : ''}>${r}</option>`).join('')}</select></td><td><small>${u.created_at.slice(0, 10)}</small></td></tr>`).join('')}</table>
    <h3>Recent orders</h3><table>${a.orders.map(o => `<tr><td>#${o.id}</td><td>${esc(o.email)}</td><td>${money(o.total_cents)}</td><td>${o.payment_mode}: ${esc(o.payment_ref)}</td><td><small>${o.created_at}</small></td></tr>`).join('') || '<tr><td>No orders</td></tr>'}</table>`;
  }
};
const fd = e => Object.fromEntries(new FormData(e.target));
const showErr = m => { const el = $('#err'); if (el) el.textContent = m; else alert(m); };
window.applyF = e => { e.preventDefault(); const f = fd(e); const q = $('#q').value.trim(); for (const k in f) if (!f[k]) delete f[k]; location.hash = '#/s/' + encodeURIComponent(q) + '?' + new URLSearchParams(f); };
window.add = async id => { if (!ME) return needLogin(); try { const cur = (await api('/api/cart')).items.find(i => i.id === id)?.qty || 0; await api('/api/cart/' + id, { method: 'PUT', json: { qty: cur + Math.max(1, +$('#pq').value || 1) } }); await refreshHeader(); location.hash = '#/cart'; } catch (e) { alert(e.message); } };
window.setQ = async (id, q) => { await api('/api/cart/' + id, { method: 'PUT', json: { qty: +q } }); await refreshHeader(); render(); };
window.placeOrder = async e => { e.preventDefault(); try { const r = await api('/api/checkout', { method: 'POST', json: fd(e) }); await refreshHeader(); if (r.payment.redirectUrl) location.href = r.payment.redirectUrl; else location.hash = '#/done/' + r.orderId; } catch (er) { showErr(er.message); } };
window.auth = async (e, kind) => { e.preventDefault(); const f = fd(e); try { await api('/api/' + kind, { method: 'POST', json: f }); await refreshHeader(); location.hash = f.back || (f.seller ? '#/seller' : '#/'); } catch (er) { showErr(er.message); } };
window.review = async (e, id) => { e.preventDefault(); try { await api(`/api/products/${id}/reviews`, { method: 'POST', json: fd(e) }); render(); } catch (er) { showErr(er.message); } };
window.becomeSeller = async () => { await api('/api/become-seller', { method: 'POST', json: { store_name: $('#sn').value } }); await refreshHeader(); render(); };
window.saveListing = async (e, id) => { e.preventDefault(); try { await api('/api/seller/products' + (id ? '/' + id : ''), { method: id ? 'PUT' : 'POST', body: new FormData(e.target) }); location.hash = '#/seller/listings'; } catch (er) { showErr(er.message); } };
window.delListing = async id => { if (confirm('Delete this listing?')) { await api('/api/seller/products/' + id, { method: 'DELETE' }); render(); } };
window.setStatus = (id, s) => api('/api/seller/orders/' + id, { method: 'PUT', json: { status: s } });
window.setRole = (id, r) => api('/api/admin/users/' + id, { method: 'PUT', json: { role: r } });
async function render() {
  const h = location.hash.slice(2), [path, qs] = h.split('?'), [r = '', ...rest] = path.split('/');
  try { app.innerHTML = await (routes[r] || routes[''])(decodeURIComponent(rest.join('/')), qs); } catch (e) { app.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  scrollTo(0, 0);
}
addEventListener('hashchange', render);
(async () => { CATS = await api('/api/categories'); $('#nav').innerHTML = '<a href="#/">Home</a>' + CATS.map(c => `<a href="#/c/${encodeURIComponent(c.name)}">${esc(c.name)}</a>`).join('') + '<a href="#/s/?deals=1">Deals</a>'; await refreshHeader(); render(); })();
