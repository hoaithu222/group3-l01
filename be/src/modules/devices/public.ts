/**
 * Barrel CÔNG KHAI của module `devices` — NGOẠI LỆ CÓ CHỦ ĐÍCH của luật
 * "modules KHÔNG import chéo module" (`.claude/rules/architecture.md` mục
 * "Shared module services"), giống `@modules/assets/public`. Module khác cần
 * biết/thao tác `DeviceToken` (hiện tại: `auth` — logout → `unregister()`;
 * `notifications` — push pipeline → `getActiveFcmTokens`/`getActiveVoipTokens`/
 * `hasActiveDevice`/`revokeTokens`) PHẢI import TỪ ĐÂY, KHÔNG import trực tiếp
 * file trong `services/`/`repositories/`.
 *
 * DI: dùng `createDeviceService()` để tự nối dây (giống
 * `createAssetLinkService()`) trong `{module}.routes.ts`/`{module}.jobs.ts`
 * của module gọi — KHÔNG có DI container trong codebase này.
 */
import { DeviceService } from "./services/device.service";
import { PrismaDeviceRepository } from "./repositories/device.repository.prisma";

export { DeviceService, type VoipTokenRow } from "./services/device.service";
export type { IDeviceRepository } from "./repositories/device.repository.interface";
export { PrismaDeviceRepository } from "./repositories/device.repository.prisma";
export type {
  DeviceToken,
  DevicePlatform,
  DeviceTokenKind,
  ApnsEnvironmentValue,
  RegisterDeviceInput,
  RegisterDeviceResult,
  ActiveDeviceSummary,
  RevokeReason,
} from "./entities/device.interface";

/** Factory tiện dụng — wiring mặc định (Prisma) cho module khác dùng ngay. */
export function createDeviceService(): DeviceService {
  return new DeviceService(new PrismaDeviceRepository());
}
