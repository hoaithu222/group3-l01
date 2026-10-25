import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils, type CursorMeta } from "../../../core/utils/response";
import { encodeCursor, decodeCursor } from "../../../core/utils/cursor";
import type { MessageInteractionService } from "../services/message-interaction.service";
import type { MessageForwardService } from "../services/message-forward.service";
import type { PinsQueryService } from "../services/pins-query.service";
import type { PinsQueryDto } from "../dtos/pins-query.dto";
import type { ForwardMessageDto } from "../dtos/forward-message.dto";
import type { ReactionsListQueryDto } from "../dtos/list-messages.dto";
import type { MessageScopeTypeValue } from "../entities/message.interface";

/** be.md §4 — `message-interaction.controller.ts` (hide/reactions/pins/forward). */
export function createMessageInteractionController(
  service: MessageInteractionService,
  forwardService: MessageForwardService,
  pinsService: PinsQueryService
) {
  const hide = catchAsync(async (req: Request, res: Response) => {
    const result = await service.hide(req.user!, req.params.id);
    ResponseUtils.success(res, result);
  });

  const unhide = catchAsync(async (req: Request, res: Response) => {
    const result = await service.unhide(req.user!, req.params.id);
    ResponseUtils.success(res, result);
  });

  const react = catchAsync(async (req: Request, res: Response) => {
    const result = await service.react(req.user!, req.params.id, req.params.emoji);
    ResponseUtils.success(res, result);
  });

  const unreact = catchAsync(async (req: Request, res: Response) => {
    const result = await service.unreact(req.user!, req.params.id, req.params.emoji);
    ResponseUtils.success(res, result);
  });

  const listReactors = catchAsync(async (req: Request, res: Response) => {
    const query = req.query as unknown as ReactionsListQueryDto;
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await service.listReactors(req.user!, req.params.id, {
      emoji: query.emoji,
      cursor: cursor?.at,
      limit: query.limit,
    });
    const last = rows[rows.length - 1];
    const hasMore = rows.length === query.limit;
    ResponseUtils.cursor(res, {
      data: rows,
      meta: {
        nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.userId) : null,
        hasMore,
        limit: query.limit,
      },
    });
  });

  const pin = catchAsync(async (req: Request, res: Response) => {
    const result = await service.pin(req.user!, req.params.id);
    ResponseUtils.success(res, result);
  });

  const unpin = catchAsync(async (req: Request, res: Response) => {
    const result = await service.unpin(req.user!, req.params.id);
    ResponseUtils.success(res, result);
  });

  /**
   * p1-09 §5.3 — `data` vẫn là mảng tin ghim (client p1-04 không đổi), thêm `meta` cursor
   * `{ nextCursor, hasMore, limit, total, max }` và mỗi phần tử có `pinnedByUser`.
   */
  const listPinned = catchAsync(async (req: Request, res: Response) => {
    const scopeType = req.params.scopeType as MessageScopeTypeValue;
    const scopeId = req.params.scopeId;
    const page = await pinsService.list(req.user!, scopeType, scopeId, req.query as unknown as PinsQueryDto);
    const meta: CursorMeta & { total: number; max: number } = page.meta;
    ResponseUtils.cursor(res, { data: page.data, meta });
  });

  const forward = catchAsync(async (req: Request, res: Response) => {
    const dto = req.body as ForwardMessageDto;
    const result = await forwardService.forward(req.user!, req.params.id, dto);
    ResponseUtils.success(res, result);
  });

  return { hide, unhide, react, unreact, listReactors, pin, unpin, listPinned, forward };
}
