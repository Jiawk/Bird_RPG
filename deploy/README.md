# 兽人永不为奴 · 服务器部署说明

## 目录结构
```
deploy/
├── app/server.js          后端（Express + SQLite + bcrypt + JWT httpOnly Cookie）
├── app/package.json
├── public/game.html       游戏本体（登录后才可访问）
├── public/login.html      登录 / 注册页
├── nginx.conf             反向代理 + 安全头 + 限流
├── orc-arena.service      systemd 单元（含沙箱加固）
├── deploy.sh              一键部署脚本
└── README.md              本文件
```

## 本地验证结果（已跑通）
```
健康检查            ok
未登录 /game        401  ✅
登录页 /login       200  ✅
注册                成功（id=1） ✅
已登录 /game        200  ✅
/api/me             返回用户 ✅
密码错误            统一提示「用户名或密码错误」 ✅
重名注册            409 用户名已被占用 ✅
弱密码              400 用户名格式校验 ✅
云存档 写/读        成功 ✅
登出后 /game        401  ✅
```

## 技术栈
| 层 | 选型 | 说明 |
|---|---|---|
| Web | Nginx | TLS 终止、反向代理、限流、安全响应头 |
| 应用 | Node.js 22 + Express 4 | 只监听 127.0.0.1:3000，不对外暴露 |
| 数据库 | SQLite（**Node 内置 `node:sqlite`**, WAL） | 零原生依赖、免编译；需要 MySQL 可替换 |
| 密码 | bcrypt（cost 12） | 永不存明文 |
| 会话 | JWT，httpOnly + SameSite=Lax Cookie | 前端拿不到 token，防 XSS 窃取 |
| 限流 | express-rate-limit + Nginx limit_req | 登录 10 分钟 20 次 |

## 部署
```bash
# 1. 上传整个 deploy 目录到服务器
scp -r deploy/ ecs-user@8.136.45.66:/tmp/

# 2. 执行（有 sudo/root 即可）
ssh ecs-user@8.136.45.66
sudo bash /tmp/deploy/deploy.sh

# 3.（可选）有域名时自动申请证书并强制 HTTPS
sudo DOMAIN=game.example.com bash /tmp/deploy/deploy.sh
```

## 部署后
- 登录页：`http://<IP>/login`
- 游戏页：`http://<IP>/game`（未登录会被 401 拦截）
- 健康检查：`/health`
- 服务日志：`journalctl -u orc-arena -f`

## 安全清单
- [x] Node 只监听回环地址，外部只能经 Nginx
- [x] 密码 bcrypt cost 12
- [x] JWT 放 httpOnly Cookie（JS 不可读）
- [x] 登录接口限流（Nginx 12r/m + 应用层 20 次/10 分钟）
- [x] 统一「用户名或密码错误」，防用户枚举
- [x] 用户名/密码长度与字符白名单校验
- [x] CSP / X-Frame-Options / nosniff / Referrer-Policy / Permissions-Policy
- [x] `server_tokens off` 隐藏 Nginx 版本
- [x] systemd 沙箱：NoNewPrivileges / ProtectSystem=strict / ProtectHome / PrivateTmp
- [x] 数据库文件权限 750，属主 orc 用户
- [x] UFW 仅放行 22/80/443
- [x] 禁止访问 `.` 开头的隐藏文件

## 接口
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/register | 注册（用户名 3~16 位，密码 6~64 位） |
| POST | /api/login | 登录，下发 Cookie |
| POST | /api/logout | 登出 |
| GET | /api/me | 当前用户 |
| GET | /api/save | 拉取云存档 |
| PUT | /api/save | 上传云存档（body 上限 8MB） |

## 换成 MySQL（可选）
若你更想用 MySQL，把 `node:sqlite` 换成 `mysql2`，建库：
```sql
CREATE DATABASE orc DEFAULT CHARSET utf8mb4;
CREATE USER 'orc'@'localhost' IDENTIFIED BY '<强密码>';
GRANT ALL ON orc.* TO 'orc'@'localhost';
```
表结构与 SQLite 版一致（`INTEGER PRIMARY KEY AUTOINCREMENT` → `BIGINT AUTO_INCREMENT`）。

## 注意
- `.env` 里的 `JWT_SECRET` 由脚本随机生成，**不要提交到 git**。
- 游戏是纯前端单文件，登录只是**访问控制**；玩家本地存档仍走 localStorage，
  云端 `/api/save` 是跨设备同步的可选项。
