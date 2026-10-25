import type { PrintOrderView, PrintSettings } from '../api/o2o.types';

/** "A4 · Đen trắng · Hai mặt · 2 bản · Trang 1-3,5" — tóm tắt cấu hình in trên một dòng (vé đơn, danh sách đơn). */
export function settingsSummary(settings: PrintSettings): string {
  return [
    settings.paper,
    settings.color ? 'In màu' : 'Đen trắng',
    settings.duplex ? 'Hai mặt' : 'Một mặt',
    `${settings.copies} bản`,
    settings.pageRange ? `Trang ${settings.pageRange}` : null,
    settings.binding ? 'Đóng gáy' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Trạng thái thanh toán tại quầy bằng chữ (P0 chỉ có `AT_COUNTER`; `VIETQR` là P1 nhưng BE đã có sẵn giá trị). */
export function paymentText(payment: PrintOrderView['payment']): string {
  const method = payment.method === 'VIETQR' ? 'Chuyển khoản VietQR' : 'Thanh toán tại quầy';
  return `${method} — ${payment.status === 'PAID' ? 'đã thanh toán' : 'chưa thanh toán'}`;
}
