import { z } from "zod";

/** `GET /admin/notifications/stats?range=24h|7d` (p1-07 be.md §4). */
export const notificationStatsQuerySchema = z.object({
  range: z.enum(["24h", "7d"]).default("24h"),
});
export type NotificationStatsQuery = z.infer<typeof notificationStatsQuerySchema>;
