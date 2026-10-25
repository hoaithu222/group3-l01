# ─────────────────────────────────────────────────────────────────────────────
# Ảnh admin SPA (p0-11): nginx:alpine + `admin/dist` ĐÃ BUILD (deploy.yml build trên runner với VITE_* của môi trường + upload source map Sentry rồi xoá `.map`).
# Context = GỐC repo:   docker build -f deploy/admin/Dockerfile -t <registry>/superapp-admin:<tag> .
# (`Dockerfile.dockerignore` cạnh file này chỉ cho phép `admin/dist` và `deploy/admin` vào context.)
# VITE_* nướng vào bundle lúc build ⇒ ảnh RIÊNG theo môi trường (staging-<sha> / prod-<vX.Y.Z>), không thăng cấp staging → production bằng cùng ảnh.
# ─────────────────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine

COPY deploy/admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY admin/dist /usr/share/nginx/html

# source map KHÔNG BAO GIỜ nằm trong ảnh công khai (lộ mã nguồn gốc): build hỏng nếu còn file .map. (deploy.yml còn chạy admin/scripts/check-dist-no-maps.mjs
# kiểm cả chú thích sourceMappingURL ở CUỐI bundle — không grep cả file ở đây vì thư viện có thể chứa chuỗi đó trong mã.)
RUN ! find /usr/share/nginx/html -name '*.map' | grep -q .

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1/healthz || exit 1
