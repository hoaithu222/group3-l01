import { AppError, ValidationError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { parseMarkers } from "../../mentions/public";
import type { CommentMention } from "../entities/task-comment.interface";
import type { IProjectDirectory } from "../repositories/project-directory.interface";

export interface ValidatedMentions {
  /** Đã khử trùng, id chữ thường. */
  mentions: CommentMention[];
}

/**
 * Kiểm lời nhắc tên trong bình luận thẻ, dùng ĐÚNG token của p1-06 (`@{u:<userId>}` trong `content` + `mentions[]`) — không
 * tạo cơ chế mới:
 *  1. chỉ hỗ trợ `@user` (không `@all`/`@role`);
 *  2. mọi người được nhắc (khai báo HOẶC có marker) phải là thành viên ACTIVE MEMBER+ của workspace (GUEST/người ngoài →
 *     `TASK_014 { invalidMentions: [id…] }`, không lộ ai đúng/sai ngoài id do chính người gửi khai);
 *  3. `mentions[]` khớp 1-1 với marker trong `content` (không cho nhắc "vô hình" để gửi thông báo mà không hiện trong nội dung).
 */
export async function validateTaskMentions(input: {
  content: string;
  mentions: CommentMention[];
  workspaceId: string;
  directory: IProjectDirectory;
}): Promise<ValidatedMentions> {
  const markers = parseMarkers(input.content);
  if (markers.some((m) => m.type !== "USER")) {
    throw new ValidationError("Bình luận trên thẻ không hỗ trợ @all hoặc @vai trò", { mentions: ["Chỉ hỗ trợ nhắc từng thành viên"] });
  }

  const fromMarkers = new Set(markers.map((m) => (m.targetId as string).toLowerCase()));
  const declared = [...new Set(input.mentions.map((m) => m.targetId.toLowerCase()))];
  const everyone = [...new Set([...declared, ...fromMarkers])];

  if (everyone.length > 0) {
    const members = await input.directory.activeMemberIds(input.workspaceId, everyone);
    const invalid = everyone.filter((id) => !members.has(id));
    if (invalid.length > 0) {
      throw new AppError(ErrorMessages[ErrorCode.TASK_014], 400, ErrorCode.TASK_014, { invalidMentions: invalid });
    }
  }

  const consistent = declared.length === fromMarkers.size && declared.every((id) => fromMarkers.has(id));
  if (!consistent) {
    throw new ValidationError("Danh sách nhắc tên không khớp nội dung bình luận", { mentions: ["Không khớp với marker @{u:…} trong nội dung"] });
  }
  return { mentions: declared.map((targetId) => ({ type: "USER" as const, targetId })) };
}
