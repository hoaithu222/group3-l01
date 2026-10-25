import { prisma } from "../../../infrastructure/database";
import { avatarUrlOf } from "../../../shared/media";

/**
 * Đọc CHỈ-ĐỌC dữ liệu của module khác (hội thoại, kênh, họp, người dùng) cho `calls` — cùng cách `read-state`/`discovery`
 * đọc thẳng collection trong repository của mình thay vì import service của module đó (luật 3 tầng). Quyền vẫn đi qua
 * `PermissionService`; reader chỉ cấp dữ kiện (loại hội thoại, trạng thái, danh sách thành viên).
 */
export interface ConversationInfo {
  id: string;
  kind: "DIRECT" | "GROUP";
  status: "ACTIVE" | "ARCHIVED" | "DISSOLVED";
  workspaceId: string | null;
  meetingId: string | null;
  title: string | null;
  /** Ảnh nhóm chat (GROUP) — DIRECT không có (avatar là của người kia, lấy qua `getUserProfiles`). */
  avatarAssetId: string | null;
}

export interface ConversationMemberInfo {
  userId: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  lastReadAt: Date | null;
}

export interface ChannelInfo {
  id: string;
  workspaceId: string;
  name: string;
  type: "TEXT" | "VOICE" | "POMODORO";
  status: "ACTIVE" | "ARCHIVED";
  visibility: "PUBLIC" | "PRIVATE";
  voiceSettings: { allowVideo: boolean; maxParticipants: number } | null;
}

export interface UserProfile {
  name: string;
  /** URL ảnh hiển thị ký sẵn (`avatarUrlOf`) — `null` khi chưa đặt ảnh hoặc đã ẩn danh hoá (`avatarAssetId` bị xoá). */
  avatarUrl: string | null;
}

export interface ICallScopeReader {
  getConversation(id: string): Promise<ConversationInfo | null>;
  listConversationMembers(conversationId: string): Promise<ConversationMemberInfo[]>;
  getConversationMemberRole(conversationId: string, userId: string): Promise<ConversationMemberInfo["role"] | null>;
  getChannel(id: string): Promise<ChannelInfo | null>;
  getWorkspaceStatus(workspaceId: string): Promise<string | null>;
  /** Trạng thái cuộc họp (CALL_007: nhóm chat của cuộc họp đang LIVE). */
  getMeetingStatus(meetingId: string): Promise<"SCHEDULED" | "LIVE" | "ENDED" | "CANCELLED" | null>;
  getUserProfiles(userIds: string[]): Promise<Map<string, UserProfile>>;
}

export class PrismaCallScopeReader implements ICallScopeReader {
  async getConversation(id: string): Promise<ConversationInfo | null> {
    const row = await prisma.conversation.findUnique({
      where: { id },
      select: { id: true, kind: true, status: true, workspaceId: true, meetingId: true, title: true, avatarAssetId: true },
    });
    return row;
  }

  async listConversationMembers(conversationId: string): Promise<ConversationMemberInfo[]> {
    const rows = await prisma.conversationMember.findMany({
      where: { conversationId, status: "ACTIVE" },
      select: { userId: true, role: true, lastReadAt: true },
    });
    return rows;
  }

  async getConversationMemberRole(conversationId: string, userId: string): Promise<ConversationMemberInfo["role"] | null> {
    const row = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { role: true, status: true },
    });
    return row && row.status === "ACTIVE" ? row.role : null;
  }

  async getChannel(id: string): Promise<ChannelInfo | null> {
    const row = await prisma.channel.findUnique({
      where: { id },
      select: { id: true, workspaceId: true, name: true, type: true, status: true, visibility: true, voiceSettings: true },
    });
    if (!row) return null;
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      type: row.type,
      status: row.status,
      visibility: row.visibility,
      voiceSettings: row.voiceSettings ? { allowVideo: row.voiceSettings.allowVideo, maxParticipants: row.voiceSettings.maxParticipants } : null,
    };
  }

  async getWorkspaceStatus(workspaceId: string): Promise<string | null> {
    const row = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { status: true } });
    return row?.status ?? null;
  }

  async getMeetingStatus(meetingId: string): Promise<"SCHEDULED" | "LIVE" | "ENDED" | "CANCELLED" | null> {
    const row = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { status: true } });
    return row?.status ?? null;
  }

  async getUserProfiles(userIds: string[]): Promise<Map<string, UserProfile>> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return new Map();
    // `avatarAssetId` đi CÙNG truy vấn tên (không N+1); `avatarUrlOf` là hàm thuần (ký HMAC, không I/O).
    const rows = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, avatarAssetId: true } });
    return new Map(rows.map((r) => [r.id, { name: r.name, avatarUrl: avatarUrlOf(r.avatarAssetId) }]));
  }
}
