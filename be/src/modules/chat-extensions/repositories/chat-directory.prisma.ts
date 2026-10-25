import { prisma } from "../../../infrastructure/database";
import { avatarUrlOf } from "../../../shared/media";
import type { ChatScopeType } from "../entities/chat-extensions.types";
import { scopeLabelKey, type ChatAssetRef, type ChatUserRef, type IChatDirectory } from "./chat-directory.interface";

export class PrismaChatDirectory implements IChatDirectory {
  async users(ids: string[]): Promise<Map<string, ChatUserRef>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, status: true, avatarAssetId: true } });
    return new Map(rows.map((u) => [u.id, { id: u.id, name: u.name, status: u.status, avatar: avatarUrlOf(u.avatarAssetId) }]));
  }

  async assets(ids: string[]): Promise<Map<string, ChatAssetRef>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await prisma.asset.findMany({ where: { id: { in: unique } }, select: { id: true, originalName: true, mime: true, size: true, declaredSize: true } });
    return new Map(rows.map((a) => [a.id, { assetId: a.id, name: a.originalName, mime: a.mime, size: a.size ?? a.declaredSize }]));
  }

  async channelVisibility(channelId: string): Promise<"PUBLIC" | "PRIVATE" | null> {
    const c = await prisma.channel.findUnique({ where: { id: channelId }, select: { visibility: true } });
    return c ? c.visibility : null;
  }

  async scopeLabels(viewerId: string, scopes: Array<{ scopeType: ChatScopeType; scopeId: string }>): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const channelIds = [...new Set(scopes.filter((s) => s.scopeType === "CHANNEL").map((s) => s.scopeId))];
    const conversationIds = [...new Set(scopes.filter((s) => s.scopeType === "CONVERSATION").map((s) => s.scopeId))];

    if (channelIds.length > 0) {
      const channels = await prisma.channel.findMany({ where: { id: { in: channelIds } }, select: { id: true, name: true } });
      for (const c of channels) out.set(scopeLabelKey("CHANNEL", c.id), c.name);
    }
    if (conversationIds.length > 0) {
      const conversations = await prisma.conversation.findMany({ where: { id: { in: conversationIds } }, select: { id: true, kind: true, title: true } });
      const directIds = conversations.filter((c) => c.kind === "DIRECT").map((c) => c.id);
      // 1-1: tên người CÒN LẠI (`peerUserId` của thành viên chính người xem) — MỘT truy vấn thành viên + MỘT truy vấn tên.
      const peerByConversation = new Map<string, string>();
      if (directIds.length > 0) {
        const members = await prisma.conversationMember.findMany({ where: { conversationId: { in: directIds }, userId: viewerId }, select: { conversationId: true, peerUserId: true } });
        for (const m of members) if (m.peerUserId) peerByConversation.set(m.conversationId, m.peerUserId);
      }
      const peers = await this.users([...peerByConversation.values()]);
      for (const c of conversations) {
        const peerId = peerByConversation.get(c.id);
        const label = c.kind === "DIRECT" ? (peerId ? peers.get(peerId)?.name : undefined) : c.title;
        if (label) out.set(scopeLabelKey("CONVERSATION", c.id), label);
      }
    }
    return out;
  }
}
