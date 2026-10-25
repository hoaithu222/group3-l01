import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { ChatExtensionsContainer } from "../chat-extensions.container";
import type { CreateScheduledDto, ListMyScheduledQueryDto, UpdateScheduledDto } from "../dtos";
import type { ChatScopeType } from "../entities/chat-extensions.types";

const actor = (req: Request) => req.user!;

export function createScheduledMessageController(c: Pick<ChatExtensionsContainer, "scheduled">) {
  const create = catchAsync(async (req: Request, res: Response) => {
    const { scopeType, scopeId } = req.params;
    ResponseUtils.success(res, await c.scheduled.create(actor(req), scopeType as ChatScopeType, scopeId, req.body as CreateScheduledDto), "Đã hẹn giờ gửi tin", 201);
  });

  const listMine = catchAsync(async (req: Request, res: Response) => {
    const page = await c.scheduled.listMine(actor(req), req.query as unknown as ListMyScheduledQueryDto);
    ResponseUtils.cursor(res, { data: page.data, meta: { nextCursor: page.nextCursor, hasMore: page.hasMore, limit: page.limit } });
  });

  const update = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.scheduled.update(actor(req), req.params.id, req.body as UpdateScheduledDto), "Đã cập nhật tin hẹn giờ");
  });

  const cancel = catchAsync(async (req: Request, res: Response) => {
    await c.scheduled.cancel(actor(req), req.params.id);
    res.status(204).end();
  });

  const sendNow = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.scheduled.sendNow(actor(req), req.params.id), "Đã gửi tin");
  });

  return { create, listMine, update, cancel, sendNow };
}
