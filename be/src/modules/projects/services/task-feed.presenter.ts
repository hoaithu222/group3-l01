import type { TaskActivity } from "../entities/task.interface";
import type { TaskComment } from "../entities/task-comment.interface";
import type { IProjectDirectory, UserSummary } from "../repositories/project-directory.interface";
import type { ITaskAttachmentRepository, TaskAttachmentRow } from "../repositories/task-attachment.repository.interface";
import type { ITaskAssetPort } from "./task-asset.port";

export interface ActorDto {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface TaskActivityDto {
  id: string;
  taskId: string;
  type: string;
  /** `null` = hệ thống (dời lịch tự động, job). */
  actor: ActorDto | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  at: string;
}

export interface AttachmentDto {
  assetId: string;
  originalName: string;
  mime: string;
  size: number | null;
  kind: string;
  /** URL ký ngắn hạn (≤ 60 s); `null` khi không có ảnh thu nhỏ. */
  thumbnailUrl: string | null;
  attachedBy: string;
  createdAt: string;
}

export interface TaskCommentDto {
  id: string;
  taskId: string;
  author: ActorDto;
  clientCommentId: string;
  /** Giữ marker `@{u:<id>}` (p1-06). Bình luận đã xoá: rỗng. */
  content: string;
  mentions: { type: "USER"; targetId: string; label: string }[];
  attachments: AttachmentDto[];
  attachmentCount: number;
  editedAt: string | null;
  deletedAt: string | null;
  version: number;
  createdAt: string;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

/** Người đã rời hệ thống vẫn giữ chỗ (tên rỗng) thay vì biến mất khỏi dòng nhật ký/bình luận. */
const actorOf = (id: string, users: Map<string, UserSummary>): ActorDto => users.get(id) ?? { id, name: "", avatarUrl: null };

/** Bản ghi ASSIGNED/UNASSIGNED chỉ lưu `userId` — thêm tên HIỆN TẠI khi trình bày để dòng nhật ký đọc được. */
function withName(value: Record<string, unknown> | null, users: Map<string, UserSummary>): Record<string, unknown> | null {
  const userId = value?.["userId"];
  if (!value || typeof userId !== "string") return value;
  const name = users.get(userId)?.name;
  return name ? { ...value, name } : value;
}

export async function presentActivities(items: TaskActivity[], directory: IProjectDirectory): Promise<TaskActivityDto[]> {
  const ids = new Set<string>();
  for (const a of items) {
    if (a.actorId) ids.add(a.actorId);
    for (const side of [a.before, a.after]) {
      const userId = side?.["userId"];
      if (typeof userId === "string") ids.add(userId);
    }
  }
  const users = await directory.userSummaries([...ids]);
  return items.map((a) => toActivityDto(a, users));
}

export function toActivityDto(a: TaskActivity, users: Map<string, UserSummary>): TaskActivityDto {
  const assignment = a.type === "ASSIGNED" || a.type === "UNASSIGNED";
  return {
    id: a.id,
    taskId: a.taskId,
    type: a.type,
    actor: a.actorId ? actorOf(a.actorId, users) : null,
    before: assignment ? withName(a.before, users) : a.before,
    after: assignment ? withName(a.after, users) : a.after,
    at: a.at.toISOString(),
  };
}

export function toAttachmentDto(row: TaskAttachmentRow, thumbs: Map<string, { url: string }>): AttachmentDto {
  return {
    assetId: row.assetId,
    originalName: row.originalName,
    mime: row.mime,
    size: row.size,
    kind: row.kind,
    thumbnailUrl: row.hasThumbnail ? (thumbs.get(row.assetId)?.url ?? null) : null,
    attachedBy: row.attachedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Ký thumbnail cho cả lô đúng MỘT lần (caller đã kiểm quyền đọc thẻ). */
export async function presentAttachments(rows: TaskAttachmentRow[], assets: ITaskAssetPort): Promise<AttachmentDto[]> {
  const thumbs = await assets.signThumbnails(rows.filter((r) => r.hasThumbnail).map((r) => r.assetId));
  return rows.map((r) => toAttachmentDto(r, thumbs));
}

export interface CommentPresentDeps {
  directory: IProjectDirectory;
  attachments: ITaskAttachmentRepository;
  assets: ITaskAssetPort;
}

/**
 * Dựng nhiều bình luận với ĐÚNG một lượt tra tên người (tác giả + người được nhắc) và một lượt tra tệp đính kèm
 * (không N+1). Bình luận đã xoá mềm chỉ trả khung (`deletedAt`) — KHÔNG lộ nội dung/tệp/nhắc tên.
 */
export async function presentComments(comments: TaskComment[], deps: CommentPresentDeps): Promise<TaskCommentDto[]> {
  const live = comments.filter((c) => c.deletedAt === null);
  const userIds = new Set<string>(comments.map((c) => c.authorId));
  for (const c of live) for (const m of c.mentions) userIds.add(m.targetId);

  const [users, files] = await Promise.all([
    deps.directory.userSummaries([...userIds]),
    deps.attachments.listForComments(live.filter((c) => c.attachmentCount > 0).map((c) => c.id)),
  ]);
  const withThumb = [...files.values()].flat().filter((r) => r.hasThumbnail);
  const thumbs = await deps.assets.signThumbnails(withThumb.map((r) => r.assetId));

  return comments.map((c) => {
    const deleted = c.deletedAt !== null;
    return {
      id: c.id,
      taskId: c.taskId,
      author: actorOf(c.authorId, users),
      clientCommentId: c.clientCommentId,
      content: deleted ? "" : c.content,
      mentions: deleted ? [] : c.mentions.map((m) => ({ type: "USER" as const, targetId: m.targetId, label: users.get(m.targetId)?.name ?? "" })),
      attachments: deleted ? [] : (files.get(c.id) ?? []).map((r) => toAttachmentDto(r, thumbs)),
      attachmentCount: deleted ? 0 : c.attachmentCount,
      editedAt: iso(c.editedAt),
      deletedAt: iso(c.deletedAt),
      version: c.version,
      createdAt: c.createdAt.toISOString(),
    };
  });
}
