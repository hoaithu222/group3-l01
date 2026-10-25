#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Sinh cấu hình từ TEMPLATE bằng envsubst (p0-11) — chỉ thay các biến khai báo, KHÔNG đụng `$` nào khác.
#   bash render-config.sh compose         → deploy/compose/rendered/well-known/{apple-app-site-association,assetlinks.json}
#   bash render-config.sh livekit         → deploy/livekit/rendered/{livekit.yaml,egress.yaml}          (chmod 600 — chứa khoá)
#   bash render-config.sh observability   → deploy/observability/rendered/alertmanager.yml + secrets/*   (chmod 600)
#   bash render-config.sh all
# Biến đọc từ deploy/<thư-mục>/.env (không commit). CI/validate đặt sẵn biến trong môi trường và RENDER_SKIP_ENV_FILE=1.
# Không bao giờ in giá trị biến; lỗi chỉ nêu TÊN biến thiếu.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

die() { echo "[render] ❌ $*" >&2; exit 1; }

need() {
  local v
  for v in "$@"; do
    [ -n "${!v:-}" ] || die "thiếu biến $v"
  done
}

load_env() {
  local file="$1"
  if [ "${RENDER_SKIP_ENV_FILE:-0}" = "1" ]; then return 0; fi
  [ -f "$file" ] || die "thiếu $file (chép từ .env.example rồi điền)"
  set -a
  # shellcheck disable=SC1090
  . "$file"
  set +a
}

require_envsubst() { command -v envsubst >/dev/null 2>&1 || die "cần envsubst (apt-get install gettext-base)"; }

render_compose() {
  load_env "$ROOT/compose/.env"
  need APPLE_TEAM_ID ANDROID_SHA256_FINGERPRINTS
  [[ "$APPLE_TEAM_ID" =~ ^[A-Z0-9]{10}$ ]] || die "APPLE_TEAM_ID phải là 10 ký tự chữ HOA/số"

  # "AA:BB:…,CC:DD:…" → "AA:BB:…","CC:DD:…"  (mỗi dấu vân tay = 32 byte hex phân tách dấu hai chấm)
  local fp json="" sep=""
  IFS=',' read -r -a fps <<<"$ANDROID_SHA256_FINGERPRINTS"
  for fp in "${fps[@]}"; do
    fp="${fp// /}"
    [[ "$fp" =~ ^([0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2}$ ]] || die "ANDROID_SHA256_FINGERPRINTS: dấu vân tay không đúng dạng AA:BB:…(32 byte)"
    json+="${sep}\"${fp^^}\""
    sep=", "
  done
  export ANDROID_SHA256_FINGERPRINTS_JSON="$json"

  local out="$ROOT/compose/rendered/well-known"
  mkdir -p "$out"
  envsubst '${APPLE_TEAM_ID}' <"$ROOT/nginx/well-known/apple-app-site-association.template" >"$out/apple-app-site-association"
  envsubst '${ANDROID_SHA256_FINGERPRINTS_JSON}' <"$ROOT/nginx/well-known/assetlinks.json.template" >"$out/assetlinks.json"
  chmod 644 "$out"/*
  echo "[render] compose OK → $out"
}

render_livekit() {
  load_env "$ROOT/livekit/.env"
  need LIVEKIT_API_KEY LIVEKIT_API_SECRET LK_REDIS_PORT LK_REDIS_PASSWORD TURN_DOMAIN API_DOMAIN
  # Bí mật đi vào YAML: chỉ cho phép ký tự an toàn (tránh phá cú pháp YAML). Tạo bằng: openssl rand -hex 24
  local v
  for v in LIVEKIT_API_SECRET LK_REDIS_PASSWORD; do
    [[ "${!v}" =~ ^[A-Za-z0-9_.-]{16,}$ ]] || die "$v phải ≥ 16 ký tự [A-Za-z0-9_.-] (dùng: openssl rand -hex 24)"
  done
  export EGRESS_S3_ACCESS_KEY_ID="${EGRESS_S3_ACCESS_KEY_ID:-}" EGRESS_S3_SECRET_ACCESS_KEY="${EGRESS_S3_SECRET_ACCESS_KEY:-}"
  export EGRESS_S3_REGION="${EGRESS_S3_REGION:-}" EGRESS_S3_BUCKET="${EGRESS_S3_BUCKET:-}"

  local out="$ROOT/livekit/rendered"
  mkdir -p "$out"
  umask 077
  envsubst '${LIVEKIT_API_KEY} ${LIVEKIT_API_SECRET} ${LK_REDIS_PORT} ${LK_REDIS_PASSWORD} ${TURN_DOMAIN} ${API_DOMAIN}' <"$ROOT/livekit/livekit.yaml" >"$out/livekit.yaml"
  envsubst '${LIVEKIT_API_KEY} ${LIVEKIT_API_SECRET} ${LK_REDIS_PORT} ${LK_REDIS_PASSWORD} ${EGRESS_S3_ACCESS_KEY_ID} ${EGRESS_S3_SECRET_ACCESS_KEY} ${EGRESS_S3_REGION} ${EGRESS_S3_BUCKET}' <"$ROOT/livekit/egress.yaml" >"$out/egress.yaml"
  chmod 600 "$out"/*.yaml
  echo "[render] livekit OK → $out (chmod 600)"
}

render_observability() {
  load_env "$ROOT/observability/.env"
  need METRICS_TOKEN ALERT_EMAIL_TO ALERT_SMTP_HOST ALERT_SMTP_FROM ALERT_TELEGRAM_CHAT_ID ALERT_TELEGRAM_BOT_TOKEN ALERT_SMTP_USER ALERT_SMTP_PASSWORD
  [[ "$ALERT_TELEGRAM_CHAT_ID" =~ ^-?[0-9]+$ ]] || die "ALERT_TELEGRAM_CHAT_ID phải là số (chat/nhóm Telegram)"

  local out="$ROOT/observability/rendered" sec="$ROOT/observability/secrets"
  mkdir -p "$out" "$sec"
  umask 077
  # Bí mật đọc qua *_file — không nhúng vào YAML.
  printf '%s' "$METRICS_TOKEN" >"$sec/metrics_token"
  printf '%s' "$ALERT_TELEGRAM_BOT_TOKEN" >"$sec/telegram_bot_token"
  printf '%s' "$ALERT_SMTP_PASSWORD" >"$sec/smtp_password"
  envsubst '${ALERT_EMAIL_TO} ${ALERT_SMTP_HOST} ${ALERT_SMTP_FROM} ${ALERT_SMTP_USER} ${ALERT_TELEGRAM_CHAT_ID}' <"$ROOT/observability/alertmanager.yml" >"$out/alertmanager.yml"
  chmod 600 "$sec"/* "$out"/*
  echo "[render] observability OK → $out + $sec (chmod 600)"
}

require_envsubst
case "${1:-}" in
  compose) render_compose ;;
  livekit) render_livekit ;;
  observability) render_observability ;;
  all) render_compose; render_livekit; render_observability ;;
  *) die "dùng: render-config.sh compose|livekit|observability|all" ;;
esac
