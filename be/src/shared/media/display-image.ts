import { env } from "../../core/config";
import { LIMITS } from "../../core/constants/limits";
import { hmacSha256Hex, timingSafeEqualHex } from "../../core/utils/crypto";

/**
 * URL ẢNH HIỂN THỊ dùng chung: avatar người dùng, ảnh đại diện + ảnh bìa nhóm (workspace), ảnh nhóm chat.
 *
 * ── Vì sao không trả `avatarAssetId` hay `/users/:id/avatar` như trước ─────────────────────────────────────────────
 * `<img src>` (admin web) và `expo-image` (app) KHÔNG gửi `Authorization`, nên đường dẫn cần Bearer luôn rơi về chữ cái
 * đầu; còn xin `GET /assets/:id/url` cho TỪNG người trong danh sách là N request mỗi trang. URL ở đây tự mang chữ ký
 * HMAC (`ENCRYPTION_KEY`) nên dùng thẳng làm nguồn ảnh, và chỉ cần `assetId` ⇒ presenter nào cũng dựng được, không truy vấn.
 *
 * ── Vì sao hạn làm tròn theo "ô" thời gian ─────────────────────────────────────────────────────────────────────────
 * Mọi lần dựng trong cùng một ô (`LIMITS.upload.displayImageUrlBucketSeconds`) cho CÙNG một URL ⇒ client cache được ảnh;
 * URL còn hạn 1–2 ô nên URL rò rỉ tự chết. Đổi ảnh ⇒ `assetId` mới ⇒ URL mới; ảnh cũ bị gỡ link ⇒ endpoint trả 404 ngay.
 *
 * ⚠️ Endpoint nhận URL (`GET /assets/:id/image`, module `assets`) chỉ phục vụ asset đang gắn vào một đích trong
 * `DISPLAY_IMAGE_TARGETS` — ký nhầm id của tệp tin nhắn/tài liệu cũng KHÔNG lộ được tệp đó.
 */
export type DisplayImageVariant = "ORIGINAL" | "THUMB";

/** Tách miền chữ ký khỏi các HMAC khác dùng cùng `ENCRYPTION_KEY` (gateway tải Local, PIN O2O). */
const SIGNING_CONTEXT = "display-image:v1";

/** Mốc hết hạn (giây epoch) của URL dựng lúc `nowMs` — cuối ô KẾ TIẾP, nên còn hạn từ 1 tới 2 ô. */
export function displayImageExpiry(nowMs: number = Date.now()): number {
  const bucket = LIMITS.upload.displayImageUrlBucketSeconds;
  return (Math.floor(nowMs / 1000 / bucket) + 2) * bucket;
}

function signDisplayImage(assetId: string, exp: number): string {
  return hmacSha256Hex(`${SIGNING_CONTEXT}|${assetId}|${exp}`);
}

/** Gốc API công khai, bỏ `/` cuối (`PUBLIC_API_URL=https://api.example.com/` không sinh ra `//api`). */
function apiOrigin(): string {
  return env.PUBLIC_API_URL.replace(/\/+$/, "");
}

/**
 * URL tuyệt đối của ảnh hiển thị, hoặc `null` khi chưa có ảnh. `THUMB` (webp ≤ 320 px) cho avatar/thẻ danh sách,
 * `ORIGINAL` cho ảnh bìa khổ lớn. Endpoint tự lùi về bản gốc khi asset chưa có thumbnail.
 */
export function displayImageUrl(
  assetId: string | null | undefined,
  variant: DisplayImageVariant = "THUMB",
  nowMs: number = Date.now()
): string | null {
  if (!assetId) return null;
  const exp = displayImageExpiry(nowMs);
  const sig = signDisplayImage(assetId, exp);
  return `${apiOrigin()}/api/v1/assets/${assetId}/image?v=${variant}&e=${exp}&s=${sig}`;
}

/** Avatar (người dùng, nhóm, nhóm chat) — luôn bản `THUMB`: đủ nét cho khung ≤ 96 dp ở mật độ 3x, nhẹ hơn bản gốc nhiều lần. */
export function avatarUrlOf(assetId: string | null | undefined): string | null {
  return displayImageUrl(assetId, "THUMB");
}

/**
 * Chữ ký đúng luôn là 64 ký tự hex. Kiểm TRƯỚC khi so: `Buffer.from(x, "hex")` cắt ngầm đuôi không phải hex/ký tự lẻ, nên
 * thiếu bước này thì `<chữ ký đúng>zz` cũng qua (DTO của endpoint đã chặn, hàm dùng chung vẫn phải tự đúng).
 */
const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/i;

/** Kiểm chữ ký + hạn của URL ảnh hiển thị (thời gian hằng). Sai/hết hạn → `false`. */
export function verifyDisplayImageSignature(
  assetId: string,
  exp: number,
  sig: string,
  nowMs: number = Date.now()
): boolean {
  if (!Number.isSafeInteger(exp) || exp * 1000 <= nowMs) return false;
  if (!SIGNATURE_PATTERN.test(sig)) return false;
  return timingSafeEqualHex(signDisplayImage(assetId, exp), sig);
}
