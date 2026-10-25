/** Token nhắc tên lưu kèm bình luận — chỉ USER (p1-06 `@{u:<id>}`); `@all`/`@role` không hỗ trợ ở bình luận thẻ. */
export interface CommentMention {
  type: "USER";
  targetId: string;
}

export interface TaskComment {
  id: string;
  taskId: string;
  boardId: string;
  workspaceId: string;
  authorId: string;
  clientCommentId: string;
  content: string;
  mentions: CommentMention[];
  attachmentCount: number;
  editedAt: Date | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  deleteReason: string | null;
  version: number;
  createdAt: Date;
}

export interface TaskCommentCreateInput {
  id: string;
  taskId: string;
  boardId: string;
  workspaceId: string;
  authorId: string;
  clientCommentId: string;
  content: string;
  mentions: CommentMention[];
  attachmentCount: number;
}

export interface TaskCommentEditSet {
  content: string;
  mentions: CommentMention[];
  editedAt: Date;
}

export interface TaskCommentTombstone {
  deletedAt: Date;
  deletedBy: string;
  /** Chỉ có khi xoá bình luận của người khác (bắt buộc lúc đó). */
  deleteReason: string | null;
}

/** Trang cursor `(createdAt desc, id desc)`. */
export interface TaskCommentPage {
  items: TaskComment[];
  hasMore: boolean;
}
