#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# `nginx -t` cho cấu hình nginx của deploy/ (p0-11 be.md §10 "nginx -t trong CI") — render template với tên miền MẪU, sinh chứng chỉ TỰ KÝ tạm, chạy `nginx -t`
# trong container nginx:1.27-alpine. Không cần server/DNS thật. Cần Docker (CI/máy có Docker; script không chạy container nào ngoài `nginx -t`).
#   bash deploy/scripts/nginx-test.sh
# Kiểm cả: nginx chính (deploy/nginx), site API + admin (+ livekit-proxy staging), và edge của VM LiveKit (stream SNI).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${NGINX_IMAGE:-nginx:1.27-alpine}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

command -v docker >/dev/null 2>&1 || { echo "[nginx-test] cần docker" >&2; exit 1; }
command -v openssl >/dev/null 2>&1 || { echo "[nginx-test] cần openssl" >&2; exit 1; }
command -v envsubst >/dev/null 2>&1 || { echo "[nginx-test] cần envsubst" >&2; exit 1; }

export API_DOMAIN=api.example.test ADMIN_DOMAIN=admin.example.test LK_DOMAIN=lk.example.test TURN_DOMAIN=turn.example.test SWAGGER_AUTH_BASIC=off

# Chứng chỉ tự ký cho mọi tên miền mẫu (chỉ để `nginx -t` đọc được file).
for d in "$API_DOMAIN" "$ADMIN_DOMAIN" "$LK_DOMAIN" "$TURN_DOMAIN"; do
  mkdir -p "$TMP/letsencrypt/live/$d"
  openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=$d" \
    -keyout "$TMP/letsencrypt/live/$d/privkey.pem" -out "$TMP/letsencrypt/live/$d/fullchain.pem" >/dev/null 2>&1
done

# Render site templates (cùng bộ lọc biến như compose) → $TMP/sites, và AASA/assetlinks mẫu.
mkdir -p "$TMP/sites" "$TMP/well-known" "$TMP/secrets"
vars='${API_DOMAIN} ${ADMIN_DOMAIN} ${LK_DOMAIN} ${TURN_DOMAIN} ${SWAGGER_AUTH_BASIC}'
for f in superapp admin livekit-proxy; do envsubst "$vars" <"$ROOT/nginx/sites/$f.conf" >"$TMP/sites/$f.conf"; done
APPLE_TEAM_ID=ABCDE12345 envsubst '${APPLE_TEAM_ID}' <"$ROOT/nginx/well-known/apple-app-site-association.template" >"$TMP/well-known/apple-app-site-association"
ANDROID_SHA256_FINGERPRINTS_JSON='"AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA"' \
  envsubst '${ANDROID_SHA256_FINGERPRINTS_JSON}' <"$ROOT/nginx/well-known/assetlinks.json.template" >"$TMP/well-known/assetlinks.json"

# Edge của VM LiveKit.
mkdir -p "$TMP/edge/stream" "$TMP/edge/http"
envsubst '${TURN_DOMAIN}' <"$ROOT/livekit/edge/templates/stream/sni.conf.template" >"$TMP/edge/stream/sni.conf"
envsubst '${LK_DOMAIN} ${TURN_DOMAIN}' <"$ROOT/livekit/edge/templates/http/livekit.conf.template" >"$TMP/edge/http/livekit.conf"

# Upstream `api-1/api-2/admin/host.docker.internal` phải phân giải được khi `nginx -t` (nginx tra DNS lúc nạp cấu hình) — thêm --add-host trỏ 127.0.0.1.
HOSTS=(--add-host api-1:127.0.0.1 --add-host api-2:127.0.0.1 --add-host admin:127.0.0.1 --add-host host.docker.internal:127.0.0.1)

echo "[nginx-test] 1/2 nginx chính (api + admin + livekit-proxy)…"
docker run --rm "${HOSTS[@]}" \
  -v "$ROOT/nginx/nginx.conf:/etc/nginx/nginx.conf:ro" \
  -v "$ROOT/nginx/snippets:/etc/nginx/snippets:ro" \
  -v "$TMP/sites:/etc/nginx/sites:ro" \
  -v "$ROOT/nginx/static:/srv/static:ro" \
  -v "$TMP/well-known:/srv/well-known:ro" \
  -v "$TMP/letsencrypt:/etc/letsencrypt:ro" \
  -v "$TMP/secrets:/etc/nginx/secrets:ro" \
  "$IMAGE" nginx -t

echo "[nginx-test] 2/2 edge VM LiveKit (stream SNI + wss)…"
docker run --rm "${HOSTS[@]}" \
  -v "$ROOT/livekit/edge/nginx.conf:/etc/nginx/nginx.conf:ro" \
  -v "$TMP/edge:/etc/nginx/rendered:ro" \
  -v "$TMP/letsencrypt:/etc/letsencrypt:ro" \
  "$IMAGE" nginx -t

echo "[nginx-test] ✅ cả hai cấu hình hợp lệ"
