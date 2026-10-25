import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync";
import { ResponseUtils } from "../../core/utils/response";
import type { MediaDevService } from "./media-dev.service";
import type { SpikeTokenDto } from "./media-dev.validators";

export function createMediaDevController(service: MediaDevService) {
  const spikeToken = catchAsync(async (req: Request, res: Response) => {
    const result = await service.issueSpikeToken(req.user!, req.body as SpikeTokenDto);
    ResponseUtils.success(res, result, "Đã cấp token phòng spike");
  });
  return { spikeToken };
}
