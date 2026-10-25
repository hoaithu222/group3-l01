# Triển khai backend lên Railway

Backend chạy bằng **một image Docker** (`be/Dockerfile`) cho cả hai tiến trình; Railway dựng 2 service từ
cùng mã nguồn, khác nhau ở biến `PROCESS_ROLE`. MongoDB vẫn là **Atlas bên ngoài**.

```
Internet ──▶ api    (PROCESS_ROLE=api: HTTP + Socket.IO)     ──┐
             worker (PROCESS_ROLE=worker: BullMQ + cron + outbox) ├──▶ Redis (add-on Railway, mạng nội bộ)
                                                              └──▶ MongoDB Atlas (ngoài Railway)
```

> Chỉ chạy `api` là **không đủ**: ở production `PROCESS_ROLE` mặc định là `api`, tiến trình này không xử lý
> job → không có outbox, thông báo, push, cron. Phải có service `worker` (hoặc đặt `PROCESS_ROLE=all` cho
> một service duy nhất — rẻ hơn nhưng api và worker chung tài nguyên).

Project hiện tại: `super-app` (environment `production`) có các service `api`, `worker`, `collab` và `Redis`.
`collab` dùng mã trong [`collab/`](../../collab/README.md) ở gốc repo; cách deploy và các lưu ý nằm ở
[`../../docs/deploy-firebase-railway.md`](../../docs/deploy-firebase-railway.md#service-collab).

## Cấu hình build/deploy (lưu trên Railway, không phải file trong repo)

`railway.json`/`railway.toml` (Config as Code) **ngừng được Railway đọc từ 2026-12-01**, nên repo không dùng
chúng. Cài đặt nằm trong settings của từng service (`serviceInstanceUpdate`), giữ nguyên qua mọi lần `railway up`:

| Cài đặt | `api` | `worker` |
| --- | --- | --- |
| Dockerfile | `Dockerfile` (Railway tự nhận Dockerfile ở gốc thư mục upload) | như api |
| Healthcheck | `/api/health`, timeout 120 s | **không có** (worker không mở cổng HTTP) |
| Pre-deploy | `node_modules/.bin/prisma db push --skip-generate`, timeout 300 s | không có (tránh đua ghi schema) |
| Draining (SIGTERM → SIGKILL) | 35 s (server đợi tối đa `WORKER_SHUTDOWN_GRACE_MS` + 5 s) | 35 s |
| Restart | `ON_FAILURE`, tối đa 5 lần | như api |

Nếu sau này muốn quản lý bằng mã: dùng Infrastructure as Code của Railway (`.railway/railway.ts`,
`railway config migrate`) — cần thêm package `railway` vào `be/`, chưa làm.

`Dockerfile`: `CMD` chọn `dist/worker.js` khi `PROCESS_ROLE=worker`, ngược lại `dist/server.js`.

## Biến môi trường

Đặt trên **cả hai** service trừ khi ghi khác. Không commit giá trị thật; mẫu đầy đủ ở `.env.example`.

| Biến | Bắt buộc | Giá trị / ghi chú |
| --- | --- | --- |
| `NODE_ENV` | ✔ | `production` |
| `PROCESS_ROLE` | ✔ | `api` (service api) · `worker` (service worker) |
| `LOG_STDOUT` | ✔ | `true` — Railway chỉ thu log từ stdout; thiếu biến này production **không có log** trên dashboard |
| `DATABASE_URL` | ✔ | Chuỗi kết nối Atlas (Atlas → Network Access phải cho Railway vào, xem "Lưu ý") |
| `REDIS_URL` | ✔ | `${{Redis.REDIS_URL}}` (mạng nội bộ; mật khẩu nằm trong URL, để trống `REDIS_PASSWORD`) |
| `JWT_SECRET` · `JWT_REFRESH_SECRET` | ✔ | ≥ 32 ký tự, **khác** giá trị dev |
| `ENCRYPTION_KEY` | ✔ | 32 byte hex (64 ký tự). Đổi khoá = mất khả năng giải mã dữ liệu đã mã hoá |
| `ALLOWED_ORIGINS` | ✔ (api) | CSV origin **https** của admin/web. Thiếu hoặc có `http://` → api không khởi động |
| `PUBLIC_API_URL` | ✔ | URL công khai của api |
| `FRONTEND_URL` · `PUBLIC_APP_LINK_BASE` | ✔ | Gốc link trong email / lời mời (mặc định `localhost` — link sai nếu quên đặt) |
| `STORAGE_TYPE` | ✔ | `cloudinary` hoặc `s3` — **không** dùng `local` (đĩa container mất khi redeploy, api và worker không chia sẻ được) |
| `CLOUDINARY_*` / `AWS_*` | theo `STORAGE_TYPE` | |
| `QUEUE_PREFIX` | — | Mặc định `superapp`; đặt khác nhau giữa các môi trường dùng chung Redis |
| `FEATURE_FLAGS` | — | `voice`/`meeting` bật ⇒ bắt buộc `LIVEKIT_URL`, `LIVEKIT_PUBLIC_URL` (`wss://`), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, nếu không api thoát ngay lúc khởi động; `pomodoro` cần `voice`; `live-quiz` cần `study` |
| `SMTP_HOST/PORT/USER/PASS/FROM` | — | Code chỉ đọc `SMTP_*` (không đọc `EMAIL_USER`/`EMAIL_PASS`). Thiếu ⇒ mail chạy no-op |
| `FIREBASE_*`, `APNS_*` | — | Push được gửi từ **worker** ⇒ đặt trên worker |
| `METRICS_TOKEN` | — | Bảo vệ `/metrics`; trống = chỉ localhost |
| `COLLAB_URL` · `COLLAB_INTERNAL_URL` · `COLLAB_SHARED_SECRET` | ✔ khi bật cờ `collab` | URL WebSocket công khai (`wss://`), URL gọi nội bộ tới service `collab`, bí mật dùng chung. Bí mật phải **trùng** trên `api`, `worker` và `collab`; lệch thì mọi token collab bị từ chối (app báo "Mất phiên vẽ") |

Không cần khai `PORT` (Railway tự cấp; app đọc `PORT`).

⚠️ Container chỉ đọc biến lúc khởi động. Sau khi đổi biến, phải tạo **deployment mới** (Deploy staged changes,
`railway deployment redeploy --service <tên>` hoặc `railway up`); Restart vẫn dùng biến cũ. Đổi biến dùng
chung như `COLLAB_SHARED_SECRET` thì phải deploy lại mọi service dùng nó.

## Trình tự triển khai (CLI, chạy trong `be/`)

```bash
railway init --name super-app
railway add --database redis                                   # service "Redis"
railway add --service api    --variables "PROCESS_ROLE=api"
railway add --service worker --variables "PROCESS_ROLE=worker"
railway variable set KEY=VALUE ... --service api --skip-deploys   # theo bảng biến; lặp lại cho worker
railway domain --service api                                    # domain công khai → PUBLIC_API_URL, ALLOWED_ORIGINS
railway up --service api --ci                                   # pre-deploy chạy db push, rồi healthcheck
railway up --service worker --ci
```

`railway up` gửi cả thư mục `be/` (theo `.gitignore`, nên `.env`, `node_modules`, `dist` không lên Railway).

## Kiểm tra sau deploy

1. `curl https://<api>/api/health` → HTTP 200, `services.redis/db = ok`; khi bật cờ `collab` thì cần
   `services.collab = ok`. Trạng thái `degraded` nghĩa là collab không phản hồi hoặc từ chối `COLLAB_SHARED_SECRET` của api.
2. Log service api có `Server đang chạy tại port …`; log worker có `[worker] Đã khởi động … worker`.
3. Redis: Railway chạy `redis-server` mặc định (`noeviction`, đúng yêu cầu BullMQ) và snapshot RDB `--save 60 1`.
4. Đăng nhập thử từ app/admin; `ALLOWED_ORIGINS` phải khớp origin thật (CORS + CSRF cookie refresh).
5. Rate limit theo IP: `trust proxy = 1` (`app.ts`) — kiểm tra `req.ip` là IP client thật, không phải IP proxy Railway.

## Lưu ý

- **Đang dùng chung một Atlas (`mydb`) giữa dev local và production.** Redis thì tách riêng, nên mỗi bên có
  hàng đợi BullMQ riêng nhưng cùng đọc/ghi collection `OutboxEvent`. Khi chạy `npm run dev` ở máy cá nhân
  (`PROCESS_ROLE=all` mặc định) trong lúc worker Railway đang chạy: hai relay tranh nhau hàng outbox (job của
  prod có thể bị xử lý bằng máy dev và ngược lại) và cron chạy hai lần (thông báo/nhắc trùng). Khi dev chạy
  cùng DB với prod, đặt `PROCESS_ROLE=api` trong `.env` local (hoặc tách DB dev khỏi prod).
  Mỗi lần deploy api, `db push` cũng chạy lên DB dùng chung này.
- **`ENCRYPTION_KEY` production khác khoá dev** (dev dùng mặc định toàn số 0). Lúc chốt (26/09/2026) DB chưa có
  bản ghi mã hoá (`UserPaymentProfile`, `Integration` = 0) nên không ảnh hưởng; nếu sau này có dữ liệu mã hoá
  bằng khoá dev thì prod không giải mã được.
- **Atlas → Network Access**: Railway không có IP outbound cố định trên gói thường ⇒ cần `0.0.0.0/0` (hoặc bật
  Static Outbound IPs của Railway rồi allow-list). Sai chỗ này thì pre-deploy fail và deploy dừng.
- **Region**: service mặc định ở `us-west` (sfo). Đặt api/worker/Redis cùng region với cluster Atlas
  (`railway service scale --service <tên> southeast-asia=1`) — mỗi request đi qua Redis nhiều lần, lệch lục địa sẽ chậm.
- **Pre-deploy `db push`** chạy ở container riêng trước mỗi lần deploy api; đổi phá huỷ dữ liệu bị Prisma từ chối
  (không có `--accept-data-loss`) ⇒ deploy dừng an toàn.
- **SMTP**: Railway chặn cổng SMTP outbound trên gói Free/Trial/Hobby (chỉ Pro trở lên). Gói thấp hơn ⇒ cần nhà
  cung cấp gửi mail qua HTTPS API.
- **Nhiều replica api**: Socket.IO dùng Redis adapter nhưng transport có `polling` ⇒ cần sticky session nếu scale
  > 1 replica; giữ 1 replica cho tới khi xử lý.
- **Node 20** đã hết hỗ trợ (04/2026) nhưng CI đang chạy Node 20 — nâng Node cần đổi cả CI và Dockerfile.
- Log production ghi qua stdout (`LOG_STDOUT=true`), không tạo `logs/*.log`; `docker-compose.yml` giữ nguyên hành vi file.

## Đã kiểm chứng (26/09/2026)

- Cục bộ: build image từ `Dockerfile`; chạy `NODE_ENV=production` trên Mongo replica set + Redis dựng tạm —
  `prisma db push` trong image · api `/api/health` = 200 (Redis, DB, queue ok) · worker khởi động 8 worker,
  46 cron scheduler, outbox relay · SIGTERM → tắt sạch, exit 0 · thiếu biến bắt buộc → báo lỗi rõ ràng.
- Trên Railway (dùng chung Atlas với dev): pre-deploy `db push` xong (~58 s; tạo thêm các index còn thiếu như
  `PrintShop`/`PrintOrder`), api qua healthcheck, `GET https://api-production-9c319.up.railway.app/api/health`
  = 200 (redis, db, queue ok), worker khởi động 8 worker + 46 cron + outbox relay.
- Chưa kiểm chứng: đăng nhập/CORS từ app/admin thật, LiveKit, SMTP, push.
