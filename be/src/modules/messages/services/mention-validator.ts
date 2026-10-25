import { LIMITS } from "../../../core/constants/limits";
import type { MentionInputDto } from "../dtos/send-message.dto";
import type { MessageMention } from "../entities/message.interface";

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

export interface MentionValidationOutcome {
  valid: boolean;
  mentions: MessageMention[];
  invalidMentions?: MentionInputDto[];
}

/**
 * be.md §5.1 bước 5 gọi đây "MentionService.validate() (p1-06)" — p1-06 ĐÃ
 * build (`modules/mentions/mention.service.ts`, đăng ký qua
 * `registerMentionValidator()` lúc `router.ts` boot). `message.service.ts`
 * giờ gọi `MentionService` THẬT khi đã đăng ký; hàm dưới đây CHỈ còn dùng làm
 * FALLBACK khi chưa có validator đăng ký (vd test cũ tự dựng app không import
 * đủ `router.ts`/`modules/mentions`) — giữ NGUYÊN để không phá các test đó.
 * Bản gốc chỉ kiểm CẤU TRÚC:
 *   - `type: "USER"` PHẢI có `targetId` là ObjectId hợp lệ.
 *   - `type: "ROLE"` PHẢI có `targetId` (role ref) — không kiểm role có tồn
 *     tại trong workspace hay không (cần dữ liệu ngoài phạm vi scope).
 *   - `type: "ALL"` KHÔNG cần `targetId`.
 *   - Không được trùng cặp `(type, targetId)`.
 *   - Số lượng ≤ `LIMITS.message.mentionsMax` (đã chặn ở Zod, kiểm lại cho chắc).
 *
 * KHÔNG kiểm người/role được nhắc có thực sự là thành viên scope hay không —
 * việc đó cần dữ liệu membership của TỪNG loại scope mà engine không có sẵn
 * mà không phá luật "không import module khác". `MessageScope.validateMentions`
 * (tuỳ chọn, `scope/message-scope.interface.ts`) là chỗ CHANNEL/CONVERSATION
 * cắm kiểm tra sâu hơn bằng dữ liệu riêng của chúng — `message.service.ts`
 * gọi nó SAU bước kiểm cấu trúc này nếu adapter có cài đặt. p1-06 khi build
 * xong nhiều khả năng thay thế toàn bộ file này bằng service thật (giống
 * `UnreadSummaryPort` p1-01/p1-02 đã làm với các port khác).
 */
export function validateMentionsStructurally(mentions: MentionInputDto[]): MentionValidationOutcome {
  if (mentions.length > LIMITS.message.mentionsMax) {
    return { valid: false, mentions: [], invalidMentions: mentions };
  }

  const seen = new Set<string>();
  const invalid: MentionInputDto[] = [];
  const normalized: MessageMention[] = [];

  for (const m of mentions) {
    const key = `${m.type}:${m.targetId ?? ""}`;
    let ok = true;
    if (m.type === "USER" || m.type === "ROLE") {
      ok = typeof m.targetId === "string" && OBJECT_ID_RE.test(m.targetId);
    } else if (m.type === "ALL") {
      ok = true;
    }
    if (seen.has(key)) ok = false;

    if (!ok) {
      invalid.push(m);
      continue;
    }
    seen.add(key);
    normalized.push({ type: m.type, targetId: m.targetId ?? null, label: null });
  }

  if (invalid.length > 0) {
    return { valid: false, mentions: [], invalidMentions: invalid };
  }
  return { valid: true, mentions: normalized };
}
