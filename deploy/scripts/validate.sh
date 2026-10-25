#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Kiểm tĩnh TOÀN BỘ hạ tầng deploy/ (p0-11) — chạy ở CI (.github/workflows/deploy-validate.yml) và trước khi mở PR sửa deploy/.
#   bash deploy/scripts/validate.sh            # đầy đủ (cần Docker): compose config + nginx -t + promtool + amtool
#   SKIP_DOCKER=1 bash deploy/scripts/validate.sh   # chỉ kiểm cú pháp không cần Docker (bash -n, node --check, JSON dashboard, render)
# KHÔNG khởi động dịch vụ nào, KHÔNG gọi mạng (docker chỉ chạy `config`/`check`/`nginx -t`).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKIP_DOCKER="${SKIP_DOCKER:-0}"
PROM_IMAGE="${PROM_IMAGE:-prom/prometheus:v3.5.0}"
AM_IMAGE="${AM_IMAGE:-prom/alertmanager:v0.28.1}"
TMP="$(mktemp -d)"
CREATED=()
trap 'rm -rf "$TMP"; for f in "${CREATED[@]:-}"; do [ -n "$f" ] && rm -rf "$f"; done' EXIT

step() { echo; echo "── $* ─────────────────────────────────────────"; }
ok() { echo "   ✓ $*"; }
die() { echo "❌ $*" >&2; exit 1; }

# Tạo file tạm nếu chưa có (compose đòi env_file tồn tại) — dọn khi thoát.
ensure_file() { [ -e "$1" ] || { : >"$1"; CREATED+=("$1"); }; }

step "Cú pháp shell + Node"
while IFS= read -r -d '' f; do bash -n "$f" && ok "bash -n $(basename "$f")"; done < <(find "$ROOT/scripts" -name '*.sh' -print0)
node --check "$ROOT/scripts/smoke.mjs" && ok "node --check smoke.mjs"
if command -v shellcheck >/dev/null 2>&1; then
  shellcheck -S warning "$ROOT"/scripts/*.sh && ok "shellcheck"
else
  echo "   (bỏ qua shellcheck — chưa cài)"
fi

step "Dashboard Grafana + provisioning (JSON/YAML hợp lệ, có uid/title)"
node - "$ROOT" <<'NODE'
const fs = require('fs');
const path = require('path');
const root = process.argv[2];
const dir = path.join(root, 'observability/grafana/dashboards');
let bad = 0;
const uids = new Set();
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (!d.uid || !d.title || !Array.isArray(d.panels)) throw new Error('thiếu uid/title/panels');
    if (uids.has(d.uid)) throw new Error(`uid trùng: ${d.uid}`);
    uids.add(d.uid);
    console.log(`   ✓ ${f} (${d.panels.length} panel)`);
  } catch (e) {
    bad++;
    console.error(`   ✗ ${f}: ${e.message}`);
  }
}
process.exit(bad ? 1 : 0);
NODE

step "Render template (envsubst) với giá trị mẫu"
export RENDER_SKIP_ENV_FILE=1
export APPLE_TEAM_ID=ABCDE12345
export ANDROID_SHA256_FINGERPRINTS="AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA"
export LIVEKIT_API_KEY=APIvalidate LIVEKIT_API_SECRET=0123456789abcdef0123456789abcdef LK_REDIS_PORT=6380 LK_REDIS_PASSWORD=0123456789abcdef0123456789abcdef
export TURN_DOMAIN=turn.example.test API_DOMAIN=api.example.test
export METRICS_TOKEN=0123456789abcdef0123456789abcdef ALERT_EMAIL_TO=ops@example.test ALERT_SMTP_HOST=smtp.example.test:587 ALERT_SMTP_FROM=alerts@example.test
export ALERT_SMTP_USER=alerts ALERT_SMTP_PASSWORD=x ALERT_TELEGRAM_CHAT_ID=-1001234567890 ALERT_TELEGRAM_BOT_TOKEN=123456:validate
RENDERED=("$ROOT/compose/rendered" "$ROOT/livekit/rendered" "$ROOT/observability/rendered" "$ROOT/observability/secrets")
for d in "${RENDERED[@]}"; do [ -e "$d" ] || CREATED+=("$d"); done
bash "$ROOT/scripts/render-config.sh" compose >/dev/null && ok "compose (well-known)"
node -e "JSON.parse(require('fs').readFileSync('$ROOT/compose/rendered/well-known/apple-app-site-association','utf8')); JSON.parse(require('fs').readFileSync('$ROOT/compose/rendered/well-known/assetlinks.json','utf8'))" && ok "AASA/assetlinks là JSON hợp lệ"
bash "$ROOT/scripts/render-config.sh" livekit >/dev/null && ok "livekit.yaml + egress.yaml"
bash "$ROOT/scripts/render-config.sh" observability >/dev/null && ok "alertmanager.yml"

if [ "$SKIP_DOCKER" = "1" ]; then
  echo; echo "✅ (SKIP_DOCKER=1) kiểm không-Docker đạt — bỏ qua compose config / nginx -t / promtool / amtool"
  exit 0
fi
command -v docker >/dev/null 2>&1 || die "cần docker (hoặc đặt SKIP_DOCKER=1)"

step "docker compose config (đủ biến, cú pháp, anchor/merge)"
ensure_file "$ROOT/compose/.env.api"; ensure_file "$ROOT/compose/.env.collab"; ensure_file "$ROOT/livekit/.env"
# Biến bắt buộc lấy từ giá trị mẫu — chỉ để `config` nội suy được.
export ENV_NAME=staging REGISTRY=ghcr.io/example BE_TAG=validate ADMIN_TAG=validate COLLAB_TAG=validate REDIS_PASSWORD=validate
export API_DOMAIN=api.example.test ADMIN_DOMAIN=admin.example.test LK_DOMAIN=lk.example.test
export LIVEKIT_TAG=v0.0.0 EGRESS_TAG=v0.0.0
docker compose -f "$ROOT/compose/docker-compose.yml" config -q && ok "compose production"
COMPOSE_PROFILES=collab docker compose -f "$ROOT/compose/docker-compose.yml" config -q && ok "compose production + profile collab"
docker compose -f "$ROOT/compose/docker-compose.yml" -f "$ROOT/compose/docker-compose.staging.override.yml" config -q && ok "compose staging (+ include livekit)"
printf 'LIVEKIT_TAG=v0.0.0\nEGRESS_TAG=v0.0.0\nLK_REDIS_PASSWORD=validate\nLK_DOMAIN=lk.example.test\nTURN_DOMAIN=turn.example.test\n' >"$TMP/livekit.env"
COMPOSE_PROFILES=edge docker compose -f "$ROOT/livekit/docker-compose.livekit.yml" --env-file "$TMP/livekit.env" config -q && ok "compose livekit (+ edge)"
printf 'ENV_NAME=staging\nGRAFANA_ADMIN_PASSWORD=validate\nGRAFANA_ROOT_URL=https://grafana.example.test\n' >"$TMP/obs.env"
docker compose -f "$ROOT/observability/docker-compose.observability.yml" --env-file "$TMP/obs.env" config -q && ok "compose observability"

step "nginx -t"
bash "$ROOT/scripts/nginx-test.sh"

step "Prometheus: check config + rules"
mkdir -p "$TMP/prom-secrets"
: >"$TMP/prom-secrets/metrics_token"
cp "$ROOT/observability/targets/"*.example.yml "$TMP/" 2>/dev/null || true
docker run --rm --entrypoint promtool \
  -v "$ROOT/observability/prometheus.yml:/etc/prometheus/prometheus.yml:ro" \
  -v "$ROOT/observability/alerts.yml:/etc/prometheus/alerts.yml:ro" \
  -v "$TMP/prom-secrets:/etc/prometheus/secrets:ro" \
  "$PROM_IMAGE" check config /etc/prometheus/prometheus.yml && ok "promtool check config"
docker run --rm --entrypoint promtool -v "$ROOT/observability/alerts.yml:/alerts.yml:ro" "$PROM_IMAGE" check rules /alerts.yml && ok "promtool check rules"

step "Alertmanager: check-config"
mkdir -p "$TMP/am-secrets"
cp "$ROOT/observability/secrets/"* "$TMP/am-secrets/"
docker run --rm --entrypoint amtool \
  -v "$ROOT/observability/rendered/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro" \
  -v "$TMP/am-secrets:/etc/alertmanager/secrets:ro" \
  "$AM_IMAGE" check-config /etc/alertmanager/alertmanager.yml && ok "amtool check-config"

echo; echo "✅ deploy/ hợp lệ"
