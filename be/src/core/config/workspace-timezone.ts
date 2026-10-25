/**
 * @file workspace-timezone.ts
 * @description Múi giờ tính "ngày" của MỘT nhóm (đồng bộ chéo #9): `Workspace.timezone` (IANA, do OWNER/ADMIN đặt) → mặc định hệ thống. Dùng chung cho
 * chi tiết nhóm (`effectiveTimezone`), báo cáo đóng góp/heatmap (p4-06) và dời lịch/Gantt (p4-04) — không nơi nào tự suy lại chuỗi ưu tiên.
 */
import { DEFAULT_TIME_ZONE } from "../utils/local-date";
import { isValidIanaTimeZone } from "../utils/timezone";
import { env } from "./env.schema";
import { runtimeConfig } from "./runtime-config";

/**
 * Múi giờ mặc định của HỆ THỐNG khi nhóm chưa đặt: `SystemConfig pm.timezone` (hợp lệ) → env `CRON_TZ` (hợp lệ) → `Asia/Ho_Chi_Minh`.
 * Không ném lỗi (đọc cấu hình lỗi → rơi về `CRON_TZ`/mặc định) để tính ngày không bao giờ làm hỏng request.
 */
export async function systemDefaultTimeZone(): Promise<string> {
  try {
    const pm: Record<string, unknown> = await runtimeConfig.getEffective("pm");
    const tz = pm["timezone"];
    if (typeof tz === "string" && isValidIanaTimeZone(tz)) return tz;
  } catch {
    /* rơi xuống CRON_TZ */
  }
  return isValidIanaTimeZone(env.CRON_TZ) ? env.CRON_TZ : DEFAULT_TIME_ZONE;
}

/** Múi giờ hiệu lực của nhóm: `Workspace.timezone` hợp lệ, ngược lại `systemDefault` (giá trị null/lạ trong dữ liệu cũ không bao giờ làm ném lỗi ở `Intl`). */
export function effectiveWorkspaceTimeZone(workspaceTimezone: string | null | undefined, systemDefault: string): string {
  return workspaceTimezone && isValidIanaTimeZone(workspaceTimezone) ? workspaceTimezone : systemDefault;
}
