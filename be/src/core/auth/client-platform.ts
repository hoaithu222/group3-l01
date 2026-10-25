import type { Request } from "express";
import { z } from "zod";
import { ValidationError } from "../exceptions";

/** Giá trị hợp lệ cho header `X-Client-Platform` — app di động (không phải web). */
export const clientPlatformHeaderSchema = z.enum(["ANDROID", "IOS"]);
export type ClientPlatform = z.infer<typeof clientPlatformHeaderSchema>;

/**
 * Đọc + kiểm header `X-Client-Platform`.
 *
 * `undefined` ⇒ client web (giữ hành vi cookie httpOnly hiện có).
 * `"ANDROID" | "IOS"` ⇒ app di động (không có cookie jar bền — trả
 * accessToken + refreshToken trong body, KHÔNG set-cookie).
 *
 * Header có mặt nhưng sai giá trị ⇒ ném `ValidationError` (400 VAL_001) thay
 * vì lặng lẽ rơi về nhánh web — tránh app tưởng đã gửi đúng platform nhưng
 * thực ra bị bỏ qua.
 */
export function readClientPlatform(req: Request): ClientPlatform | undefined {
  const raw = req.header("X-Client-Platform");
  if (raw === undefined || raw === "") return undefined;
  const parsed = clientPlatformHeaderSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError("X-Client-Platform không hợp lệ (chỉ nhận ANDROID | IOS)");
  }
  return parsed.data;
}

/** Độ dài tối đa `deviceId` — khớp `deviceIdSchema` (body) và `registerDeviceSchema` (p0-06). */
const DEVICE_ID_MAX_LENGTH = 64;

/**
 * Header `X-Device-Id` — id thiết bị app tự sinh 1 lần/lượt cài đặt. Trim; quá
 * `DEVICE_ID_MAX_LENGTH` ký tự ⇒ coi như không gửi (`undefined`) thay vì lưu
 * chuỗi tuỳ ý dài vào `Session.deviceId`/`DeviceToken` (header do client tự khai).
 */
export function readDeviceIdHeader(req: Request): string | undefined {
  const raw = req.header("X-Device-Id");
  const trimmed = raw?.trim();
  if (!trimmed || trimmed.length > DEVICE_ID_MAX_LENGTH) return undefined;
  return trimmed;
}
