import { prisma } from "../../infrastructure/database";
import { NotFoundError } from "../../core/exceptions";
import { normalizeSearch } from "../../core/utils/normalize";
import type { AuthUser } from "../../core/types/express";
import { permissionService } from "../../core/permission";
import {
  GRANT_ROLE_REFS,
  ROLE_REF_LABEL,
  isGrantRoleRef,
  workspaceRolesCoveredByAny,
  type GrantRoleRef,
} from "../../core/constants/role-coverage";
import { avatarUrlOf } from "../../shared/media";
import type { MessageScopeTypeValue } from "../messages/public";
import { CONVERSATION_ROLE_RANK } from "./mention.service";

export interface MentionableUser {
  userId: string;
  name: string;
  avatarUrl: string | null;
  /** P1 (`@role`, p3-04) — luôn `undefined` ở vòng này, giữ field cho hợp đồng be.md §4. */
  roleLabel?: string;
}

/** `@role` (p3-04) — vai trò có thể nhắc trong kênh; `recipientCount` = số người sẽ nhận (đọc được kênh, trừ chính mình). */
export interface MentionableRole {
  roleRef: GrantRoleRef;
  label: string;
  recipientCount: number;
}

export interface MentionablesResult {
  users: MentionableUser[];
  canMentionAll: boolean;
  allCount?: number;
  /** Chỉ khi `includeRoles=true` ở kênh: người gọi có được `@role` không (`workspace.mention.role` — OWNER/ADMIN). */
  canMentionRole?: boolean;
  /** Chỉ khi `includeRoles=true`, `canMentionRole=true` và scope là kênh. */
  roles?: MentionableRole[];
}

const FETCH_CAP = 500;

function matchesQuery(normalizedName: string, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const nameTokens = normalizedName.split(" ").filter(Boolean);
  return tokens.every((t) => nameTokens.some((nt) => nt.startsWith(t)));
}

/**
 * be.md §5.5 — gợi ý mention (không email, tối đa `LIMITS.mention.mentionablesLimit`).
 * "Sắp theo người gửi tin gần đây trong kênh" (be.md đề xuất Redis ZSET
 * `recent-authors:ch:<id>` cập nhật ở `onMessageCreated`) được ĐƠN GIẢN HOÁ
 * thành đọc trực tiếp `Message` gần nhất trong kênh (nguồn dữ liệu THẬT, đã
 * có sẵn, không cần thêm cache Redis + hook ghi ở `message.service.ts#send()`
 * ngoài 2 port đã được uỷ quyền cho tác vụ này) — cùng kết quả xếp hạng, đổi
 * lấy 1 truy vấn Mongo thay vì Redis ZSET, chấp nhận được ở quy mô gợi ý
 * mention (không phải đường nóng tần suất cao).
 */
export class MentionablesService {
  async list(
    user: AuthUser,
    scopeType: MessageScopeTypeValue,
    scopeId: string,
    q: string,
    limit: number,
    includeRoles = false
  ): Promise<MentionablesResult> {
    if (scopeType === "CHANNEL") return this.listChannel(user, scopeId, q, limit, includeRoles);
    return this.listConversation(user, scopeId, q, limit);
  }

  private async listChannel(
    user: AuthUser,
    channelId: string,
    q: string,
    limit: number,
    includeRoles: boolean
  ): Promise<MentionablesResult> {
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { workspaceId: true, visibility: true },
    });
    if (!channel) throw new NotFoundError();

    let userIds: string[];
    if (channel.visibility === "PUBLIC") {
      // p3-04 §5.6 — thành viên (không phải khách) ∪ khách ĐƯỢC CHỈ ĐỊNH vào kênh này (grant DIRECT, chưa hết hạn).
      const [memberships, directGrants] = await Promise.all([
        prisma.workspaceMembership.findMany({
          where: { workspaceId: channel.workspaceId, status: "ACTIVE" },
          select: { userId: true, role: true, expiresAt: true },
        }),
        prisma.channelGrant.findMany({ where: { channelId, source: "DIRECT" }, select: { userId: true } }),
      ]);
      const designated = new Set(directGrants.flatMap((g) => (g.userId ? [g.userId] : [])));
      const now = Date.now();
      userIds = memberships
        .filter((m) => m.role !== "GUEST" || (designated.has(m.userId) && (!m.expiresAt || m.expiresAt.getTime() > now)))
        .map((m) => m.userId);
    } else {
      // Kênh riêng tư: grant DIRECT ∪ người được phủ bởi grant theo vai trò (p3-04; `ADMIN` = OWNER+ADMIN,
      // `MEMBER` = OWNER+ADMIN+MEMBER, không GUEST). Kênh không có role grant thì KHÔNG tra membership.
      const grants = await prisma.channelGrant.findMany({
        where: { channelId },
        select: { userId: true, source: true, roleRef: true },
      });
      const roleRefs = grants.flatMap((g) => (g.source === "ROLE" && isGrantRoleRef(g.roleRef) ? [g.roleRef] : []));
      const viaRole =
        roleRefs.length > 0
          ? await prisma.workspaceMembership.findMany({
              where: { workspaceId: channel.workspaceId, status: "ACTIVE", role: { in: workspaceRolesCoveredByAny(roleRefs) } },
              select: { userId: true },
            })
          : [];
      userIds = Array.from(
        new Set([...grants.flatMap((g) => (g.userId ? [g.userId] : [])), ...viaRole.map((m) => m.userId)])
      );
    }

    const priorityOrder = await this.recentAuthorsInChannel(channelId, userIds);
    const users = await this.searchAndSort(userIds, q, limit, priorityOrder);
    // CHANNEL không có `@all` ở P0 (P2 `@everyone`, be.md §2/§9.1 "Kênh: không có ở P0").
    if (!includeRoles) return { users, canMentionAll: false };

    const roles = await this.mentionableRoles(user, channel.workspaceId, userIds);
    return { users, canMentionAll: false, canMentionRole: roles !== null, ...(roles && { roles }) };
  }

  /** `null` khi người gọi không có `workspace.mention.role`; ngược lại số người nhận của từng vai trò (đọc được kênh, trừ chính mình). */
  private async mentionableRoles(user: AuthUser, workspaceId: string, readerIds: string[]): Promise<MentionableRole[] | null> {
    const allowed = await permissionService.can(user, "workspace.mention.role", { type: "WORKSPACE", id: workspaceId });
    if (!allowed) return null;
    const audience = readerIds.filter((id) => id !== user.id);
    return Promise.all(
      GRANT_ROLE_REFS.map(async (roleRef) => ({
        roleRef,
        label: ROLE_REF_LABEL[roleRef],
        recipientCount:
          audience.length === 0
            ? 0
            : await prisma.workspaceMembership.count({
                where: { workspaceId, status: "ACTIVE", role: { in: workspaceRolesCoveredByAny([roleRef]) }, userId: { in: audience } },
              }),
      }))
    );
  }

  private async recentAuthorsInChannel(channelId: string, allowedIds: string[]): Promise<string[]> {
    if (allowedIds.length === 0) return [];
    const recent = await prisma.message.findMany({
      where: {
        scopeType: "CHANNEL",
        scopeId: channelId,
        threadKey: "root",
        kind: "USER",
        authorId: { in: allowedIds },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: { authorId: true },
    });
    const seen = new Set<string>();
    const order: string[] = [];
    for (const r of recent) {
      if (r.authorId && !seen.has(r.authorId)) {
        seen.add(r.authorId);
        order.push(r.authorId);
      }
    }
    return order;
  }

  private async listConversation(
    user: AuthUser,
    conversationId: string,
    q: string,
    limit: number
  ): Promise<MentionablesResult> {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { kind: true, settings: true, memberCount: true },
    });
    if (!conversation) throw new NotFoundError();

    const members = await prisma.conversationMember.findMany({
      where: { conversationId, status: "ACTIVE" },
      select: { userId: true, role: true },
    });
    const userIds = members.map((m) => m.userId);

    let canMentionAll = false;
    let allCount: number | undefined;
    if (conversation.kind === "GROUP") {
      const me = members.find((m) => m.userId === user.id);
      const rank = me ? CONVERSATION_ROLE_RANK[me.role] : 0;
      const mentionAllRole = (conversation.settings as { mentionAllRole?: "ADMIN" | "MEMBER" }).mentionAllRole ?? "ADMIN";
      canMentionAll = rank >= CONVERSATION_ROLE_RANK[mentionAllRole];
      if (canMentionAll) allCount = Math.max(conversation.memberCount - 1, 0);
    }

    const users = await this.searchAndSort(userIds, q, limit, []);
    return { users, canMentionAll, ...(allCount !== undefined && { allCount }) };
  }

  private async searchAndSort(
    userIds: string[],
    q: string,
    limit: number,
    priorityOrder: string[]
  ): Promise<MentionableUser[]> {
    if (userIds.length === 0) return [];
    const tokens = normalizeSearch(q).split(" ").filter(Boolean);
    const rows = await prisma.user.findMany({
      where: { id: { in: userIds }, status: "ACTIVE" },
      select: { id: true, name: true, normalizedName: true, avatarAssetId: true },
      take: FETCH_CAP,
    });
    const filtered = rows.filter((r) => matchesQuery(r.normalizedName, tokens));

    const priorityIndex = new Map(priorityOrder.map((id, i) => [id, i]));
    filtered.sort((a, b) => {
      const pa = priorityIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const pb = priorityIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      if (pa !== pb) return pa - pb;
      return a.name.localeCompare(b.name, "vi");
    });

    // Không trả `email` (be.md §5.5). Ảnh: URL ký sẵn từ `avatarAssetId` đã nạp cùng truy vấn trên.
    return filtered.slice(0, limit).map((u) => ({ userId: u.id, name: u.name, avatarUrl: avatarUrlOf(u.avatarAssetId) }));
  }
}
