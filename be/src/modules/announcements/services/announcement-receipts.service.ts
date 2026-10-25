import { NotFoundError } from "../../../core/exceptions";
import { permissionService, type PermissionService } from "../../../core/permission";
import type { AuthUser } from "../../../core/types/express";
import { decodeOffsetCursor, encodeCursor, encodeOffsetCursor } from "../../../core/utils/cursor";
import { normalizeSearch } from "../../../core/utils/normalize";
import { parseCursorPoint } from "../../../core/utils/search-query";
import { avatarUrlOf } from "../../../shared/media";
import type { ReceiptsQueryDto } from "../dtos";
import type { ReceiptItem, ReceiptsPage } from "../entities/announcement.interface";
import type { IAnnouncementLookupRepository, IAnnouncementRepository } from "../repositories/announcement.repository.interface";

/** Người ĐỌC ĐƯỢC kênh hiện tại (`MessageScope.readerIds` của CHANNEL) — audience thật, không lưu sẵn. */
export type ReaderIds = (channelId: string) => Promise<string[]>;

/**
 * Danh sách đã/chưa xác nhận (be.md p5-04 §5): chỉ người yêu cầu và quản trị kênh. Audience = người ĐANG đọc được kênh trừ người yêu
 * cầu, nên người mất quyền không nằm trong "chưa xác nhận" (RC-03) và `audienceCount` luôn phản ánh hiện tại.
 */
export class AnnouncementReceiptsService {
  constructor(
    private readonly repo: IAnnouncementRepository,
    private readonly lookup: IAnnouncementLookupRepository,
    private readonly readers: ReaderIds,
    private readonly permissions: Pick<PermissionService, "assert"> = permissionService
  ) {}

  async list(user: AuthUser, messageId: string, query: ReceiptsQueryDto): Promise<ReceiptsPage> {
    const request = await this.repo.findByMessageId(messageId);
    if (!request) throw new NotFoundError();
    await this.permissions.assert(user, "channel.read", { type: "CHANNEL", id: request.channelId });
    if (request.requestedBy !== user.id) await this.permissions.assert(user, "channel.manage", { type: "CHANNEL", id: request.channelId });

    const audience = (await this.readers(request.channelId)).filter((id) => id !== request.requestedBy);
    const confirmed = await this.repo.confirmedUserIds(request.id, audience);
    const base = { limit: query.limit, confirmedCount: confirmed.size, audienceCount: audience.length };

    return query.status === "confirmed"
      ? this.confirmedPage(request.id, new Set(audience), query, base)
      : this.pendingPage(audience.filter((id) => !confirmed.has(id)), query, base);
  }

  private async confirmedPage(requestId: string, audience: ReadonlySet<string>, query: ReceiptsQueryDto, base: Pick<ReceiptsPage["meta"], "limit" | "confirmedCount" | "audienceCount">): Promise<ReceiptsPage> {
    const rows = await this.repo.listReceipts(requestId, query.limit + 1, parseCursorPoint(query.cursor));
    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1];
    const users = await this.lookup.userBriefs(page.map((r) => r.userId));
    // Người đã mất quyền đọc kênh không hiện trong danh sách (không lộ tên ngoài phạm vi); số đếm giữ theo audience hiện tại.
    const data: ReceiptItem[] = page
      .filter((r) => audience.has(r.userId))
      .map((r) => {
        const person = users.get(r.userId);
        return { userId: r.userId, name: person?.name ?? null, avatarUrl: avatarUrlOf(person?.avatarAssetId), confirmedAt: r.confirmedAt };
      });
    const hasMore = rows.length > query.limit;
    return { data, meta: { ...base, hasMore, nextCursor: hasMore && last ? encodeCursor(last.confirmedAt, last.id) : null } };
  }

  private async pendingPage(pendingIds: string[], query: ReceiptsQueryDto, base: Pick<ReceiptsPage["meta"], "limit" | "confirmedCount" | "audienceCount">): Promise<ReceiptsPage> {
    const users = await this.lookup.userBriefs(pendingIds);
    const sorted = pendingIds
      .map((id) => ({ id, name: users.get(id)?.name ?? null }))
      .sort((a, b) => normalizeSearch(a.name ?? "").localeCompare(normalizeSearch(b.name ?? "")) || a.id.localeCompare(b.id));
    const offset = decodeOffsetCursor(query.cursor);
    const page = sorted.slice(offset, offset + query.limit);
    const hasMore = offset + query.limit < sorted.length;
    return {
      // Ký URL ảnh chỉ cho trang đang trả (audience có thể lớn).
      data: page.map((p) => ({ userId: p.id, name: p.name, avatarUrl: avatarUrlOf(users.get(p.id)?.avatarAssetId) })),
      meta: { ...base, hasMore, nextCursor: hasMore ? encodeOffsetCursor(offset + query.limit) : null },
    };
  }
}
