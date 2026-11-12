#!/usr/bin/env bash
# 兽人永不为奴 · 一键部署脚本
# 用法：sudo bash deploy.sh
set -euo pipefail

APP_DIR=/opt/orc-arena
SVC=orc-arena
DOMAIN="${DOMAIN:-}"          # 可选：DOMAIN=game.example.com sudo -E bash deploy.sh

echo "==> 1/9 安装依赖"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg nginx ufw

if ! command -v node >/dev/null 2>&1; then
  echo "    安装 Node.js 22（内置 node:sqlite，无需原生编译）..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
node -v

echo "==> 2/9 创建运行用户"
id -u orc >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin orc

echo "==> 3/9 部署文件"
mkdir -p "$APP_DIR"/{app,public,data}
cp -f app/server.js app/package.json "$APP_DIR/app/"
cp -f public/game.html public/login.html "$APP_DIR/public/"
chown -R orc:orc "$APP_DIR"
chmod 750 "$APP_DIR/data"

echo "==> 4/9 安装 npm 依赖"
cd "$APP_DIR/app"
npm ci --omit=dev --no-audit --no-fund 2>/dev/null || npm install --omit=dev --no-audit --no-fund

echo "==> 5/9 生成密钥"
if [ ! -f "$APP_DIR/app/.env" ]; then
  SECRET=$(head -c 48 /dev/urandom | base64 | tr -d '\n=+/' | cut -c1-48)
  cat > "$APP_DIR/app/.env" <<ENV
JWT_SECRET=$SECRET
NODE_ENV=production
PORT=3000
ENV
  chmod 600 "$APP_DIR/app/.env"
  chown orc:orc "$APP_DIR/app/.env"
fi

echo "==> 6/9 安装 systemd 服务"
cp -f orc-arena.service /etc/systemd/system/$SVC.service
systemctl daemon-reload
systemctl enable $SVC
systemctl restart $SVC
sleep 2
systemctl is-active $SVC

echo "==> 7/9 配置 Nginx"
cp -f nginx.conf /etc/nginx/sites-available/$SVC
ln -sf /etc/nginx/sites-available/$SVC /etc/nginx/sites-enabled/$SVC
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==> 8/9 防火墙"
ufw allow 22/tcp  >/dev/null 2>&1 || true
ufw allow 80/tcp  >/dev/null 2>&1 || true
ufw allow 443/tcp >/dev/null 2>&1 || true
yes | ufw enable   >/dev/null 2>&1 || true

echo "==> 9/9 健康检查"
sleep 1
curl -fsS http://127.0.0.1:3000/health && echo "  [Node OK]"
curl -fsS -o /dev/null -w "  [Nginx] HTTP %{http_code}\n" http://127.0.0.1/login

if [ -n "$DOMAIN" ]; then
  echo "==> 申请 HTTPS 证书: $DOMAIN"
  apt-get install -y -qq certbot python3-certbot-nginx
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "admin@$DOMAIN" --redirect || \
    echo "   证书申请失败（域名未解析到本机？）"
fi

echo
echo "======================================================"
echo " 部署完成"
echo " 访问: http://<服务器IP>/login"
echo " 状态: systemctl status $SVC"
echo " 日志: journalctl -u $SVC -f"
echo " 配置: $APP_DIR"
echo "======================================================"
