import { z } from "zod";

/**
 * `GET /admin/overview` chỉ hỗ trợ `range=7d` ở Phase 0 (đủ cho KPI ngày mới
 * tạo + chuỗi người dùng hoạt động 7 ngày). Mở rộng `enum` khi admin cần thêm
 * khoảng thời gian khác.
 */
export const overviewQuerySchema = z.object({
  range: z.enum(["7d"]).default("7d"),
});

export type OverviewQuery = z.infer<typeof overviewQuerySchema>;

/**
 * `GET /admin/overview/insights` — schema RIÊNG (không nới `overviewQuerySchema`) để `GET /admin/overview?range=30d` vẫn bị từ chối như cũ:
 * endpoint đó chỉ tính đúng 7 ngày. Mặc định `30d`; `range` lạ → 400 `ValidationError`.
 */
export const insightsQuerySchema = z.object({
  range: z.enum(["7d", "30d", "90d"]).default("30d"),
});

export type InsightsQuery = z.infer<typeof insightsQuerySchema>;
