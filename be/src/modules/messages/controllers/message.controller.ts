import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { MessageService } from "../services/message.service";
import type {
  DeleteMessageDto,
  EditMessageDto,
  ListMessagesQueryDto,
  SendMessageDto,
} from "../dtos";
import type { MessageScopeTypeValue } from "../entities/message.interface";

/** be.md §4 — `message.controller.ts` (list/send/get/edit/recall). */
export function createMessageController(service: MessageService) {
  const list = catchAsync(async (req: Request, res: Response) => {
    const scopeType = req.params.scopeType as MessageScopeTypeValue;
    const scopeId = req.params.scopeId;
    const query = req.query as unknown as ListMessagesQueryDto;
    const result = await service.list(req.user!, scopeType, scopeId, query);
    res.status(200).json({
      success: true,
      message: "Thành công",
      data: result.data,
      meta: result.cursor,
      ...(result.anchorMessageId && { anchorMessageId: result.anchorMessageId }),
      timestamp: new Date().toISOString(),
    });
  });

  const send = catchAsync(async (req: Request, res: Response) => {
    const scopeType = req.params.scopeType as MessageScopeTypeValue;
    const scopeId = req.params.scopeId;
    const dto = req.body as SendMessageDto;
    const result = await service.send(req.user!, scopeType, scopeId, dto);
    if (result.replayed) {
      res.setHeader("Idempotent-Replayed", "true");
      ResponseUtils.success(res, result.view, "Thành công", 200);
      return;
    }
    ResponseUtils.success(res, result.view, "Đã gửi tin nhắn", 201);
  });

  const get = catchAsync(async (req: Request, res: Response) => {
    const view = await service.get(req.user!, req.params.id);
    ResponseUtils.success(res, view);
  });

  const edit = catchAsync(async (req: Request, res: Response) => {
    const dto = req.body as EditMessageDto;
    const view = await service.edit(req.user!, req.params.id, dto);
    ResponseUtils.success(res, view, "Đã cập nhật tin nhắn");
  });

  const recall = catchAsync(async (req: Request, res: Response) => {
    const body = req.body as DeleteMessageDto;
    const result = await service.recall(req.user!, req.params.id, body?.reason);
    ResponseUtils.success(res, result, "Đã thu hồi tin nhắn");
  });

  return { list, send, get, edit, recall };
}
