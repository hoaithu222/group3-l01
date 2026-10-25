import { LIMITS } from "../../../core/constants/limits";
import { rolesCovering } from "../../../core/constants/role-coverage";
import type {
  ComputeScopesInput,
  ReadableChannel,
  ReadableConversation,
  ReadableScopes,
  SearchScopeRef,
} from "../entities/search.interface";
import type { IReadableScopesRepository } from "../repositories/readable-scopes.repository.interface";

const ids = (only: readonly SearchScopeRef[] | undefined, type: SearchScopeRef["type"]): string[] | undefined =>
  only ? only.filter((s) => s.type === type).map((s) => s.id) : undefined;

/**
 * Tập kênh + hội thoại mà người dùng ĐỌC ĐƯỢC trong một workspace (be.md p5-04 §5 `readableScopes`) — tính TRƯỚC khi truy vấn để
 * mọi số đếm/snippet/phân trang chỉ trên tập này (README §2 "Lọc quyền"):
 *  - kênh PUBLIC (kể cả ARCHIVED): mọi thành viên KHÔNG phải khách; khách chỉ kênh được grant DIRECT cho chính họ;
 *  - kênh PRIVATE: grant DIRECT ∪ grant theo VAI TRÒ phủ tới vai trò của người tìm (`core/constants/role-coverage`);
 *  - nhóm chat (GROUP) của workspace mà người tìm là thành viên ACTIVE (kèm `hiddenBeforeSeq`);
 *  - `includeDirect`: hội thoại 1-1 mà người tìm là thành viên ACTIVE VÀ đối phương còn là thành viên ACTIVE của workspace (D-16) —
 *    khách không bao giờ được gồm 1-1.
 *
 * Không cache có chủ đích: tập ứng viên chỉ 3–5 truy vấn có chỉ mục, còn cache theo `permver` của workspace sẽ không thấy grant kênh
 * mới cấp/thu (version bump theo KÊNH, không theo workspace). Quyền được tính lại từ DB ở mỗi lượt và ở lượt kiểm lại trước khi trả
 * (`only`), nên không lộ tin của scope vừa mất quyền (DU-02).
 */
export class ReadableScopesService {
  constructor(private readonly repo: IReadableScopesRepository) {}

  async compute(input: ComputeScopesInput): Promise<ReadableScopes> {
    const isGuest = input.role === "GUEST";
    const [channels, conversations] = await Promise.all([
      input.withChannels === false ? [] : this.readableChannels(input, isGuest),
      input.withConversations === false ? [] : this.readableConversations(input, isGuest),
    ]);
    const capped = input.only ? null : this.cap(channels, conversations, input.max ?? LIMITS.search.workspaceScopesMax);
    return {
      channels: new Map((capped?.channels ?? channels).map((c) => [c.id, c])),
      conversations: new Map((capped?.conversations ?? conversations).map((c) => [c.id, c])),
      truncated: capped?.truncated ?? false,
    };
  }

  /** Id kênh người dùng đã tham gia (đánh dấu `joined` ở kết quả tìm kênh). */
  joinedChannelIds(workspaceId: string, userId: string): Promise<Set<string>> {
    return this.repo.joinedChannelIds(workspaceId, userId);
  }

  private async readableChannels(input: ComputeScopesInput, isGuest: boolean): Promise<ReadableChannel[]> {
    const onlyIds = ids(input.only, "CHANNEL");
    if (onlyIds && onlyIds.length === 0) return [];
    const rows = await this.repo.listChannels(input.workspaceId, onlyIds);
    if (rows.length === 0) return [];
    const needsGrant = isGuest || rows.some((c) => c.visibility === "PRIVATE");
    const granted = needsGrant
      ? await this.repo.grantedChannelIds(input.workspaceId, input.userId, isGuest ? [] : rolesCovering(input.role))
      : new Set<string>();
    return rows.filter((c) => (isGuest ? granted.has(c.id) : c.visibility === "PUBLIC" || granted.has(c.id)));
  }

  private async readableConversations(input: ComputeScopesInput, isGuest: boolean): Promise<ReadableConversation[]> {
    const onlyIds = ids(input.only, "CONVERSATION");
    if (onlyIds && onlyIds.length === 0) return [];
    const groups = await this.repo.listGroupConversations(input.workspaceId, input.userId, onlyIds);
    if (!input.includeDirect || isGuest) return groups;

    const directs = await this.repo.listDirectConversations(input.userId, onlyIds);
    const peerIds = directs.flatMap((d) => (d.peerUserId ? [d.peerUserId] : []));
    const active = await this.repo.activeMemberIds(input.workspaceId, peerIds);
    return [...groups, ...directs.filter((d) => d.peerUserId !== null && active.has(d.peerUserId))];
  }

  /** Vượt trần → giữ `max` scope hoạt động gần nhất (kênh + hội thoại xếp chung), `truncated = true`. */
  private cap(channels: ReadableChannel[], conversations: ReadableConversation[], max: number) {
    if (channels.length + conversations.length <= max) return { channels, conversations, truncated: false };
    const all = [
      ...channels.map((c) => ({ kind: "c" as const, id: c.id, at: c.lastActivityAt?.getTime() ?? 0 })),
      ...conversations.map((c) => ({ kind: "v" as const, id: c.id, at: c.lastActivityAt?.getTime() ?? 0 })),
    ]
      .sort((a, b) => b.at - a.at || a.id.localeCompare(b.id))
      .slice(0, max);
    const keepC = new Set(all.filter((x) => x.kind === "c").map((x) => x.id));
    const keepV = new Set(all.filter((x) => x.kind === "v").map((x) => x.id));
    return {
      channels: channels.filter((c) => keepC.has(c.id)),
      conversations: conversations.filter((c) => keepV.has(c.id)),
      truncated: true,
    };
  }
}
