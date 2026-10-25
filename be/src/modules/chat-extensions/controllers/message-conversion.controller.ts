import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { ChatExtensionsContainer } from "../chat-extensions.container";
import type { ToResourceDto, ToTaskDto } from "../dtos";

const actor = (req: Request) => req.user!;

export function createMessageConversionController(c: Pick<ChatExtensionsContainer, "conversion">) {
  const toTask = catchAsync(async (req: Request, res: Response) => {
    // `Idempotency-Key` đã bắt buộc ở route (`idempotencyKey({ required: true })`) — dùng làm khoá tạo thẻ để bấm hai lần không sinh hai thẻ.
    const requestId = req.header("Idempotency-Key") as string;
    const result = await c.conversion.toTask(actor(req), req.params.messageId, req.body as ToTaskDto, requestId);
    if (!result.created) res.setHeader("Idempotent-Replayed", "true");
    ResponseUtils.success(res, { task: result.task, sourceRef: result.sourceRef }, result.created ? "Đã tạo công việc từ tin nhắn" : "Thành công", result.created ? 201 : 200);
  });

  const toResource = catchAsync(async (req: Request, res: Response) => {
    const result = await c.conversion.toResource(actor(req), req.params.messageId, req.body as ToResourceDto);
    ResponseUtils.success(res, { resources: result.resources, sourceRefs: result.sourceRefs }, "Đã lưu tệp vào tài liệu", 201);
  });

  return { toTask, toResource };
}
