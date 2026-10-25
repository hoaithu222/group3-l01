import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { CursorQuery } from "../../../shared/dto/common-schemas";
import type { CreateCommentDto, DeleteCommentDto, MentionablesQueryDto, PatchCommentDto } from "../dtos";
import type { TaskCommentService } from "../services/task-comment.service";
import type { TaskFeedService } from "../services/task-feed.service";

const actor = (req: Request) => req.user!;
const cursorOf = (req: Request) => req.query as unknown as CursorQuery;

/** Bình luận + nhật ký hoạt động + gợi ý người (cùng "trang trao đổi" của thẻ). */
export function createTaskCommentController(comments: TaskCommentService, feed: TaskFeedService) {
  const listComments = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.cursor(res, await comments.list(actor(req), req.params.id, cursorOf(req)));
  });
  const createComment = catchAsync(async (req: Request, res: Response) => {
    const result = await comments.create(actor(req), req.params.id, req.body as CreateCommentDto);
    // Gửi lại cùng `clientCommentId` → 200 với bản cũ, không phải 201.
    ResponseUtils.success(res, result.comment, result.created ? "Đã gửi bình luận" : "Bình luận đã được gửi trước đó", result.created ? 201 : 200);
  });
  const updateComment = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await comments.update(actor(req), req.params.id, req.body as PatchCommentDto), "Đã sửa bình luận");
  });
  const removeComment = catchAsync(async (req: Request, res: Response) => {
    await comments.remove(actor(req), req.params.id, req.body as DeleteCommentDto);
    res.status(204).send();
  });
  const listActivity = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.cursor(res, await feed.activity(actor(req), req.params.id, cursorOf(req)));
  });
  const mentionables = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await feed.mentionables(actor(req), req.params.id, (req.query as unknown as MentionablesQueryDto).q));
  });
  return { listComments, createComment, updateComment, removeComment, listActivity, mentionables };
}
