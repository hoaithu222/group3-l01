/**
 * Jest globalSetup — chạy 1 lần trước toàn bộ test suite (không phải trước
 * mỗi file). Khi `TEST_DB=memory` (mặc định CI — xem `.github/workflows/ci.yml`),
 * khởi `MongoMemoryReplSet` (Prisma+MongoDB cần replica set cho `$transaction`)
 * và ghi đè `DATABASE_URL` để các test kết nối MongoDB thật trong bộ nhớ thay
 * vì Atlas — cho phép test transaction/index mà không đụng dữ liệu thật.
 *
 * ── ⛔ Chốt an toàn: KHÔNG có `TEST_DB=memory` ⇒ KHÔNG được chạm DB thật ──────
 * Trước đây "không set `TEST_DB`" hiểu là "giữ nguyên `DATABASE_URL` trong `.env`" — tức cụm MongoDB Atlas THẬT. Một lệnh
 * `npx jest --selectProjects unit <đường dẫn>` (`--selectProjects` nuốt các đường dẫn đứng sau làm tên project) chạy nguyên
 * project `unit` trên Atlas, mà có suite gọi `deleteMany({})` không điều kiện (`users/tests/anonymizer.test.ts`) — có thể đã
 * xoá sạch User/Session/DeviceToken/NotificationPreference/UserPaymentProfile/OutboxEvent của DB dev (2026-09-25).
 *
 * Nay: thiếu `TEST_DB=memory` thì `DATABASE_URL` bị ĐỔI sang một địa chỉ loopback không có dịch vụ nào lắng nghe. Test dùng
 * repo in-memory/mock không bị ảnh hưởng; test lỡ chạm DB thật sẽ lỗi kết nối sau ~1 giây thay vì đọc/ghi/xoá dữ liệu thật.
 * Cố ý muốn chạy test trên DB thật (hiếm, và chỉ với DB dùng riêng cho test) thì đặt `ALLOW_REAL_DB_TESTS=1` — đó là quyết
 * định có ý thức, không phải mặc định.
 *
 * `process.env` đặt ở đây được các worker kế thừa, và Prisma KHÔNG ghi đè biến đã có bằng `.env` — nên chốt có hiệu lực.
 */
import { MongoMemoryReplSet } from "mongodb-memory-server";

declare global {
  // eslint-disable-next-line no-var
  var __MONGO_REPLSET__: MongoMemoryReplSet | undefined;
}

/** Địa chỉ không có dịch vụ nào lắng nghe (cổng 1, loopback) — mọi truy vấn lỗi nhanh nhờ `serverSelectionTimeoutMS`. */
export const BLOCKED_DATABASE_URL =
  "mongodb://127.0.0.1:1/superapp_test_blocked?directConnection=true&serverSelectionTimeoutMS=1000&connectTimeoutMS=1000";

/** Chặn test chạm DB thật khi không dùng Mongo memory. Xuất ra để có test khoá hành vi. */
export function guardAgainstRealDatabase(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.TEST_DB === "memory" || env.ALLOW_REAL_DB_TESTS === "1") return false;
  env.DATABASE_URL = BLOCKED_DATABASE_URL;
  return true;
}

/**
 * ── Chốt môi trường: test KHÔNG phụ thuộc `be/.env` của người dùng ─────────────────────────────────────────────────────────────
 * Cơ chế nạp (đã kiểm chứng 2026-09-26): jest KHÔNG tự đọc `.env`, nhưng ngay khi một test khởi tạo `PrismaClient` (import
 * `@infrastructure/database`) Prisma tự nạp `be/.env` (`schemaEnvPath`) vào `process.env` của test đó — KHÔNG ghi đè biến đã có, kể cả
 * chuỗi rỗng. `@core/config` (`env`) parse `process.env` lúc import nên kết quả phụ thuộc THỨ TỰ import trong từng file: máy dev có `.env`
 * bật `FEATURE_FLAGS`/`LIVEKIT_*` thì test giả định "mọi cờ tắt / thiếu LiveKit" đỏ ngẫu nhiên, CI (không có `.env`) thì xanh.
 *
 * Nên `globalSetup` đặt trước các biến "bật dịch vụ ngoài/cờ tính năng" về CHUỖI RỖNG (không xoá: xoá thì Prisma nạp lại từ `.env`).
 * Chuỗi rỗng ≡ chưa đặt ở mọi nơi đọc chúng (`z.string().optional()`/`preprocess "" → undefined`, `Boolean("")`). Đây cũng chặn test lỡ
 * dùng khoá thật (FCM, SMTP, Cloudinary/S3...). Test cần một cờ/dịch vụ tự đặt lại trong file của mình (mẫu `validate-runtime.test.ts`).
 *
 * ⚠ CHỈ liệt kê khoá mà schema chấp nhận "" — KHÔNG thêm khoá `.url()`/`enum`/`coerce.number` (`AWS_S3_ENDPOINT`, `PORT`, ...): "" làm
 * `loadEnv()` ném lỗi và sập cả file test.
 */
export const DEV_ONLY_ENV_KEYS = [
  // cờ phân hệ
  "FEATURE_FLAGS",
  // media (LiveKit + egress)
  "LIVEKIT_URL", "LIVEKIT_PUBLIC_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET",
  "EGRESS_S3_BUCKET", "EGRESS_S3_REGION", "EGRESS_S3_ACCESS_KEY_ID", "EGRESS_S3_SECRET_ACCESS_KEY",
  "TURN_PROBE_HOST",
  // push (FCM/APNs), báo lỗi, thư
  "FIREBASE_CREDENTIALS_JSON", "FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY",
  "APNS_KEY_ID", "APNS_TEAM_ID", "APNS_KEY_P8", "APNS_KEY_PATH",
  "SENTRY_DSN",
  "SMTP_HOST", "SMTP_USER", "SMTP_PASS",
  // kho tệp ngoài
  "AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_S3_BUCKET",
  "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET",
  // tích hợp bên thứ ba + collab
  "GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_SLUG", "GITHUB_APP_CLIENT_ID", "GITHUB_APP_CLIENT_SECRET", "GITHUB_WEBHOOK_SECRET",
  "GITLAB_CLIENT_ID", "GITLAB_CLIENT_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "FIGMA_CLIENT_ID", "FIGMA_CLIENT_SECRET",
  "COLLAB_URL", "COLLAB_INTERNAL_URL", "COLLAB_SHARED_SECRET",
] as const;

/** Đưa môi trường test về trạng thái "sạch" như CI (không `.env`). Trả số khoá đã được trung hoà (để test khoá hành vi). */
export function neutralizeDeveloperEnv(env: NodeJS.ProcessEnv = process.env): number {
  let changed = 0;
  for (const key of DEV_ONLY_ENV_KEYS) {
    if (env[key] !== "") changed++;
    env[key] = "";
  }
  // Kho tệp luôn là thư mục cục bộ trong test (không bao giờ Cloudinary/S3 thật, dù `.env` dev chọn gì).
  env.STORAGE_TYPE = "local";
  return changed;
}

export default async function globalSetup(): Promise<void> {
  neutralizeDeveloperEnv();

  if (process.env.TEST_DB !== "memory") {
    if (guardAgainstRealDatabase()) {
      // eslint-disable-next-line no-console
      console.warn(
        "[jest] TEST_DB=memory chưa được đặt ⇒ DATABASE_URL đã bị chặn (không chạm DB thật). " +
          "Dùng `TEST_DB=memory` để chạy test có DB; `ALLOW_REAL_DB_TESTS=1` chỉ khi CỐ Ý dùng DB riêng cho test."
      );
    }
    return;
  }

  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  await replSet.waitUntilRunning();

  process.env.DATABASE_URL = replSet.getUri("superapp_test");
  global.__MONGO_REPLSET__ = replSet;
  await ensureTestIndexes(process.env.DATABASE_URL);
}

/**
 * (p6-05) Index Prisma không khai được (`2dsphere` cho `$geoNear` — IR-07) tạo trên Mongo TRONG BỘ NHỚ vừa khởi (không bao giờ
 * chạy khi thiếu `TEST_DB=memory`). Lỗi chỉ cảnh báo: test cần index tự gọi lại `ensureManualIndexes` (idempotent).
 */
async function ensureTestIndexes(url: string): Promise<void> {
  const { PrismaClient } = await import("@prisma/client");
  const { ensureManualIndexes } = await import("../infrastructure/database/manual-indexes");
  const client = new PrismaClient({ datasources: { db: { url } } });
  try {
    await ensureManualIndexes((command) => client.$runCommandRaw(command as Parameters<typeof client.$runCommandRaw>[0]));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[jest] Không tạo được index thủ công (2dsphere):", err instanceof Error ? err.message : err);
  } finally {
    await client.$disconnect();
  }
}
