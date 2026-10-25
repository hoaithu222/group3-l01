import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { AppError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { MessageService } from "../../messages/public";
import type { ThreadService } from "../services/thread.service";
import type { ThreadQueryDto, SubscriptionDto, ThreadListQueryDto } from "../dtos";

/** be.md §4 — `GET /messages/:id/thread`, `/threads/:id`, `PUT subscription`, `GET /channels/:id/threads` (P1). */
export function createThreadController(threadService: ThreadService, messageService: MessageService) {
  const getByRootMessage = catchAsync(async (req: Request, res: Response) => {
    const rootId = req.params.id;
    const query = req.query as unknown as ThreadQueryDto;

    // `MessageService.get()` tự 404 nếu không tồn tại/không thấy được (be.md
    // §4 "404" chung cho endpoint này) — dùng LẠI, không tự query lại.
    const root = await messageService.get(req.user!, rootId);
    if (root.scopeType !== "CHANNEL") {
      throw new AppError(ErrorMessages[ErrorCode.MSG_018], 400, ErrorCode.MSG_018);
    }
    if (root.threadId !== null) {
      throw new AppError(ErrorMessages[ErrorCode.MSG_019], 400, ErrorCode.MSG_019);
    }

    const [thread, replies] = await Promise.all([
      threadService.getViewByParentMessageId(req.user!, rootId),
      messageService.list(req.user!, "CHANNEL", root.scopeId, { ...query, threadId: rootId }),
    ]);

    res.status(200).json({
      success: true,
      message: "Thành công",
      data: { root, thread, replies: replies.data },
      meta: replies.cursor,
      ...(replies.anchorMessageId && { anchorMessageId: replies.anchorMessageId }),
      timestamp: new Date().toISOString(),
    });
  });

  const getById = catchAsync(async (req: Request, res: Response) => {
    const view = await threadService.getView(req.user!, req.params.id);
    ResponseUtils.success(res, view);
  });

  const setSubscription = catchAsync(async (req: Request, res: Response) => {
    const dto = req.body as SubscriptionDto;
    const result = await threadService.setSubscription(req.user!, req.params.id, dto.state);
    ResponseUtils.success(res, result, "Đã cập nhật theo dõi luồng");
  });

  const listByChannel = catchAsync(async (req: Request, res: Response) => {
    const channelId = req.params.id;
    const query = req.query as unknown as ThreadListQueryDto;
    const result = await threadService.listByChannel(req.user!, channelId, query);
    ResponseUtils.cursor(res, result);
  });

  return { getByRootMessage, getById, setSubscription, listByChannel };
}
