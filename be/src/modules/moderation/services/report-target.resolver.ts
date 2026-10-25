import { AppError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages, type ErrorCodeType } from "../../../core/utils/error.codes";
import type { AuthUser } from "../../../core/types/express";
import type { PermissionService } from "../../../core/permission";
import type { MessageModerationPort } from "../../../shared/ports/message-moderation.port";
import { getReportTargetExtension } from "../../../shared/ports/report.port";
import { buildGroupKey, type ResolvedReportTarget } from "../entities/report.interface";
import type { CreateReportDto } from "../dtos";
import type { IModerationDirectory } from "../repositories/moderation-directory.repository.interface";

function fail(code: ErrorCodeType, status: 400 | 404): AppError {
  return new AppError(ErrorMessages[code], status, code);
}
/** 404 trung tính — KHÔNG phân biệt "không tồn tại" và "không có quyền" (be.md §5.1, ma trận quyền README §6). */
const notFound = (): AppError => fail(ErrorCode.MOD_002, 404);
/** Loại đích/hành động không áp dụng (400). */
const notApplicable = (): AppError => fail(ErrorCode.MOD_003, 400);
/** Tự báo cáo mình (400) — dùng chung mã `BLOCK_001` "Không thể thực hiện với chính bạn" theo be.md §4. */
const selfTarget = (): AppError => fail(ErrorCode.BLOCK_001, 400);

type AccessResolver = Pick<PermissionService, "resolve">;

/**
 * Tra ĐÍCH của báo cáo (be.md p1-08 §5.1): kiểm người báo cáo THẤY được đích, và suy ra phạm vi/
 * người xử lý lúc tạo (`handlerLevel`, `scopeIsPrivate`) — lưu vào `Report` để hàng đợi truy vấn
 * theo phạm vi mà không phải lưu danh sách người xử lý. Quyền đọc luôn qua `MessageModerationPort`
 * (tin) / `permissionService` (kênh, nhóm chat, workspace) — không tự so sánh vai trò.
 */
export class ReportTargetResolver {
  constructor(
    private readonly messages: MessageModerationPort,
    private readonly directory: IModerationDirectory,
    private readonly access: AccessResolver
  ) {}

  async resolve(reporter: AuthUser, dto: CreateReportDto): Promise<ResolvedReportTarget> {
    switch (dto.targetType) {
      case "MESSAGE":
        return this.resolveMessage(reporter, dto.targetId);
      case "USER":
        return this.resolveUser(reporter, dto.targetId, dto.contextWorkspaceId);
      case "CHANNEL":
        return this.resolveChannel(reporter, dto.targetId);
      case "CONVERSATION":
        return this.resolveConversation(reporter, dto.targetId);
      case "STUDY_SET":
      case "MENTOR_POST": // p6-03 — bài tìm cố vấn (module `mentor` đăng ký extension)
      case "PORTFOLIO": // p6-07 — trang portfolio công khai (module `portfolio` đăng ký extension; chỉ quản trị nền tảng xử lý)
      case "COMPANY": // p6-08 — doanh nghiệp tuyển dụng (module `recruiter` đăng ký extension; chỉ quản trị nền tảng xử lý)
      case "JOB_OFFER": // p6-08 — lời mời việc làm lạm dụng (chỉ sinh viên nhận báo cáo được; chỉ quản trị nền tảng xử lý)
        return this.resolveExtension(reporter, dto.targetType, dto.targetId);
    }
  }

  /**
   * Đích do module khác sở hữu (p4-01 `STUDY_SET`) — tra qua registry `shared/ports/report.port`; `moderation` không import module đó.
   * Chưa đăng ký (module tắt/chưa nạp) → `MOD_003` "không áp dụng".
   */
  private async resolveExtension(reporter: AuthUser, targetType: "STUDY_SET" | "MENTOR_POST" | "PORTFOLIO" | "COMPANY" | "JOB_OFFER", targetId: string): Promise<ResolvedReportTarget> {
    const ext = getReportTargetExtension(targetType);
    if (!ext) throw notApplicable();
    const found = await ext.resolve(reporter, targetId);
    if (found === "NOT_FOUND") throw notFound();
    if (found === "SELF") throw selfTarget();
    return { ...found, targetType };
  }

  private async resolveMessage(reporter: AuthUser, messageId: string): Promise<ResolvedReportTarget> {
    const message = await this.messages.findReadable(reporter, messageId);
    if (!message || message.deleted) throw notFound();
    // Tin hệ thống không báo cáo được; tin khảo sát (`POLL`, p7-04) là nội dung người dùng nên báo cáo được như tin thường.
    if (message.kind === "SYSTEM") throw notApplicable();
    if (message.authorId === reporter.id) throw selfTarget();

    const base = {
      targetType: "MESSAGE" as const,
      targetId: messageId,
      groupKey: buildGroupKey("MESSAGE", messageId),
      scopeType: message.scopeType,
      scopeId: message.scopeId,
      targetAuthorId: message.authorId,
    };

    if (message.scopeType === "CHANNEL") {
      const [channel] = await this.directory.findChannels([message.scopeId]);
      if (!channel) throw notFound();
      // Kênh public → OWNER/ADMIN workspace; kênh private → MANAGER kênh (`scopeIsPrivate` → D-06).
      return { ...base, workspaceId: channel.workspaceId, scopeIsPrivate: channel.visibility === "PRIVATE", handlerLevel: "SCOPE" };
    }

    const [conversation] = await this.directory.findConversations([message.scopeId]);
    if (!conversation) throw notFound();
    if (conversation.kind === "GROUP") {
      return { ...base, workspaceId: conversation.workspaceId, scopeIsPrivate: true, handlerLevel: "SCOPE" };
    }
    // 1-1: không có "chủ workspace" — chỉ nền tảng xử lý (README §2).
    return { ...base, workspaceId: null, scopeIsPrivate: true, handlerLevel: "PLATFORM_ONLY" };
  }

  private async resolveUser(reporter: AuthUser, userId: string, contextWorkspaceId?: string): Promise<ResolvedReportTarget> {
    if (userId === reporter.id) throw selfTarget();
    const [target] = await this.directory.findUsers([userId]);
    if (!target) throw notFound();

    const base = {
      targetType: "USER" as const,
      targetId: userId,
      groupKey: buildGroupKey("USER", userId),
      scopeType: null,
      scopeId: null,
      scopeIsPrivate: false,
      targetAuthorId: userId,
    };

    if (!contextWorkspaceId) return { ...base, workspaceId: null, handlerLevel: "PLATFORM_ONLY" };

    // Ngữ cảnh workspace: CẢ HAI phải là thành viên ACTIVE — thiếu → 404 trung tính (không lộ ai là thành viên).
    const [reporterAccess, targetIsMember] = await Promise.all([
      this.access.resolve(reporter, { type: "WORKSPACE", id: contextWorkspaceId }),
      this.directory.isActiveWorkspaceMember(contextWorkspaceId, userId),
    ]);
    if (!reporterAccess.visible || !targetIsMember) throw notFound();
    return { ...base, workspaceId: contextWorkspaceId, handlerLevel: "SCOPE" };
  }

  private async resolveChannel(reporter: AuthUser, channelId: string): Promise<ResolvedReportTarget> {
    const access = await this.access.resolve(reporter, { type: "CHANNEL", id: channelId });
    if (!access.visible) throw notFound();
    const [channel] = await this.directory.findChannels([channelId]);
    if (!channel) throw notFound();

    const isPrivate = channel.visibility === "PRIVATE";
    return {
      targetType: "CHANNEL",
      targetId: channelId,
      groupKey: buildGroupKey("CHANNEL", channelId),
      scopeType: "CHANNEL",
      scopeId: channelId,
      scopeIsPrivate: isPrivate,
      workspaceId: channel.workspaceId,
      targetAuthorId: null,
      // Kênh private → chỉ nền tảng (README §2: "kênh → OWNER/ADMIN (public) hoặc nền tảng (private)").
      handlerLevel: isPrivate ? "PLATFORM_ONLY" : "SCOPE",
    };
  }

  private async resolveConversation(reporter: AuthUser, conversationId: string): Promise<ResolvedReportTarget> {
    const access = await this.access.resolve(reporter, { type: "CONVERSATION", id: conversationId });
    if (!access.visible) throw notFound();
    const [conversation] = await this.directory.findConversations([conversationId]);
    if (!conversation) throw notFound();
    // 1-1: báo cáo NGƯỜI DÙNG thay thế (không có "nhóm" để giải tán).
    if (conversation.kind === "DIRECT") throw notApplicable();

    return {
      targetType: "CONVERSATION",
      targetId: conversationId,
      groupKey: buildGroupKey("CONVERSATION", conversationId),
      scopeType: "CONVERSATION",
      scopeId: conversationId,
      scopeIsPrivate: true,
      workspaceId: conversation.workspaceId,
      targetAuthorId: null,
      handlerLevel: "PLATFORM_ONLY",
    };
  }
}
