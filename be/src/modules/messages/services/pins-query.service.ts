import { NotFoundError, ValidationError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { decodeCursor, encodeCursor } from "../../../core/utils/cursor";
import { objectIdSchema } from "../../../shared/dto/common-schemas";
import type { PinsQueryDto } from "../dtos/pins-query.dto";
import type { MessageScopeTypeValue, MessageView } from "../entities/message.interface";
import type { IPinSupportRepository } from "../repositories/pin-support.repository.interface";
import { getMessageScope } from "../scope/message-scope.registry";
import type { MessageScope } from "../scope/message-scope.interface";
import type { MessageInteractionService } from "./message-interaction.service";

/** `MessageView` (hợp đồng p1-04 giữ nguyên) + người ghim kèm tên — client không cần tra thành viên chỉ để hiện "ghim bởi …". */
export interface PinnedItem extends MessageView {
  pinnedByUser: { id: string; name: string | null } | null;
}

export interface PinsPage {
  data: PinnedItem[];
  meta: { nextCursor: string | null; hasMore: boolean; limit: number; total: number; max: number };
}

const pinnedAtMs = (m: MessageView): number => m.pinnedAt?.getTime() ?? 0;

/** `pinnedAt desc, id desc` — id là ObjectId hex cùng độ dài nên so sánh chuỗi đúng thứ tự. */
function byPinnedDesc(a: MessageView, b: MessageView): number {
  return pinnedAtMs(b) - pinnedAtMs(a) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}

/**
 * p1-09 §5.3 — danh sách ghim phân trang cursor `(pinnedAt, id)` của kênh/hội thoại
 * (D-16: không có model `Pin`, đọc `Message.pinnedAt`). Bọc `MessageInteractionService.listPinned`
 * (giữ nguyên kiểm quyền đọc, projection `MessageView` + tóm tắt thread của p1-04/p1-06) và thêm:
 *  - lọc tin bị ẩn với người xem (`hiddenBeforeSeq` của hội thoại D-23, `MessageHide`);
 *  - cursor/limit; `meta.total` (đã lọc ẩn) và `meta.max` (= `adapter.pinMax`);
 *  - `pinnedByUser {id,name}`.
 * Số tin ghim luôn ≤ `pinMax` (20/10) nên phân trang thực hiện trong bộ nhớ, không cần truy vấn thêm.
 */
export class PinsQueryService {
  constructor(
    private readonly interaction: Pick<MessageInteractionService, "listPinned">,
    private readonly support: IPinSupportRepository,
    private readonly resolveScope: (scopeType: MessageScopeTypeValue) => MessageScope | undefined = getMessageScope
  ) {}

  async list(user: AuthUser, scopeType: MessageScopeTypeValue, scopeId: string, query: PinsQueryDto): Promise<PinsPage> {
    const scope = this.resolveScope(scopeType);
    if (!scope) throw new NotFoundError();
    const cursor = this.parseCursor(query.cursor);

    // `listPinned` kiểm quyền đọc (404 nếu không thấy) — gọi TRƯỚC mọi truy vấn khác.
    const pinned = await this.interaction.listPinned(user, scopeType, scopeId);
    const [viewerCtx, max, hiddenIds] = await Promise.all([
      scope.viewerContext(user, scopeId),
      scope.pinMax(scopeId),
      this.support.findHiddenMessageIds(user.id, pinned.map((m) => m.id)),
    ]);

    const floor = viewerCtx.hiddenBeforeSeq;
    const visible = pinned
      .filter((m) => !hiddenIds.has(m.id) && !(m.threadId === null && floor > 0 && m.seq <= floor))
      .sort(byPinnedDesc);

    const remaining = cursor
      ? visible.filter((m) => pinnedAtMs(m) < cursor.at.getTime() || (pinnedAtMs(m) === cursor.at.getTime() && m.id < cursor.id))
      : visible;
    const page = remaining.slice(0, query.limit);
    const last = page[page.length - 1];
    const hasMore = remaining.length > query.limit;

    const names = await this.support.findUserNames(page.flatMap((m) => (m.pinnedBy ? [m.pinnedBy] : [])));
    const data = page.map<PinnedItem>((m) => ({
      ...m,
      pinnedByUser: m.pinnedBy ? { id: m.pinnedBy, name: names.get(m.pinnedBy) ?? null } : null,
    }));

    return {
      data,
      meta: {
        nextCursor: hasMore && last?.pinnedAt ? encodeCursor(last.pinnedAt, last.id) : null,
        hasMore,
        limit: query.limit,
        total: visible.length,
        max,
      },
    };
  }

  private parseCursor(raw: string | undefined): { at: Date; id: string } | undefined {
    if (raw === undefined || raw === "") return undefined;
    const decoded = decodeCursor(raw);
    if (!decoded || !objectIdSchema.safeParse(decoded.id).success) throw new ValidationError("Cursor không hợp lệ");
    return decoded;
  }
}
