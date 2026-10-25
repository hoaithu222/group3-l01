import { ValidationError } from "../../../core/exceptions";
import { decodeCursor } from "../../../core/utils/cursor";
import { objectIdSchema } from "../../../shared/dto/common-schemas";

export interface CursorPoint {
  at: Date;
  id: string;
}

/**
 * Giải mã tham số `cursor` (`encodeCursor(at, id)` của `core/utils/cursor`). `undefined`
 * khi vắng; hỏng/`id` không phải ObjectId → 400 `VAL_001` (id đi vào truy vấn `$oid`/
 * Prisma nên phải là ObjectId hợp lệ, không được để lọt chuỗi tuỳ ý).
 */
export function parseCursorParam(raw: string | undefined): CursorPoint | undefined {
  if (raw === undefined || raw === "") return undefined;
  const decoded = decodeCursor(raw);
  if (!decoded || !objectIdSchema.safeParse(decoded.id).success) {
    throw new ValidationError("Cursor không hợp lệ");
  }
  return decoded;
}
