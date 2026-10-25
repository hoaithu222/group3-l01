import { z } from "zod";
import { DEVICE_PLATFORMS, DEVICE_TOKEN_KINDS, APNS_ENVIRONMENTS } from "../entities/device.interface";

/**
 * be.md §3 — `environment` bắt buộc khi `kind=APNS_VOIP` (và bắt buộc
 * `platform=IOS`, VoIP không tồn tại trên Android/Web).
 */
export const registerDeviceSchema = z
  .object({
    deviceId: z.string().min(8).max(64),
    platform: z.enum(DEVICE_PLATFORMS),
    kind: z.enum(DEVICE_TOKEN_KINDS),
    token: z.string().min(20).max(4096),
    bundleId: z.string().max(128).optional(),
    environment: z.enum(APNS_ENVIRONMENTS).optional(),
    appVersion: z.string().max(32).optional(),
    locale: z.string().max(16).optional(),
  })
  .refine((v) => v.kind !== "APNS_VOIP" || (v.platform === "IOS" && !!v.environment), {
    message: "APNS_VOIP bắt buộc platform=IOS và environment",
    path: ["environment"],
  });

export type RegisterDeviceDto = z.infer<typeof registerDeviceSchema>;
