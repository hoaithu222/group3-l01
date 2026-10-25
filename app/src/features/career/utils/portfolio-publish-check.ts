import type { Portfolio } from '../api/portfolio.types';

export interface PublishChecklistItem {
  key: 'name' | 'preview' | 'projects';
  label: string;
  ok: boolean;
  /** `true` = thiếu thì KHÓA nút Công khai; `false` = chỉ khuyến nghị. */
  blocking: boolean;
}

export interface PublishCheckInput {
  displayName: string;
  /** Số dự án đang HIỆN (đã lọc `visible`). */
  visibleProjects: number;
  /** Đã mở "Xem trước" trong phiên này (khuyến nghị, không bắt buộc). */
  previewed: boolean;
}

/**
 * Checklist trước khi công khai (app.md p6-07 §3 `PublishSheet`): dự án đang hiện + tên hiển thị là BẮT BUỘC, đã xem trước chỉ KHUYẾN NGHỊ.
 * ⚠️ BE cho công khai khi BẤT KỲ mục nào có nội dung (giới thiệu, liên kết, huy hiệu cũng tính) và trả `PORT_010` nếu không — app chặn chặt hơn (cần ≥ 1 dự án) theo
 * kế hoạch vì trang portfolio "một chạm" sinh ra để đóng gói dự án; `PORT_010` vẫn được xử lý ở tấm nếu BE từ chối vì lý do khác.
 */
export function publishChecklist({
  displayName,
  previewed,
  visibleProjects,
}: PublishCheckInput): PublishChecklistItem[] {
  return [
    {
      blocking: true,
      key: 'projects',
      label: 'Có ít nhất một dự án đang hiện trên trang',
      ok: visibleProjects >= 1,
    },
    {
      blocking: true,
      key: 'name',
      label: 'Đã có tên hiển thị',
      ok: displayName.trim().length >= 2,
    },
    { blocking: false, key: 'preview', label: 'Đã xem trước trang (khuyến nghị)', ok: previewed },
  ];
}

export const canPublish = (items: readonly PublishChecklistItem[]): boolean =>
  items.every((item) => !item.blocking || item.ok);

export interface PublishSummaryInput {
  visibleProjects: number;
  badges: number;
  hasBio: boolean;
  links: number;
}

/** "Số liệu 3 dự án, 4 huy hiệu, giới thiệu, 2 liên kết" — đúng thứ sẽ lên trang công khai, để người dùng biết mình đang công khai cái gì. */
export function publishSummary({
  badges,
  hasBio,
  links,
  visibleProjects,
}: PublishSummaryInput): string {
  const parts: string[] = [];
  if (visibleProjects > 0) parts.push(`số liệu ${visibleProjects} dự án`);
  if (badges > 0) parts.push(`${badges} huy hiệu`);
  if (hasBio) parts.push('giới thiệu');
  if (links > 0) parts.push(`${links} liên kết`);
  return parts.length > 0
    ? `Sẽ công khai: ${parts.join(', ')}.`
    : 'Chưa có nội dung nào để công khai.';
}

/** Có thanh Công khai/Cập nhật/Ngừng ở đáy màn Tổng quan không: cần có hồ sơ và hồ sơ CHƯA bị gỡ. `Screen` cần biết TRƯỚC khi dựng (`footer` là phần tử thì luôn tính là có, kể cả khi nó render `null` — chừa đệm đáy thừa). */
export const hasPublishBar = (portfolio: Portfolio | null): boolean =>
  portfolio !== null && !portfolio.takenDown;
