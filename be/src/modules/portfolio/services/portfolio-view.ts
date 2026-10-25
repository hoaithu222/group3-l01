import type { PortfolioProject, PortfolioSection, PortfolioSectionKind } from "../entities/portfolio.interface";

export { safeHttpsUrl } from "../entities/portfolio.rules";

/** Hàm THUẦN dựng dữ liệu hiển thị của trang công khai (số liệu, đồng đội, đoạn văn, URL an toàn) — tách khỏi Eta để test quyền riêng tư (CR-04/CR-31/CR-33). */
export interface RenderStat {
  label: string;
  value: string;
}

export interface RenderProject {
  title: string;
  summaryParagraphs: string[][];
  role: string | null;
  period: string | null;
  highlights: string[];
  coverUrl: string | null;
  coverAlt: string;
  stats: RenderStat[];
  contributionNote: string | null;
  teammatesHeading: string | null;
  /** Tên người đã đồng ý + "Đồng đội" cho người còn lại; RỖNG khi `showTeammates = false`. */
  teammateNames: string[];
  snapshotAtText: string;
}

export const TEAMMATE_PLACEHOLDER = "Đồng đội";

/** `620` → `"62"`, `625` → `"62,5"` (dấu phẩy thập phân tiếng Việt). */
export function formatX10(x10: number): string {
  const v = x10 / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(".", ",");
}

/** `dd/MM/yyyy HH:mm` theo giờ Việt Nam — cố định (không phụ thuộc locale máy chủ). */
export function formatDateTimeVN(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

/** `MM/yyyy` theo giờ Việt Nam. */
export function formatMonthYear(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", month: "2-digit", year: "numeric" }).formatToParts(d);
  return `${parts.find((p) => p.type === "month")?.value ?? ""}/${parts.find((p) => p.type === "year")?.value ?? ""}`;
}

export function formatPeriod(from: Date | null, to: Date | null): string | null {
  if (from && to) return `${formatMonthYear(from)} – ${formatMonthYear(to)}`;
  if (from) return `Từ ${formatMonthYear(from)}`;
  if (to) return `Đến ${formatMonthYear(to)}`;
  return null;
}

/** Văn bản → đoạn (ngăn bởi dòng trống) → dòng. KHÔNG nhận HTML: xuống dòng thành `<br>` ở template, mọi ký tự khác được Eta thoát. */
export function toParagraphs(text: string | null): string[][] {
  if (!text) return [];
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((para) => para.split("\n").map((l) => l.trim()).filter((l) => l.length > 0))
    .filter((lines) => lines.length > 0);
}

/** Dự án → dữ liệu hiển thị. `showTeammates=false` ⇒ KHÔNG BAO GIỜ có tên đồng đội (kể cả khi snapshot còn lưu — kiểm lại lúc render). */
export function buildProjectView(p: PortfolioProject, opts: { coverUrl: string | null; snapshotAtText: string }): RenderProject {
  const s = p.snapshot;
  const stats: RenderStat[] = [
    { label: "Task hoàn thành", value: `${s.tasksDone} task` },
    { label: "Story points", value: `${formatX10(s.storyPointsX10)} điểm` },
  ];
  if (s.onTimeRatePct !== null) stats.push({ label: "Đúng hạn", value: `${s.onTimeRatePct}%` });
  if (s.contributionPctX10 !== null) stats.push({ label: "Điểm đóng góp", value: `${formatX10(s.contributionPctX10)}/100` });
  if (s.contributionShareX10 !== null) stats.push({ label: "Chiếm khối lượng nhóm", value: `${formatX10(s.contributionShareX10)}%` });
  if (s.peerReviewAvgX10 !== null) stats.push({ label: "Điểm review trung bình", value: `${formatX10(s.peerReviewAvgX10)}/10` });
  stats.push({ label: "Tệp đã tải lên", value: `${s.filesUploaded} tệp` });

  const hasContribution = s.contributionPctX10 !== null || s.contributionShareX10 !== null;
  const named = p.showTeammates ? s.namedTeammates : [];
  const anonymousCount = p.showTeammates ? Math.max(0, s.teammatesCount - named.length) : 0;
  return {
    title: p.title,
    summaryParagraphs: toParagraphs(p.summary),
    role: p.role,
    period: formatPeriod(p.periodFrom, p.periodTo),
    highlights: [...p.highlights],
    coverUrl: opts.coverUrl,
    coverAlt: `Ảnh bìa dự án ${p.title}`,
    stats,
    contributionNote: hasContribution
      ? "Điểm đóng góp (thang 0–100) tổng hợp từ khối lượng thẻ (story points), tỉ lệ đúng hạn và điểm chấm chéo theo công thức của hệ thống; các số gốc ở trên."
      : null,
    teammatesHeading: s.teammatesCount > 0 ? `Làm cùng ${s.teammatesCount} đồng đội` : null,
    teammateNames: [...named, ...Array.from({ length: anonymousCount }, () => TEAMMATE_PLACEHOLDER)],
    snapshotAtText: opts.snapshotAtText,
  };
}

export interface SectionContent {
  hasAbout: boolean;
  hasProjects: boolean;
  hasSkills: boolean;
  hasContact: boolean;
}

const HAS: Record<PortfolioSectionKind, (c: SectionContent) => boolean> = {
  ABOUT: (c) => c.hasAbout,
  PROJECTS: (c) => c.hasProjects,
  SKILLS: (c) => c.hasSkills,
  CONTACT: (c) => c.hasContact,
};

/** Mục đang bật, theo `order` tăng dần. */
export const visibleSections = (sections: readonly PortfolioSection[]): PortfolioSection[] => sections.filter((s) => s.visible).sort((a, b) => a.order - b.order);

/** Mục đang bật VÀ có nội dung — thứ tự hiển thị của trang. */
export const sectionsWithContent = (sections: readonly PortfolioSection[], content: SectionContent): PortfolioSectionKind[] =>
  visibleSections(sections)
    .filter((s) => HAS[s.kind](content))
    .map((s) => s.kind);

/** Mục đang bật nhưng CHƯA có nội dung — `details.emptySections` của `PORT_010` để client chỉ đúng việc cần làm. */
export const emptyVisibleSections = (sections: readonly PortfolioSection[], content: SectionContent): PortfolioSectionKind[] =>
  visibleSections(sections)
    .filter((s) => !HAS[s.kind](content))
    .map((s) => s.kind);

export const SECTION_HEADINGS: Record<PortfolioSectionKind, string> = { ABOUT: "Giới thiệu", PROJECTS: "Dự án", SKILLS: "Kỹ năng đã được xác thực", CONTACT: "Liên hệ" };
