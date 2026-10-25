import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { AppError, UnauthorizedError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import { readClientPlatform, readDeviceIdHeader } from "../../../core/auth/client-platform";
import type { BiometricService } from "../services/biometric.service";
import type { BiometricEnrollDto, BiometricLoginDto } from "../dtos/biometric.dto";

export function createBiometricController(biometricService: BiometricService) {
  /** POST /auth/biometric/enroll */
  const enroll = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Chưa đăng nhập", ErrorCode.AUTH_002);
    const { password, deviceId, platform, deviceName, biometryKind } = req.body as BiometricEnrollDto;
    const result = await biometricService.enroll(req.user.id, password, {
      deviceId,
      platform,
      deviceName,
      biometryKind,
    });
    // Bí mật chỉ trả về DUY NHẤT 1 LẦN — không được cache ở bất kỳ tầng nào.
    res.setHeader("Cache-Control", "no-store");
    ResponseUtils.success(res, result, "Đăng ký sinh trắc học thành công", 201);
  });

  /** POST /auth/biometric/login — luôn trả token trong body (không set-cookie), bắt buộc header X-Client-Platform. */
  const login = catchAsync(async (req: Request, res: Response) => {
    const platform = readClientPlatform(req);
    if (!platform) {
      throw new AppError(
        "Thiếu thông tin nền tảng ứng dụng",
        400,
        ErrorCode.AUTH_017
      );
    }

    const { credentialId, deviceId, nonce, hmac } = req.body as BiometricLoginDto;
    const result = await biometricService.login({
      credentialId,
      deviceId,
      nonce,
      hmac,
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip,
    });

    res.setHeader("Cache-Control", "no-store");
    ResponseUtils.success(
      res,
      {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        tokenType: "Bearer",
        user: result.user,
        biometric: result.biometric,
      },
      "Đăng nhập sinh trắc học thành công"
    );
  });

  /** GET /auth/biometric/credentials */
  const listMine = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Chưa đăng nhập", ErrorCode.AUTH_002);
    const currentDeviceId = readDeviceIdHeader(req);
    const list = await biometricService.listMine(req.user.id, currentDeviceId);
    ResponseUtils.success(res, list, "Danh sách đăng nhập sinh trắc học");
  });

  /** DELETE /auth/biometric/credentials/:id */
  const revokeMine = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Chưa đăng nhập", ErrorCode.AUTH_002);
    const { reason } = req.query as { reason: "USER_DISABLED" | "ACCOUNT_SWITCHED" };
    await biometricService.revokeMine(req.user.id, req.params.id, reason);
    ResponseUtils.success(res, { revoked: true }, "Đã thu hồi đăng nhập sinh trắc học");
  });

  return { enroll, login, listMine, revokeMine };
}
