import { z } from "zod";
import { objectIdSchema } from "../../../shared/dto/common-schemas";

/**
 * `GET /workspaces/:id/member-lookup?q=` — `q` là email ĐẦY ĐỦ hoặc số điện thoại. Phân loại + kiểm hình dạng làm ở service
 * (`classifyContactQuery`): tên/chuỗi số dở dang → 400 `VAL_001` (KHÔNG khớp tiền tố — tránh dò danh bạ). Giới hạn 254 = RFC 5321.
 * `q` được `redactSearchQuery` che khỏi log request.
 */
export const memberLookupQuerySchema = z.object({
  q: z.string().trim().min(1, "Nhập email hoặc số điện thoại").max(254),
});
export type MemberLookupQueryDto = z.infer<typeof memberLookupQuerySchema>;

/** `POST /workspaces/:id/members` — OWNER/ADMIN thêm THẲNG một người (đã tra ra bằng `member-lookup`) làm thành viên. */
export const addMemberSchema = z.object({ userId: objectIdSchema }).strict();
export type AddMemberDto = z.infer<typeof addMemberSchema>;
