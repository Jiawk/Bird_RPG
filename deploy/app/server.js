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
CREATE TABLE IF NOT EXISTS profiles (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  nickname   TEXT,
  avatar     TEXT,
  bio        TEXT,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS login_log (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id  INTEGER,
  username TEXT,
  ip       TEXT,
  ua       TEXT,
  ok       INTEGER NOT NULL DEFAULT 1,
  at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_at ON login_log(at DESC);

CREATE TABLE IF NOT EXISTS audit_log (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id  INTEGER,
  username TEXT,
  action   TEXT NOT NULL,
  detail   TEXT,
  ip       TEXT,
  at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at DESC);

CREATE TABLE IF NOT EXISTS settings (
  k TEXT PRIMARY KEY,
  v TEXT
);

CREATE TABLE IF NOT EXISTS user_mails (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  items      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  acked_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_mail_user ON user_mails(user_id, acked_at);

CREATE TABLE IF NOT EXISTS daily_login (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  day     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leaderboard (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  power      INTEGER NOT NULL DEFAULT 0,
  cls        TEXT,
  weapon     TEXT,
  char_name  TEXT,
  level      INTEGER DEFAULT 1,
  updated_at INTEGER NOT NULL
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

/* ---------- 在线状态（内存，2 分钟无心跳视为离线）---------- */
const online = new Map();   // uid -> {name, ip, last, ua}
const ONLINE_TTL = 2 * 60 * 1000;

function touchOnline(req, uid, name) {
  online.set(uid, {
    name, ip: clientIp(req), ua: (req.headers['user-agent'] || '').slice(0, 160),
    last: Date.now()
  });
}
function onlineList() {
  const now = Date.now();
  for (const [k, v] of online) if (now - v.last > ONLINE_TTL) online.delete(k);
  return [...online.entries()].map(([uid, v]) => ({ uid, ...v, idle: Math.floor((now - v.last) / 1000) }));
}
function clientIp(req) {
  return (req.headers['x-real-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0] ||
          req.socket.remoteAddress || '').replace('::ffff:', '');
}

/* ---------- 管理员 ---------- */
const ADMIN_NAME = process.env.ADMIN_NAME || 'Bird';
function isAdmin(user) { return user && user.name === ADMIN_NAME; }
function adminRequired(req, res, next) {
  if (!isAdmin(req.user)) return res.status(403).json({ ok: false, msg: '需要管理员权限' });
  next();
}

/* ---------- 审计 ---------- */
function audit(req, action, detail) {
  try {
    db.prepare('INSERT INTO audit_log (user_id, username, action, detail, ip, at) VALUES (?,?,?,?,?,?)')
      .run(req.user ? req.user.uid : null, req.user ? req.user.name : null,
           action, detail == null ? '' : String(detail).slice(0, 300), clientIp(req), Date.now());
  } catch (e) { console.warn('audit', e.message); }
}

/* ---------- 工具 ---------- */
function sign(user) {
  return jwt.sign({ uid: user.id, name: user.username }, JWT_SECRET, { expiresIn: '7d' });
}
/* 纯 HTTP 部署时 secure 必须为 false，否则浏览器不回收 Cookie
   将来上 HTTPS 只要把环境变量 COOKIE_SECURE=1 打开即可 */
const COOKIE_SECURE = process.env.COOKIE_SECURE === '1';
function setCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true, sameSite: 'lax', secure: COOKIE_SECURE,
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
  db.prepare('INSERT INTO login_log (user_id, username, ip, ua, ok, at) VALUES (?,?,?,?,?,?)')
    .run(user.id, username, clientIp(req), (req.headers['user-agent'] || '').slice(0, 160), 1, Date.now());
  audit({ user }, 'register', '新账号注册');
  touchOnline(req, user.id, username);
  res.json({ ok: true, user: { id: user.id, name: username } });
});

app.post('/api/login', authLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string')
    return res.status(400).json({ ok: false, msg: '参数错误' });

  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  // 统一错误信息，避免枚举用户名
  if (!row || !bcrypt.compareSync(password, row.pass_hash)) {
    db.prepare('INSERT INTO login_log (user_id, username, ip, ua, ok, at) VALUES (?,?,?,?,?,?)')
      .run(row ? row.id : null, username, clientIp(req), (req.headers['user-agent'] || '').slice(0, 160), 0, Date.now());
    return res.status(401).json({ ok: false, msg: '用户名或密码错误' });
  }

  db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(Date.now(), row.id);
  db.prepare('INSERT INTO login_log (user_id, username, ip, ua, ok, at) VALUES (?,?,?,?,?,?)')
    .run(row.id, row.username, clientIp(req), (req.headers['user-agent'] || '').slice(0, 160), 1, Date.now());
  setCookie(res, sign(row));
  audit({ user: { uid: row.id, name: row.username } }, 'login', '登录成功');
  touchOnline(req, row.id, row.username);
  res.json({ ok: true, user: { id: row.id, name: row.username } });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

app.get('/api/me', authRequired, (req, res) => {
  const u = db.prepare('SELECT id, username, created_at, last_login FROM users WHERE id = ?').get(req.user.uid);
  const p = db.prepare('SELECT nickname, avatar, bio FROM profiles WHERE user_id = ?').get(req.user.uid) || {};
  const sv = db.prepare('SELECT updated_at FROM saves WHERE user_id = ?').get(req.user.uid) || {};
  res.json({ ok: true, user: {
    id: u.id, name: u.username, createdAt: u.created_at, lastLogin: u.last_login,
    nickname: p.nickname || u.username, avatar: p.avatar || '#d4af37', bio: p.bio || '',
    saveUpdatedAt: sv.updated_at || null
  }});
});

/* 用户资料（昵称/头像色/签名） */
app.put('/api/profile', apiLimiter, authRequired, (req, res) => {
  const { nickname, avatar, bio } = req.body || {};
  if (nickname !== undefined && (typeof nickname !== 'string' || nickname.length < 1 || nickname.length > 16))
    return res.status(400).json({ ok: false, msg: '昵称需 1~16 字' });
  if (avatar !== undefined && (typeof avatar !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(avatar)))
    return res.status(400).json({ ok: false, msg: '头像颜色格式错误' });
  if (bio !== undefined && (typeof bio !== 'string' || bio.length > 60))
    return res.status(400).json({ ok: false, msg: '签名最多 60 字' });
  const cur = db.prepare('SELECT nickname, avatar, bio FROM profiles WHERE user_id = ?').get(req.user.uid) || {};
  const now = Date.now();
  db.prepare(`INSERT INTO profiles (user_id, nickname, avatar, bio, updated_at) VALUES (?,?,?,?,?)
              ON CONFLICT(user_id) DO UPDATE SET nickname=excluded.nickname, avatar=excluded.avatar,
              bio=excluded.bio, updated_at=excluded.updated_at`)
    .run(req.user.uid, nickname ?? cur.nickname ?? req.user.name,
         avatar ?? cur.avatar ?? '#d4af37', bio ?? cur.bio ?? '', now);
  res.json({ ok: true, updatedAt: now });
});

/* 修改密码 */
app.post('/api/password', apiLimiter, authRequired, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (typeof oldPassword !== 'string' || typeof newPassword !== 'string')
    return res.status(400).json({ ok: false, msg: '参数错误' });
  if (newPassword.length < 6 || newPassword.length > 64)
    return res.status(400).json({ ok: false, msg: '新密码需 6~64 位' });
  const row = db.prepare('SELECT pass_hash FROM users WHERE id = ?').get(req.user.uid);
  if (!row || !bcrypt.compareSync(oldPassword, row.pass_hash))
    return res.status(401).json({ ok: false, msg: '原密码错误' });
  db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?')
    .run(bcrypt.hashSync(newPassword, 12), req.user.uid);
  res.json({ ok: true });
});

/* ---------- 云存档（跨设备同步，服务端校验归属）---------- */
app.get('/api/save', authRequired, (req, res) => {
  const row = db.prepare('SELECT payload, updated_at FROM saves WHERE user_id = ?').get(req.user.uid);
  res.json({ ok: true, save: row ? { payload: JSON.parse(row.payload), updatedAt: row.updated_at } : null });
});

function saveMaxLevel(payload) {
  try {
    const ch = (payload && payload.chars) || [];
    return ch.reduce((m, c) => Math.max(m, Number(c && c.level) || 0), 0);
  } catch (e) { return 0; }
}

app.put('/api/save', apiLimiter, authRequired, (req, res) => {
  const { payload, meta } = req.body || {};

  /* 防降级：旧标签页 / 旧快照不允许覆盖更高等级存档 */
  try {
    const prev = db.prepare('SELECT payload FROM saves WHERE user_id = ?').get(req.user.uid);
    if (prev) {
      const oldLv = saveMaxLevel(JSON.parse(prev.payload));
      const newLv = saveMaxLevel(payload);
      if (newLv < oldLv) {
        return res.json({ ok: true, ignored: true, reason: 'stale', serverLevel: oldLv });
      }
    }
  } catch (e) { /* 解析失败就放行 */ }

  // 排行榜快照
  if (meta && typeof meta === 'object') {
    try {
      db.prepare(`INSERT INTO leaderboard (user_id, power, cls, weapon, char_name, level, updated_at)
                  VALUES (?,?,?,?,?,?,?)
                  ON CONFLICT(user_id) DO UPDATE SET power=excluded.power, cls=excluded.cls,
                  weapon=excluded.weapon, char_name=excluded.char_name, level=excluded.level,
                  updated_at=excluded.updated_at`)
        .run(req.user.uid, Math.max(0, Number(meta.power) | 0),
             String(meta.cls || '').slice(0, 12), String(meta.weapon || '').slice(0, 40),
             String(meta.charName || '').slice(0, 20), Math.max(1, Number(meta.level) | 0), Date.now());
    } catch (e) { console.warn('leaderboard', e.message); }
  }
  if (!payload || typeof payload !== 'object')
    return res.status(400).json({ ok: false, msg: '存档格式错误' });
  const now = Date.now();
  db.prepare(`INSERT INTO saves (user_id, payload, updated_at) VALUES (?,?,?)
              ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at`)
    .run(req.user.uid, JSON.stringify(payload), now);
  res.json({ ok: true, updatedAt: now });
});

/* ---------- 心跳 / 公告 / 邮件 ---------- */
app.post('/api/ping', (req, res) => {
  // 用 Cookie 里的 token 判断身份，未登录也返回 ok，方便统计游客
  const t = req.cookies[COOKIE_NAME];
  let daily = null;
  if (t) {
    try {
      const u = jwt.verify(t, JWT_SECRET);
      touchOnline(req, u.uid, u.name);
      daily = dailyLoginReward(u.uid);        // 每天第一次上线送 100 抽
    } catch (e) { /* 过期就忽略 */ }
  }
  res.json({ ok: true, online: onlineList().length, dailyReward: daily });
});

/* ---------- 每天第一次上线送 100 抽 ---------- */
function todayKey() {
  const d = new Date();
  const p2 = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
}

function dailyLoginReward(uid, draws = 100) {
  const day = todayKey();
  const row = db.prepare('SELECT day FROM daily_login WHERE user_id = ?').get(uid);
  if (row && row.day === day) return null;               // 今天已经领过
  const now = Date.now();
  db.prepare('INSERT INTO user_mails (user_id, title, body, items, created_at) VALUES (?,?,?,?,?)')
    .run(uid, `每日首次上线奖励 · ${draws} 抽`,
         '今天第一次上线，100 抽已送到邮箱，记得领取！',
         JSON.stringify([{ type:'mat', key:'bossToken', amount: draws * 10 }]), now);
  db.prepare('INSERT INTO daily_login (user_id, day) VALUES (?,?) ' +
             'ON CONFLICT(user_id) DO UPDATE SET day = excluded.day').run(uid, day);
  console.log(`[orc] 每日首次上线奖励 uid=${uid} ${day} 各 ${draws} 抽`);
  return { ok: true, draws, day };
}

app.get('/api/announce', (req, res) => {
  const row = db.prepare('SELECT v FROM settings WHERE k = ?').get('announce');
  res.json({ ok: true, text: row ? row.v : '' });
});

app.get('/api/mails', authRequired, (req, res) => {
  const rows = db.prepare(
    'SELECT id, title, body, items, created_at FROM user_mails WHERE user_id = ? AND acked_at IS NULL ORDER BY id ASC LIMIT 50'
  ).all(req.user.uid);
  res.json({ ok: true, mails: rows.map(r => ({
    id: r.id, title: r.title, body: r.body,
    items: JSON.parse(r.items), at: r.created_at
  }))});
});

app.post('/api/mails/ack', authRequired, (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return res.json({ ok: true });
  const st = db.prepare('UPDATE user_mails SET acked_at = ? WHERE id = ? AND user_id = ?');
  const now = Date.now();
  ids.slice(0, 60).forEach(id => { try { st.run(now, Number(id), req.user.uid); } catch (e) {} });
  res.json({ ok: true });
});

/* ---------- 战力排行榜（前 10）---------- */
app.get('/api/leaderboard', authRequired, (req, res) => {
  const rows = db.prepare(`
    SELECT l.power, l.cls, l.weapon, l.char_name, l.level, l.updated_at, u.username
    FROM leaderboard l JOIN users u ON u.id = l.user_id
    ORDER BY l.power DESC, l.updated_at ASC
    LIMIT 10`).all();
  res.json({ ok: true, rows: rows.map(r => ({
    name: r.username, charName: r.char_name, cls: r.cls,
    power: r.power, weapon: r.weapon, level: r.level, at: r.updated_at
  }))});
});

/* ---------- 管理接口 ---------- */
app.get('/api/admin/stats', authRequired, adminRequired, (req, res) => {
  const now = Date.now(), dayAgo = now - 86400000;
  const users = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  const logins24 = db.prepare('SELECT COUNT(*) c FROM login_log WHERE ok = 1 AND at > ?').get(dayAgo).c;
  const fails24 = db.prepare('SELECT COUNT(*) c FROM login_log WHERE ok = 0 AND at > ?').get(dayAgo).c;
  const saves = db.prepare('SELECT COUNT(*) c FROM saves').get().c;
  const onlineN = onlineList().length;
  const ann = db.prepare('SELECT v FROM settings WHERE k = ?').get('announce');
  res.json({ ok: true, stats: {
    users, online: onlineN, logins24, fails24, saves,
    announce: ann ? ann.v : '',
    reward: db.prepare('SELECT v FROM settings WHERE k = ?').get('last_night_reward')?.v || null
  }, online: onlineList().sort((a, b) => b.last - a.last) });
});

app.get('/api/admin/logins', authRequired, adminRequired, (req, res) => {
  const rows = db.prepare('SELECT * FROM login_log ORDER BY id DESC LIMIT 200').all();
  res.json({ ok: true, rows });
});

app.get('/api/admin/audit', authRequired, adminRequired, (req, res) => {
  const rows = db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 300').all();
  res.json({ ok: true, rows });
});

app.post('/api/admin/announce', authRequired, adminRequired, (req, res) => {
  const { text } = req.body || {};
  if (typeof text !== 'string' || text.length > 300)
    return res.status(400).json({ ok: false, msg: '公告最多 300 字' });
  db.prepare('INSERT INTO settings (k, v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
    .run('announce', text);
  audit(req, 'set_announce', text.slice(0, 120));
  res.json({ ok: true });
});

/* 手动补发奖励（测试用） */
app.post('/api/admin/grant', authRequired, adminRequired, (req, res) => {
  const { amount } = req.body || {};
  const n = Math.max(1, Math.min(100, Number(amount) || 10));
  const list = onlineList();
  const st = db.prepare('INSERT INTO user_mails (user_id, title, body, items, created_at) VALUES (?,?,?,?,?)');
  const now = Date.now();
  list.forEach(u => st.run(u.uid, `抽奖福利 ${n} 抽`,
    '在线奖励已发放，去邮箱领取。', JSON.stringify([{ type:'mat', key:'bossToken', amount: n * 10 }]), now));
  audit(req, 'grant_online', `${n} 抽 × ${list.length} 人在线`);
  res.json({ ok: true, count: list.length });
});

/* ---------- 每晚 20:00 在线送 30 抽 ---------- */
function nightReward(dateKey, draws, force) {
  const key = 'last_night_reward';
  const last = db.prepare('SELECT v FROM settings WHERE k = ?').get(key);
  if (!force && last && last.v === dateKey) return { skipped: true, count: 0 };
  const list = onlineList();
  const st = db.prepare('INSERT INTO user_mails (user_id, title, body, items, created_at) VALUES (?,?,?,?,?)');
  const now = Date.now();
  list.forEach(u => st.run(u.uid, `每晚 20 点在线奖励 · ${draws} 抽`,
    `感谢你今晚的陪伴！${draws} 抽已发放到邮箱。`, 
    JSON.stringify([{ type:'mat', key:'bossToken', amount: draws * 10 }]), now));
  db.prepare('INSERT INTO settings (k, v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
    .run(key, dateKey);
  console.log(`[orc] 每晚奖励 ${dateKey}: ${list.length} 人在线，各 ${draws} 抽`);
  return { ok: true, count: list.length };
}

/* ---------- 每小时第 1 分钟：在线玩家送 10 抽 ---------- */
function hourlyReward(hourKey, draws) {
  const key = 'last_hour_reward';
  const last = db.prepare('SELECT v FROM settings WHERE k = ?').get(key);
  if (last && last.v === hourKey) return { skipped: true, count: 0 };   // 本小时已发过
  const list = onlineList();
  if (!list.length) {
    db.prepare('INSERT INTO settings (k, v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(key, hourKey);
    return { ok: true, count: 0 };
  }
  const st = db.prepare('INSERT INTO user_mails (user_id, title, body, items, created_at) VALUES (?,?,?,?,?)');
  const now = Date.now();
  list.forEach(u => st.run(u.uid, `每小时在线奖励 · ${draws} 抽`,
    '整点在线福利，感谢你的陪伴！去邮箱领取。',
    JSON.stringify([{ type:'mat', key:'bossToken', amount: draws * 10 }]), now));
  db.prepare('INSERT INTO settings (k, v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
    .run(key, hourKey);
  console.log(`[orc] 每小时在线奖励 ${hourKey}: ${list.length} 人在线，各 ${draws} 抽`);
  return { ok: true, count: list.length };
}

function hourKeyOf(d) {
  const p2 = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + 'T' + p2(d.getHours());
}

let lastTickMin = -1;
let lastHourTick = '';
setInterval(() => {
  const d = new Date();
  // 服务器时区应为 Asia/Shanghai（部署时已设置）
  const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  if (d.getHours() === 20 && d.getMinutes() < 2 && lastTickMin !== d.getMinutes()) {
    lastTickMin = d.getMinutes();
    nightReward(key, 30, false);
  }
  // 每小时第 1 分钟发放 10 抽在线奖励
  const hk = hourKeyOf(d);
  if (d.getMinutes() === 1 && lastHourTick !== hk) {
    lastHourTick = hk;
    hourlyReward(hk, 10);
  }
}, 30 * 1000);

/* 手动触发一次每小时奖励（管理员） */
app.post('/api/admin/hourly', authRequired, adminRequired, (req, res) => {
  const r = hourlyReward(hourKeyOf(new Date()) + '-manual-' + Date.now(), 10);
  audit(req, 'hourly_reward', `手动发放 ${r.count} 人`);
  res.json({ ok: true, ...r });
});

/* ---------- 页面 ---------- */
app.get('/health', (req, res) => res.type('text/plain').send('ok'));

app.use(express.static(path.join(__dirname, '..', 'public'), { index: false, maxAge: '1h' }));

/* 未登录访问游戏 → 跳登录页 */
app.get('/', (req, res) => res.redirect('/login'));
app.get('/login', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'login.html')));

app.get('/game', authRequired, (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');   // 避免玩家跑到旧版本
  res.sendFile(path.join(PUBLIC_DIR, 'game.html'));
});

app.get('/admin', authRequired, adminRequired,
  (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));

app.use((req, res) => res.status(404).send('Not Found'));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ ok: false, msg: '服务器错误' });
});

app.listen(PORT, '127.0.0.1', () => console.log(`[orc] listening on 127.0.0.1:${PORT}`));
