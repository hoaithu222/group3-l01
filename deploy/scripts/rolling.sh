#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Deploy cuốn chiếu trên VM app (p0-11 §3 / OPS-10, OPS-13): tạo lại TỪNG replica api, đợi healthy, reload nginx rồi mới sang replica kế → luôn còn ≥ 1 replica phục vụ;
# socket của replica đang tắt được drain (server.ts) và client tự nối lại sang replica kia. Sau cùng worker + admin (+ collab nếu bật) và nginx.
# Chạy trong deploy/compose (tag mới đã đặt trong .env: BE_TAG, ADMIN_TAG…):
#   bash ../scripts/rolling.sh                  # production
#   STAGING=1 bash ../scripts/rolling.sh        # staging (thêm override)
# Rollback = đặt lại tag CŨ trong .env rồi chạy lại script này (mục tiêu ≤ 5 phút — runbook deploy-rollback.md).
# Biến tuỳ chọn: HEALTH_TIMEOUT (giây, mặc định 120) · ALERTMANAGER_URL (mặc định http://127.0.0.1:9093, bỏ qua nếu không có) · SKIP_PULL=1.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../compose"
[ -f .env ] || { echo "[rolling] thiếu deploy/compose/.env" >&2; exit 1; }

COMPOSE=(docker compose)
[ "${STAGING:-0}" = "1" ] && COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.staging.override.yml)
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"
ALERTMANAGER_URL="${ALERTMANAGER_URL:-http://127.0.0.1:9093}"

log() { echo "[rolling] $*"; }

wait_healthy() {
  local svc="$1" id status waited=0
  while [ "$waited" -lt "$HEALTH_TIMEOUT" ]; do
    id="$("${COMPOSE[@]}" ps -q "$svc" 2>/dev/null | head -n1 || true)"
    if [ -n "$id" ]; then
      status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || echo unknown)"
      if [ "$status" = "healthy" ] || [ "$status" = "running" ]; then return 0; fi
    fi
    sleep 3
    waited=$((waited + 3))
  done
  echo "[rolling] ❌ $svc không healthy sau ${HEALTH_TIMEOUT}s — DỪNG (replica còn lại vẫn phục vụ). Xem: ${COMPOSE[*]} logs --tail=100 $svc" >&2
  return 1
}

# Im lặng cảnh báo SocketDrop trong lúc deploy (rolling làm socket rớt hàng loạt có chủ đích) — best-effort, không có Alertmanager thì bỏ qua.
silence_socket_drop() {
  command -v curl >/dev/null 2>&1 || return 0
  local now end
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  end="$(date -u -d '+10 minutes' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || true)"
  [ -n "$end" ] || return 0
  curl -fsS -m 5 -X POST -H 'Content-Type: application/json' "$ALERTMANAGER_URL/api/v2/silences" \
    -d "{\"matchers\":[{\"name\":\"alertname\",\"value\":\"SocketDrop\",\"isRegex\":false}],\"startsAt\":\"$now\",\"endsAt\":\"$end\",\"createdBy\":\"rolling.sh\",\"comment\":\"deploy cuốn chiếu\"}" \
    >/dev/null 2>&1 && log "đã im lặng SocketDrop 10 phút" || true
}

[ "${SKIP_PULL:-0}" = "1" ] || { log "pull ảnh…"; "${COMPOSE[@]}" pull; }
silence_socket_drop

for svc in api-1 api-2; do
  log "cập nhật $svc (drain socket → thay container)…"
  "${COMPOSE[@]}" up -d --no-deps "$svc"
  wait_healthy "$svc"
  # nginx phân giải lại IP upstream (container mới có IP mới) — reload không rớt kết nối đang có.
  "${COMPOSE[@]}" exec -T nginx nginx -s reload || log "⚠️ reload nginx thất bại (nginx chưa chạy? sẽ khởi động ở bước cuối)"
  sleep 2
done

log "cập nhật worker, admin…"
"${COMPOSE[@]}" up -d --no-deps worker admin
wait_healthy worker
# collab chỉ chạy khi profile được bật.
if "${COMPOSE[@]}" ps --services 2>/dev/null | grep -qx collab; then
  "${COMPOSE[@]}" up -d --no-deps collab
  wait_healthy collab
fi

log "nginx (áp cấu hình/ảnh mới nếu đổi)…"
"${COMPOSE[@]}" up -d --no-deps nginx
"${COMPOSE[@]}" exec -T nginx nginx -s reload || true

log "✅ xong. Kiểm: ${COMPOSE[*]} ps  ·  node ../scripts/smoke.mjs (BASE_URL=…)"
