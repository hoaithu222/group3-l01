import { createHash, randomBytes } from "crypto";
import { AppError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import { OneTimeStore } from "../../../core/utils/one-time-store";

/** Token đặt lại mật khẩu sống 15 phút. */
export const RESET_TOKEN_TTL_SECONDS = 15 * 60;

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Token đặt lại mật khẩu (dùng MỘT lần, 15 phút).
 *
 * - Token thô (256 bit, base64url) chỉ nằm trong email; Redis chỉ giữ HASH của
 *   nó (`reset:<sha256>` → `{ userId }`) — đọc được Redis (sao lưu, log lệnh)
 *   cũng không dùng lại được token.
 * - `consume` nguyên tử (`GETDEL`): hai request đồng thời với cùng token chỉ
 *   một request thắng — trước đây `get` rồi `del` riêng nên cả hai đều đổi được mật khẩu.
 * - Mỗi user chỉ có MỘT token còn hiệu lực: cấp token mới thu hồi token cũ
 *   (`reset-user:<userId>` trỏ tới token hiện tại), đổi/đặt lại mật khẩu thu hồi token còn treo.
 * - Giá trị lưu là object `{ userId }` (không phải chuỗi trần): wrapper Redis
 *   `JSON.parse` giá trị đọc ra, một ObjectId toàn chữ số sẽ bị đọc thành số.
 * - Redis không dùng được ở production ⇒ 503 (không cấp token vô dụng rồi
 *   gửi mail); dev có Map dự phòng — xem `OneTimeStore`.
 */
export class ResetTokenStore {
  private readonly tokens = new OneTimeStore({
    prefix: "reset:",
    ttlSeconds: RESET_TOKEN_TTL_SECONDS,
    label: "reset-password",
  });
  private readonly pointers = new OneTimeStore({
    prefix: "reset-user:",
    ttlSeconds: RESET_TOKEN_TTL_SECONDS,
    label: "reset-password-user",
  });

  /** Có nơi lưu token dùng được không (production + Redis lỗi ⇒ `false`). */
  available(): boolean {
    return this.tokens.available();
  }

  /** Từ chối sớm, ĐỒNG NHẤT với mọi email, khi không có nơi lưu token an toàn. */
  assertAvailable(): void {
    if (!this.available()) {
      throw new AppError(
        "Không thể xử lý yêu cầu, vui lòng thử lại sau",
        503,
        ErrorCode.SYS_503
      );
    }
  }

  /** Cấp token mới cho `userId` (thu hồi token cũ còn treo). Trả token THÔ để gửi email. */
  async issue(userId: string): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    const id = digest(token);
    await this.invalidateAllFor(userId);
    await this.tokens.put(id, { userId });
    await this.pointers.put(userId, { tokenId: id });
    return token;
  }

  /** Tiêu thụ token đúng MỘT lần — trả `userId`, hoặc `null` nếu lạ/đã dùng/hết hạn. */
  async consume(token: string): Promise<string | null> {
    const record = await this.tokens.take<{ userId?: string }>(digest(token));
    const userId = record?.userId;
    if (typeof userId !== "string" || !userId) return null;
    await this.pointers.remove(userId);
    return userId;
  }

  /** Thu hồi token đang treo của `userId` (sau đổi/đặt lại mật khẩu, hoặc trước khi cấp token mới). */
  async invalidateAllFor(userId: string): Promise<void> {
    const pointer = await this.pointers.take<{ tokenId?: string }>(userId);
    if (pointer?.tokenId) await this.tokens.remove(pointer.tokenId);
  }
}
