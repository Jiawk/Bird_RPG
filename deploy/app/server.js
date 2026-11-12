/* 兽人永不为奴 · 登录鉴权服务
 * Node + Express + SQLite + bcrypt + JWT(httpOnly Cookie)
 */
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { DatabaseSync } = require('node:sqlite');   // Node 22.5+ 内置，无需编译

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || (() => { throw new Error('缺少 JWT_SECRET'); })();
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(__dirname, '..', 'public');
const COOKIE_NAME = 'orc_token';
const IS_PROD = process.env.NODE_ENV === 'production';

/* ---------- 数据库 ---------- */
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT UNIQUE NOT NULL,
  pass_hash  TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_login INTEGER
);
CREATE TABLE IF NOT EXISTS saves (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  payload    TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`);

/* ---------- 应用 ---------- */
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '8mb' }));
app.use(cookieParser());

/* 安全响应头 */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; " +
    "script-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self' data:; " +
    "object-src 'none'; base-uri 'self'; frame-ancestors 'self'");
  next();
});

/* ---------- 限流 ---------- */
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: { ok: false, msg: '尝试过于频繁，请 10 分钟后再试' }
});
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 120 });

/* ---------- 工具 ---------- */
function sign(user) {
  return jwt.sign({ uid: user.id, name: user.username }, JWT_SECRET, { expiresIn: '7d' });
}
function setCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true, sameSite: 'lax', secure: IS_PROD,
    maxAge: 7 * 24 * 3600 * 1000, path: '/'
  });
}
function authRequired(req, res, next) {
  const t = req.cookies[COOKIE_NAME];
  if (!t) return res.status(401).json({ ok: false, msg: '未登录' });
  try {
    req.user = jwt.verify(t, JWT_SECRET);
    next();
  } catch (e) {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    return res.status(401).json({ ok: false, msg: '登录已过期' });
  }
}

/* ---------- 注册 / 登录 / 登出 ---------- */
app.post('/api/register', authLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || !/^[a-zA-Z0-9_\u4e00-\u9fa5]{3,16}$/.test(username))
    return res.status(400).json({ ok: false, msg: '用户名需 3~16 位（中文/字母/数字/下划线）' });
  if (typeof password !== 'string' || password.length < 6 || password.length > 64)
    return res.status(400).json({ ok: false, msg: '密码需 6~64 位' });

  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(409).json({ ok: false, msg: '用户名已被占用' });

  const hash = bcrypt.hashSync(password, 12);
  const info = db.prepare('INSERT INTO users (username, pass_hash, created_at) VALUES (?,?,?)')
                 .run(username, hash, Date.now());
  const user = { id: info.lastInsertRowid, username };
  setCookie(res, sign(user));
  res.json({ ok: true, user: { id: user.id, name: username } });
});

app.post('/api/login', authLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string')
    return res.status(400).json({ ok: false, msg: '参数错误' });

  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  // 统一错误信息，避免枚举用户名
  if (!row || !bcrypt.compareSync(password, row.pass_hash))
    return res.status(401).json({ ok: false, msg: '用户名或密码错误' });

  db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(Date.now(), row.id);
  db.prepare('UPDATE users SET username = username WHERE id = ?').get(row.id); // no-op 占位
  setCookie(res, sign(row));
  res.json({ ok: true, user: { id: row.id, name: row.username } });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

app.get('/api/me', authRequired, (req, res) => {
  res.json({ ok: true, user: { id: req.user.uid, name: req.user.name } });
});

/* ---------- 云存档（跨设备同步，服务端校验归属）---------- */
app.get('/api/save', authRequired, (req, res) => {
  const row = db.prepare('SELECT payload, updated_at FROM saves WHERE user_id = ?').get(req.user.uid);
  res.json({ ok: true, save: row ? { payload: JSON.parse(row.payload), updatedAt: row.updated_at } : null });
});

app.put('/api/save', apiLimiter, authRequired, (req, res) => {
  const { payload } = req.body || {};
  if (!payload || typeof payload !== 'object')
    return res.status(400).json({ ok: false, msg: '存档格式错误' });
  const now = Date.now();
  db.prepare(`INSERT INTO saves (user_id, payload, updated_at) VALUES (?,?,?)
              ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at`)
    .run(req.user.uid, JSON.stringify(payload), now);
  res.json({ ok: true, updatedAt: now });
});

/* ---------- 页面 ---------- */
app.get('/health', (req, res) => res.type('text/plain').send('ok'));

app.use(express.static(path.join(__dirname, '..', 'public'), { index: false, maxAge: '1h' }));

/* 未登录访问游戏 → 跳登录页 */
app.get('/', (req, res) => res.redirect('/login'));
app.get('/login', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'login.html')));

app.get('/game', authRequired, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'game.html'));
});

app.use((req, res) => res.status(404).send('Not Found'));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ ok: false, msg: '服务器错误' });
});

app.listen(PORT, '127.0.0.1', () => console.log(`[orc] listening on 127.0.0.1:${PORT}`));
