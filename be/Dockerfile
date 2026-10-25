# ─── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# OpenSSL cho `prisma generate` (xem ghi chú ở stage production)
RUN apk add --no-cache openssl

# Copy package files first → Docker cache layer cho npm ci
COPY package*.json ./
# `prepare: husky` (git hooks) vô nghĩa trong image và làm `npm ci` fail (exit 127)
# ở stage production vì husky là devDependency → gỡ script `prepare` khỏi bản sao trong image.
RUN npm pkg delete scripts.prepare && npm ci

# Copy Prisma schema → generate client (separate cache layer)
COPY prisma/ ./prisma/
RUN npx prisma generate

# Copy source → build TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ─── Production stage ────────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Security: non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Prisma trên Alpine BẮT BUỘC có OpenSSL: image node:*-alpine không kèm sẵn → Prisma
# "failed to detect the libssl/openssl version", rơi về engine openssl-1.1.x
# (`libssl.so.1.1: No such file`) → mọi truy vấn DB và `db push` đều lỗi. Phải cài TRƯỚC
# `npm ci` để postinstall của @prisma/engines tải đúng engine `linux-musl-openssl-3.0.x`.
RUN apk add --no-cache openssl

# Install production dependencies only (gỡ `prepare` — xem ghi chú ở stage builder)
COPY package*.json ./
RUN npm pkg delete scripts.prepare && npm ci --omit=dev && npm cache clean --force

# Copy Prisma + generate production client
COPY prisma/ ./prisma/
RUN npx prisma generate

# Copy compiled code (dist/server.js VÀ dist/worker.js — cùng 1 image, chọn
# tiến trình qua CMD/`command:` trong compose, không cần build image riêng)
COPY --from=builder /app/dist ./dist

# Font TTF nhúng vào PDF báo cáo đóng góp (p4-06, `assets/fonts/PlusJakartaSans-*.ttf`, giấy phép OFL) — đọc lúc chạy, không nằm trong `dist`.
COPY assets/ ./assets/

# Create directories with correct permissions
RUN mkdir -p logs uploads && chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

# Health check — chỉ có ý nghĩa cho tiến trình api (worker không mở HTTP port,
# override/tắt HEALTHCHECK ở service `worker` trong docker-compose.yml).
# Đọc `PORT` (Railway/PaaS tự cấp cổng) thay vì cứng 3000. Railway KHÔNG dùng
# HEALTHCHECK của Dockerfile — healthcheck path cấu hình trong settings của
# service trên Railway dashboard (repo không dùng railway.json, xem be/docs/railway-deploy.md).
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/api/health', (r) => { const b=[]; r.on('data', b.push.bind(b)); r.on('end', () => process.exit(r.statusCode===200 ? 0 : 1)); }).on('error', () => process.exit(1));"

# `db push` KHÔNG chạy ở đây nữa (nhiều replica cùng start → đua ghi schema).
# Chạy 1 lần ở bước deploy: `npm run db:push:prod`, cấu hình làm pre-deploy command
# trong settings của service `api` trên Railway dashboard (xem be/docs/railway-deploy.md).
#
# Chọn tiến trình theo PROCESS_ROLE để cùng 1 image chạy được cả 2 service mà không
# cần `startCommand` riêng: `worker` → dist/worker.js, còn lại (api|all|trống) →
# dist/server.js. `exec` để node thành PID 1 → nhận SIGTERM trực tiếp (graceful
# shutdown: đóng HTTP, đợi job BullMQ đang chạy, ngắt Redis/DB).
CMD ["sh", "-c", "if [ \"$PROCESS_ROLE\" = \"worker\" ]; then exec node dist/worker.js; else exec node dist/server.js; fi"]
