import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { ChatExtensionsContainer } from "../chat-extensions.container";
import type { CreateReminderDto, ListMyRemindersQueryDto } from "../dtos";

const actor = (req: Request) => req.user!;

export function createMessageReminderController(c: Pick<ChatExtensionsContainer, "reminders">) {
  const create = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.reminders.create(actor(req), req.params.messageId, req.body as CreateReminderDto), "Đã đặt nhắc lại", 201);
  });

  const listMine = catchAsync(async (req: Request, res: Response) => {
    const page = await c.reminders.listMine(actor(req), req.query as unknown as ListMyRemindersQueryDto);
    ResponseUtils.cursor(res, { data: page.data, meta: { nextCursor: page.nextCursor, hasMore: page.hasMore, limit: page.limit } });
  });

  const cancel = catchAsync(async (req: Request, res: Response) => {
    await c.reminders.cancel(actor(req), req.params.id);
    res.status(204).end();
  });

  return { create, listMine, cancel };
}
