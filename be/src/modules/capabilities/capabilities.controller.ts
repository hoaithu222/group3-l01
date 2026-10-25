import { createHash } from "crypto";
import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync";
import { ResponseUtils } from "../../core/utils/response";
import { buildCapabilities, type Capabilities } from "./capabilities.service";

/**
 * ETag của bản capabilities — băm NỘI DUNG hiệu lực (trừ `serverNow`, đổi mỗi request), KHÔNG chỉ `configVersion`.
 *
 * ⛔ `configVersion` chỉ là băm số phiên bản các khoá `SystemConfig`: nó KHÔNG đổi khi cờ đổi qua env (`FEATURE_FLAGS`),
 * qua mã (`AVAILABLE_MODULES`) hay hạ tầng (`meetingRecording.available`). ETag = `configVersion` thì client đã giữ bản cũ
 * nhận 304 mãi mãi và không bao giờ thấy cờ mới — app hiện "Tính năng này hiện chưa được bật" dù BE đã bật.
 */
export function capabilitiesEtag(capabilities: Capabilities): string {
  // `serverNow: undefined` bị `JSON.stringify` bỏ qua — loại trường đổi mỗi request khỏi phần băm.
  const stable = { ...capabilities, serverNow: undefined };
  return `"${createHash("sha1").update(JSON.stringify(stable)).digest("hex")}"`;
}

export function createCapabilitiesController() {
  const get = catchAsync(async (req: Request, res: Response) => {
    const capabilities = await buildCapabilities();
    const etag = capabilitiesEtag(capabilities);

    // Cache ngắn ở client (be.md p0-07 §4) — ETag đổi khi admin sửa `SystemConfig` (≤ SYSTEM_CONFIG_CACHE_MS) HOẶC cờ/giới hạn
    // hiệu lực đổi vì lý do khác (env, mã, hạ tầng); 304 rẻ hơn gửi lại toàn bộ payload khi client chỉ làm mới lúc foreground.
    res.setHeader("Cache-Control", "private, max-age=60");
    res.setHeader("ETag", etag);

    if (req.headers["if-none-match"] === etag) {
      res.status(304).end();
      return;
    }
    ResponseUtils.success(res, capabilities);
  });

  return { get };
}
