import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { CursorMeta } from "../../../core/utils/response";
import type { CreateAnnouncementDto, ReceiptsQueryDto } from "../dtos";
import type { AnnouncementReceiptsService } from "../services/announcement-receipts.service";
import type { AnnouncementService } from "../services/announcement.service";

export function createAnnouncementController(service: AnnouncementService, receipts: AnnouncementReceiptsService) {
  const create = catchAsync(async (req: Request, res: Response) => {
    const { view, created } = await service.create(req.user!, req.params.messageId, req.body as CreateAnnouncementDto);
    ResponseUtils.success(res, view, created ? "Đã yêu cầu xác nhận đã đọc" : "Yêu cầu xác nhận đã có", created ? 201 : 200);
  });

  const cancel = catchAsync(async (req: Request, res: Response) => {
    await service.cancel(req.user!, req.params.messageId);
    res.status(204).send();
  });

  const confirm = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await service.confirm(req.user!, req.params.messageId), "Đã xác nhận đã đọc");
  });

  const get = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await service.get(req.user!, req.params.messageId));
  });

  const listByChannel = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await service.listByChannel(req.user!, req.params.channelId));
  });

  const listReceipts = catchAsync(async (req: Request, res: Response) => {
    const page = await receipts.list(req.user!, req.params.messageId, req.query as unknown as ReceiptsQueryDto);
    // `confirmedCount`/`audienceCount` là trường mở rộng của meta cursor chuẩn.
    const meta: CursorMeta & { confirmedCount: number; audienceCount: number } = page.meta;
    ResponseUtils.cursor(res, { data: page.data, meta });
  });

  return { create, cancel, confirm, get, listByChannel, listReceipts };
}
