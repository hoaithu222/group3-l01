import type { PortfolioSection, PortfolioSectionKind } from '../api/portfolio.types';

/** Mặc định của BE (`DEFAULT_SECTIONS`) khi tạo hồ sơ lần đầu — bốn mục đều BẬT, đúng thứ tự Giới thiệu → Dự án → Kỹ năng → Liên hệ. */
export const DEFAULT_SECTIONS: readonly PortfolioSection[] = [
  { kind: 'ABOUT', order: 0, visible: true },
  { kind: 'PROJECTS', order: 1, visible: true },
  { kind: 'SKILLS', order: 2, visible: true },
  { kind: 'CONTACT', order: 3, visible: true },
];

/** Theo `order`; hai mục trùng `order` giữ thứ tự gốc (sort ổn định) — không bao giờ mất mục. */
export const sortedSections = (sections: readonly PortfolioSection[]): PortfolioSection[] =>
  [...sections].sort((a, b) => a.order - b.order);

/** Gán lại `order` = chỉ số (0..n-1): BE chỉ nhận `order` số nguyên 0–10, và mảng LUÔN đủ 4 mục mỗi loại đúng một lần. */
const renumber = (sections: readonly PortfolioSection[]): PortfolioSection[] =>
  sections.map((section, index) => ({ ...section, order: index }));

export function toggleSection(
  sections: readonly PortfolioSection[],
  kind: PortfolioSectionKind,
  visible: boolean,
): PortfolioSection[] {
  return sections.map((section) => (section.kind === kind ? { ...section, visible } : section));
}

/** Lên/xuống MỘT bậc bằng nút (không kéo thả — app.md §7); ra ngoài biên ⇒ giữ nguyên. */
export function moveSection(
  sections: readonly PortfolioSection[],
  kind: PortfolioSectionKind,
  direction: -1 | 1,
): PortfolioSection[] {
  const list = sortedSections(sections);
  const from = list.findIndex((section) => section.kind === kind);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= list.length) return renumber(list);
  [list[from], list[to]] = [list[to] as PortfolioSection, list[from] as PortfolioSection];
  return renumber(list);
}

/** Hai bản khác nhau về bật/tắt hoặc thứ tự? (để bật nút Lưu). */
export function sectionsEqual(
  a: readonly PortfolioSection[],
  b: readonly PortfolioSection[],
): boolean {
  const left = sortedSections(a);
  const right = sortedSections(b);
  return (
    left.length === right.length &&
    left.every((s, i) => s.kind === right[i]?.kind && s.visible === right[i]?.visible)
  );
}
