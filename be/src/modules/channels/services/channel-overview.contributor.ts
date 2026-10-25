import type {
  WorkspaceOverviewContext,
  WorkspaceOverviewContributor,
} from "../../../shared/ports/workspace-overview.port";
import type { IChannelRepository } from "../repositories/channel.repository.interface";
import type { IChannelMembershipRepository } from "../repositories/channel-membership.repository.interface";
import { rolesCovering } from "../../../core/constants/role-coverage";
import type { IChannelGrantRepository } from "../repositories/channel-grant.repository.interface";
import { toChannelListItem, type ChannelListItem } from "./channel.presenter";

/** be.md p1-01 §4 overview `channels: { default, joined[≤20], pinned[] }`. */
export const OVERVIEW_JOINED_MAX = 20;

export interface ChannelOverviewBlock {
  /** Kênh mặc định nếu người xem đọc được (luôn PUBLIC, nên gần như luôn có). */
  default: { id: string; name: string } | null;
  /** Kênh ĐÃ THAM GIA và đọc được, ghim → mặc định → vị trí → tên; tối đa {@link OVERVIEW_JOINED_MAX}. */
  joined: ChannelListItem[];
  /** Tập con của `joined` mà người xem đã ghim (giữ thứ tự). */
  pinned: ChannelListItem[];
}

function compareItems(a: ChannelListItem, b: ChannelListItem): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
  const posA = a.position ?? Number.POSITIVE_INFINITY;
  const posB = b.position ?? Number.POSITIVE_INFINITY;
  if (posA !== posB) return posA - posB;
  return a.name.localeCompare(b.name);
}

/**
 * Khối "Kênh của bạn" của trang tổng quan workspace (p1-03 điểm mở #2, WS-09). ĐÃ LỌC THEO
 * QUYỀN của người xem: kênh PRIVATE chỉ xuất hiện khi họ CÓ grant — kể cả khi còn sót
 * `ChannelMembership` cũ (phòng thủ chiều sâu), kênh riêng tư không grant KHÔNG lộ tên,
 * loại, số đếm nào. Chưa có `unreadCount`/`mentionCount` (p1-07 bổ sung qua tham số
 * `unread` của `toChannelListItem` khi read-state sẵn sàng).
 */
export class ChannelOverviewContributor implements WorkspaceOverviewContributor {
  readonly key = "channels" as const;

  constructor(
    private readonly channelRepo: IChannelRepository,
    private readonly membershipRepo: IChannelMembershipRepository,
    private readonly grantRepo: IChannelGrantRepository
  ) {}

  async load(ctx: WorkspaceOverviewContext): Promise<ChannelOverviewBlock> {
    const [active, memberships, grantedIds] = await Promise.all([
      this.channelRepo.listByWorkspace(ctx.workspaceId, "ACTIVE"),
      this.membershipRepo.listByUser(ctx.workspaceId, ctx.userId),
      this.grantRepo.listChannelIdsForUser(ctx.workspaceId, ctx.userId, rolesCovering(ctx.role)),
    ]);
    const granted = new Set(grantedIds);
    const membershipByChannel = new Map(memberships.map((m) => [m.channelId, m]));

    // Khách (p3-04 §5.6): chỉ kênh CHỈ ĐỊNH (grant DIRECT) — kể cả public; không có "kênh public = mọi thành viên".
    const readable = active.filter((c) => (ctx.role === "GUEST" ? granted.has(c.id) : c.visibility === "PUBLIC" || granted.has(c.id)));
    const joinedAll = readable
      .filter((c) => membershipByChannel.has(c.id))
      .map((c) => toChannelListItem(c, membershipByChannel.get(c.id) ?? null))
      .sort(compareItems);

    const defaultChannel = readable.find((c) => c.isDefault);
    return {
      default: defaultChannel ? { id: defaultChannel.id, name: defaultChannel.name } : null,
      joined: joinedAll.slice(0, OVERVIEW_JOINED_MAX),
      pinned: joinedAll.filter((i) => i.pinned),
    };
  }
}
