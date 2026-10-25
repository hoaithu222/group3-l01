import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { LocalStorage } from "../../../infrastructure/storage";
import type { DisplayImageQuery } from "../dtos/asset-url.dto";
import type { DisplayImageService } from "../services/display-image.service";

export function createDisplayImageController(service: DisplayImageService) {
  /**
   * `private` — CDN/proxy dùng chung không giữ ảnh/bản chuyển hướng của ảnh nhóm; trình duyệt/`expo-image` vẫn cache
   * theo URL (URL giữ nguyên trong cùng một ngày).
   */
  const image = catchAsync(async (req: Request, res: Response) => {
    const query = req.query as unknown as DisplayImageQuery;
    const result = await service.resolve(req.params.id, query);
    // Chỉ gắn `max-age` vào phản hồi THÀNH CÔNG: đặt trước `readFile` thì lỗi đọc tệp (500 JSON) cũng mang `max-age` tới 2 ngày
    // (errorHandler không xoá header) ⇒ client có thể cache lỗi dưới URL ảnh tới khi URL hết hạn.
    const cacheControl = `private, max-age=${String(result.maxAgeSeconds)}`;
    if (result.kind === "redirect") {
      res.set("Cache-Control", cacheControl);
      res.redirect(302, result.url);
      return;
    }
    const buffer = await new LocalStorage().readFile(result.storageKey);
    res.set("Cache-Control", cacheControl);
    res.setHeader("Content-Type", result.mime);
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.send(buffer);
  });

  return { image };
}
