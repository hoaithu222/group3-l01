/**
 * Barrel CÔNG KHAI của module `moderation` (p4-01) — module khác có ĐÍCH BÁO CÁO riêng (bộ học `STUDY_SET`; sau này
 * PORTFOLIO/COMPANY/JOB_OFFER/MENTOR_POST) import từ đây thay vì file nội bộ, cùng cơ chế `@modules/messages/public`.
 *
 * `createReportPort()` → `ReportPort` (`@shared/ports/report.port`): `submit` (báo cáo idempotent theo người × đích) và
 * `closeOpenByTarget` (đóng báo cáo mở khi nội dung đã bị ẩn/gỡ). Chiều ngược lại — module sở hữu đích cho `moderation` biết
 * cách tra/đếm đích — đi qua `registerReportTargetExtension` cùng file port đó, KHÔNG qua barrel này.
 */
import type { ReportPort } from "../../shared/ports/report.port";
import { reportPort } from "./moderation.container";

export function createReportPort(): ReportPort {
  return reportPort;
}
