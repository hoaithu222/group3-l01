/**
 * Public API của phân hệ `o2o` (p6-05) cho code NGOÀI phân hệ — cụ thể là `features/partner` (cổng chủ tiệm), dùng CHUNG lõi đơn in
 * (nhãn trạng thái, mô tả cấu hình in, dòng thời gian, báo giá, bảng giá chỉ đọc) thay vì chép hai bản. Chỉ phần nhẹ dùng chung —
 * trang/tab vận hành của chính phân hệ nạp lười qua `o2o.routes.tsx`, không re-export ở đây.
 */
export { default as Fact } from './components/shared/Fact';
export { default as ListLoadError } from './components/shared/ListLoadError';
export { default as OrderQuoteView } from './components/shared/OrderQuoteView';
export { default as OrderTimeline } from './components/shared/OrderTimeline';
export { default as PriceTableView } from './components/shared/PriceTableView';
export { default as StatusBadge } from './components/shared/StatusBadge';
export { SHOP_STATUS_META } from './constants/o2o.constants';
export {
  PRINT_ORDER_STATUS_META,
  PRINT_PAYMENT_META,
  PRINT_PAYMENT_METHOD_LABELS,
} from './constants/print.constants';
export type {
  PrintCapabilities,
  PrintOrderCore,
  PrintOrderStatus,
  PrintPriceTable,
  PrintShopStatus,
} from './types/print.types';
export { formatPagesTimesCopies, formatPrintSettings } from './utils/print.utils';
