import { formatNumber } from '@/shared/utils/format';

import type { PrintOrderCore, PrintSettings } from '../types/print.types';

/** "A4 · Đen trắng · 1 mặt · 2 bản · trang 1-3,5 · đóng gáy" — mô tả cấu hình in bằng một dòng (bảng, thẻ, chi tiết). */
export function formatPrintSettings(settings: PrintSettings): string {
  const parts = [
    settings.paper,
    settings.color ? 'In màu' : 'Đen trắng',
    settings.duplex ? '2 mặt' : '1 mặt',
    `${formatNumber(settings.copies)} bản`,
  ];
  if (settings.pageRange) parts.push(`trang ${settings.pageRange}`);
  if (settings.binding) parts.push('đóng gáy');
  return parts.join(' · ');
}

type PagesSource = Pick<PrintOrderCore, 'pages' | 'pageCountError' | 'quote' | 'settings'>;

/**
 * "12 trang × 2 bản" — số trang THỰC IN (theo khoảng trang đã chọn, từ báo giá) × số bản. Chưa có số trang: tệp lỗi
 * (`pageCountError`) hoặc job đếm trang chưa chạy xong (đơn còn DRAFT).
 */
export function formatPagesTimesCopies(order: PagesSource): string {
  const pages = order.quote?.printablePages ?? order.pages;
  if (pages === null || pages === undefined) {
    return order.pageCountError ? 'Tệp lỗi' : 'Đang đếm trang';
  }
  return `${formatNumber(pages)} trang × ${formatNumber(order.settings.copies)} bản`;
}

/** Id Mongo dài 24 ký tự → "…a1b2c3" cho ô/dòng hẹp; giá trị đầy đủ để ở `title`. */
export function shortId(id: string): string {
  return `…${id.slice(-6)}`;
}
