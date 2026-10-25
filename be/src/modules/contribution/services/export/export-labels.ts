import type { ContributionWeights } from "../../../../core/constants/contribution";
import { normalizeSearch } from "../../../../core/utils/normalize";
import { addDaysToLocalDate, localDate, localParts } from "../../../../core/utils/local-date";
import type { Period } from "../period";

const pad = (n: number): string => String(n).padStart(2, "0");

/** "dd/MM" của một ngày `YYYY-MM-DD`. */
export const dayLabel = (dayKey: string): string => `${dayKey.slice(8, 10)}/${dayKey.slice(5, 7)}`;

/** "dd/MM/yyyy HH:mm" của `instant` theo `tz`. */
export function dateTimeLabel(instant: Date, tz: string): string {
  const p = localParts(instant, tz);
  return `${pad(p.day)}/${pad(p.month)}/${p.year} ${pad(p.hour)}:${pad(p.minute)}`;
}

/** "10:32 15/09" — dùng cho câu "Trọng số đổi lúc …". */
export function shortDateTimeLabel(instant: Date, tz: string): string {
  const p = localParts(instant, tz);
  return `${pad(p.hour)}:${pad(p.minute)} ${pad(p.day)}/${pad(p.month)}`;
}

export const weightsLabel = (w: ContributionWeights): string => `${w.points}/${w.onTime}/${w.peer}`;

/** "Toàn bộ thời gian" · "Tháng 09/2026" · "Tuần 37/2026 (07/09 – 13/09)". */
export function periodLabel(period: Period, tz: string): string {
  if (period.kind === "ALL" || !period.from || !period.to) return "Toàn bộ thời gian";
  if (period.kind === "MONTH") return `Tháng ${period.key.slice(7)}/${period.key.slice(2, 6)}`;
  const first = localDate(period.from, tz);
  const last = addDaysToLocalDate(localDate(period.to, tz), -1);
  const [year, week] = period.key.slice(2).split("-W");
  return `Tuần ${Number(week)}/${year} (${dayLabel(first)} – ${dayLabel(last)})`;
}

/** Tên tệp ASCII an toàn: `dong-gop-<tên-bảng>-<kỳ>.pdf`. */
export function exportFileName(boardName: string, periodKey: string): string {
  const slug = normalizeSearch(boardName).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "bang";
  const period = periodKey.replace(/^[MW]:/, "").toLowerCase();
  return `dong-gop-${slug}-${period}.pdf`;
}
