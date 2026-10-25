import { randomBytes } from "crypto";
import { OneTimeStore } from "./one-time-store";

const NONCE_BYTES = 24;
/** TTL nonce (D-27) — nonce lấy quá 120 giây trước khi dùng bị từ chối. */
export const NONCE_TTL_SECONDS = 120;

/**
 * Nonce nằm trên Redis (`nonce:<nonce>`, TTL 120 giây, `GETDEL` nguyên tử nên
 * an toàn nhiều instance). Chỉ khi Redis không dùng được VÀ không phải
 * production mới rơi về `Map` trong tiến trình — xem `OneTimeStore`.
 */
const store = new OneTimeStore({
  prefix: "nonce:",
  ttlSeconds: NONCE_TTL_SECONDS,
  label: "nonce",
});

/**
 * Nonce dùng 1 lần — chống replay cho login/register/biometric-login (D-27).
 * Client lấy nonce trước (`GET /auth/nonce`), gửi kèm request nhạy cảm; server
 * tiêu thụ đúng 1 lần rồi bỏ.
 */
export class NonceUtils {
  /**
   * Cấp 1 nonce mới, TTL 120s. Production mà Redis không dùng được ⇒ ném
   * `AppError` 503 `SYS_503` (không cấp nonce "lỏng" không kiểm soát được).
   */
  static async issue(): Promise<{ nonce: string; expiresIn: number }> {
    const nonce = randomBytes(NONCE_BYTES).toString("base64url");
    await store.put(nonce);
    return { nonce, expiresIn: NONCE_TTL_SECONDS };
  }

  /**
   * Tiêu thụ 1 nonce — trả `true` đúng 1 lần cho mỗi nonce hợp lệ. Không bao
   * giờ ném lỗi: nonce lạ/đã dùng/hết hạn, hoặc production + Redis lỗi ⇒ `false`
   * (fail-closed; middleware `requireNonce` trả `AUTH_018`).
   */
  static async consume(nonce: string): Promise<boolean> {
    const value = await store.take(nonce);
    return value !== null;
  }

  /** Chỉ dùng trong test — dọn Map dự phòng + tắt timer. */
  static resetMemoryForTests(): void {
    store.resetMemoryForTests();
  }

  /** Chỉ dùng trong test — số nonce còn trong Map dự phòng (dev). */
  static memorySizeForTests(): number {
    return store.memorySizeForTests();
  }
}
