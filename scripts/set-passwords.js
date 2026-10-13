// Usage: node scripts/set-passwords.js  (server must be stopped). Sets random admin pw (printed) and locks demo accounts.
const db = require('../db'), crypto = require('crypto');
db.init().then(() => {
  const pw = crypto.randomBytes(18).toString('base64url');
  db.run('UPDATE users SET pw=? WHERE email=?', [db.hash(pw), 'admin@linda.local']);
  for (const u of db.all("SELECT id FROM users WHERE email LIKE '%@demo.test'")) db.run('UPDATE users SET pw=? WHERE id=?', [db.hash(crypto.randomBytes(24).toString('hex')), u.id]);
  db.run('DELETE FROM sessions'); db.flush(); console.log(pw);
});
