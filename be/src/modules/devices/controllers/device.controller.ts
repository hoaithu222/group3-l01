import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { UnauthorizedError } from "../../../core/exceptions";
import { readDeviceIdHeader } from "../../../core/auth/client-platform";
import type { DeviceService } from "../services/device.service";
import type { RegisterDeviceDto } from "../dtos/register-device.dto";

export function createDeviceController(deviceService: DeviceService) {
  const register = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const body = req.body as RegisterDeviceDto;
    const result = await deviceService.register({ userId: req.user.id, ...body });
    ResponseUtils.success(res, result, "Đã đăng ký thiết bị", 201);
  });

  const list = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const currentDeviceId = readDeviceIdHeader(req);
    const devices = await deviceService.listActive(req.user.id, currentDeviceId);
    ResponseUtils.success(res, devices, "Danh sách thiết bị");
  });

  const remove = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const revoked = await deviceService.unregister(req.user.id, req.params.deviceId);
    ResponseUtils.success(res, { revoked }, "Đã gỡ thiết bị");
  });

  return { register, list, remove };
}
