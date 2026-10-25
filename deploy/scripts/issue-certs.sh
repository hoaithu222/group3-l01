#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Cấp chứng chỉ Let's Encrypt bằng certbot (chạy trong Docker) cho MỘT hoặc NHIỀU tên miền (p0-11 §4 — mỗi tên miền một chứng chỉ riêng, tên thư mục = tên miền,
# khớp đường dẫn /etc/letsencrypt/live/<domain>/ trong nginx).
#   CERTBOT_EMAIL=ops@vcijsc.com bash issue-certs.sh superapp.vcijsc.com admin.superapp.vcijsc.com
# Chế độ: cổng 80 còn trống (lần đầu, nginx chưa chạy) → `standalone`; nginx đang giữ cổng 80 → `webroot` (/var/www/certbot, đã mount vào nginx).
# Gia hạn: cron/systemd timer mỗi ngày — xem deploy/README.md §TLS (certbot renew rồi `nginx -s reload`).
# ⛔ Không chạy trên máy dev; chỉ trên VM staging/production (cần DNS đã trỏ về VM).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

[ "$#" -ge 1 ] || { echo "dùng: CERTBOT_EMAIL=<email> issue-certs.sh <domain> [domain…]" >&2; exit 1; }
: "${CERTBOT_EMAIL:?đặt CERTBOT_EMAIL}"
STAGING_FLAG=()
[ "${CERTBOT_STAGING:-0}" = "1" ] && STAGING_FLAG=(--staging)   # thử với CA staging của Let's Encrypt (không tính hạn mức)

mkdir -p /var/www/certbot

port80_busy() { (exec 3<>/dev/tcp/127.0.0.1/80) 2>/dev/null; }

for domain in "$@"; do
  if port80_busy; then
    echo "[certs] $domain — webroot (cổng 80 đang được nginx giữ)"
    docker run --rm -v /etc/letsencrypt:/etc/letsencrypt -v /var/www/certbot:/var/www/certbot certbot/certbot certonly \
      --webroot -w /var/www/certbot -d "$domain" --email "$CERTBOT_EMAIL" --agree-tos --no-eff-email --non-interactive ${STAGING_FLAG[@]+"${STAGING_FLAG[@]}"}
  else
    echo "[certs] $domain — standalone (cổng 80 trống)"
    docker run --rm -p 80:80 -v /etc/letsencrypt:/etc/letsencrypt certbot/certbot certonly \
      --standalone -d "$domain" --email "$CERTBOT_EMAIL" --agree-tos --no-eff-email --non-interactive ${STAGING_FLAG[@]+"${STAGING_FLAG[@]}"}
  fi
done
echo "[certs] xong. Kiểm: ls /etc/letsencrypt/live/"
