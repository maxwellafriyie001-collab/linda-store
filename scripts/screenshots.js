const puppeteer = require('puppeteer-core'), B = 'http://localhost:8080', OUT = '/workspace/linda/screenshots/';
(async () => {
  const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const mk = async () => { const ctx = await br.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: 1280, height: 800 }); return p; };
  const go = async (p, h) => { await p.goto(B + '/?r=' + Math.random() + '#/' + h, { waitUntil: 'networkidle0' }); await new Promise(r => setTimeout(r, 400)); };
  const call = (p, m, u, j) => p.evaluate(async (m, u, j) => (await fetch(u, { method: m, headers: { 'Content-Type': 'application/json' }, body: j && JSON.stringify(j) })).json(), m, u, j);
  // seller with an uploaded image listing
  const s = await mk(); await go(s, '');
  await s.setViewport({width:400,height:300}); await s.goto(B + '/img/p6.svg'); await new Promise(r=>setTimeout(r,500)); const png = await s.screenshot({ type: 'png', }); await s.setViewport({width:1280,height:800});
  await go(s, ''); await call(s, 'POST', '/api/signup', { email: 'seller@demo.test', name: 'Rosa Diaz', password: 'demo12345', seller: 1, store_name: 'Liberty Woodworks' });
  const pid = await s.evaluate(async (b64) => { const f = new FormData(); Object.entries({ name: 'Handmade Oak Cutting Board', category: 'Home & Kitchen', price: '39.50', stock: '12', description: 'Solid American oak, finished with food-safe oil. (Demo listing created by test seller.)' }).forEach(([k, v]) => f.append(k, v));
    f.append('image', new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], { type: 'image/png' }), 'board.png'); return (await (await fetch('/api/seller/products', { method: 'POST', body: f })).json()).id; }, Buffer.from(png).toString('base64'));
  // buyer: buy & review
  const b = await mk(); await go(b, '');
  await call(b, 'POST', '/api/signup', { email: 'buyer@demo.test', name: 'Jordan Miller', password: 'demo12345' });
  await call(b, 'PUT', '/api/cart/' + pid, { qty: 1 }); await call(b, 'PUT', '/api/cart/3', { qty: 1 });
  await call(b, 'POST', '/api/checkout', { name: 'Jordan Miller', address: '742 Elm St', city: 'Springfield', state: 'IL', zip: '62701' });
  await call(b, 'POST', `/api/products/${pid}/reviews`, { rating: 5, body: 'Beautiful board, arrived well packed. Would buy again!' });
  await call(b, 'POST', `/api/products/3/reviews`, { rating: 4, body: 'Great sound for the price.' });
  const b3 = await mk(); await go(b3, ''); await call(b3, 'POST', '/api/signup', { email: 'buyer2@demo.test', name: 'Pat Lee', password: 'demo12345' });
  await call(b3, 'PUT', '/api/cart/' + pid, { qty: 1 }); await call(b3, 'POST', '/api/checkout', { name: 'Pat Lee', address: '9 Bay Rd', city: 'Austin', state: 'TX', zip: '73301' });
  await call(b3, 'POST', `/api/products/${pid}/reviews`, { rating: 4, body: 'Solid and heavy. Nice grain.' });
  const so = await call(s, 'GET', '/api/seller/orders'); await call(s, 'PUT', '/api/seller/orders/' + so[so.length - 1].id, { status: 'shipped' });
  await call(b, 'PUT', '/api/cart/9', { qty: 2 }); await call(b, 'PUT', '/api/cart/14', { qty: 1 }); await call(b, 'PUT', '/api/cart/21', { qty: 1 });
  const shot = async (p, h, n) => { await go(p, h); await p.screenshot({ path: OUT + 'v2-' + n + '.png', fullPage: n==='product-reviews' }); console.log('v2-' + n); };
  await shot(b, '', 'home'); await shot(b, 's/board?sort=price_asc', 'search'); await shot(b, 'p/' + pid, 'product-reviews');
  await go(s, 'seller/orders'); await shot(s, 'seller/listings', 'seller-dashboard'); await shot(s, 'seller/orders', 'seller-orders');
  await shot(b, 'cart', 'cart'); await go(b, 'checkout'); await b.type('input[name=address]', '742 Elm St'); await b.type('input[name=city]', 'Springfield'); await b.type('input[name=state]', 'IL'); await b.type('input[name=zip]', '62701');
  await b.screenshot({ path: OUT + 'v2-checkout.png' }); await shot(b, 'orders', 'order-history');
  const a = await mk(); await go(a, ''); await call(a, 'POST', '/api/login', { email: 'admin@linda.local', password: 'admin1234' }); await shot(a, 'admin', 'admin');
  await br.close();
})();
