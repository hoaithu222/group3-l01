# collab/ — dịch vụ cộng tác thời gian thực (Hocuspocus + Yjs). Cùng image nền Node như `be/` (node:20-alpine).
# Build context = thư mục `collab/`. Thư mục `editor-web/` (bundle Vite cho WebView của app) KHÔNG nằm trong image (xem .dockerignore).

# ─── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files trước → tận dụng cache layer cho `npm ci`
COPY package*.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src/ ./src/
RUN npm run build

# ─── Production stage ────────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Security: non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

RUN chown -R nodejs:nodejs /app
USER nodejs

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

# `/health` trả 200 khi hoạt động, 503 khi đang dừng. Đọc PORT thay vì cứng 4000.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:' + (process.env.PORT || 4000) + '/health', (r) => { r.resume(); r.on('end', () => process.exit(r.statusCode === 200 ? 0 : 1)); }).on('error', () => process.exit(1));"

# `exec node` (không qua shell) → node là PID 1, nhận SIGTERM trực tiếp: dừng êm (lưu nốt state còn treo, đóng kết nối) trong SHUTDOWN_GRACE_MS.
# Đặt `stop_grace_period` (compose) ≥ SHUTDOWN_GRACE_MS + 5 s.
CMD ["node", "dist/main.js"]
