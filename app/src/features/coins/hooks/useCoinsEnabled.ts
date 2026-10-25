import { useFeature } from '@/shell/capabilities';

/**
 * Cờ phân hệ `coins` (BE `requireFeature('coins')`, cần `gamification`). ⚠️ "Chưa biết" (`undefined`) KHÔNG phải "bật": chỉ gọi API khi cờ
 * ĐÃ biết là bật — cờ tắt BE trả 404 `CFG_005`. Tắt cờ ⇒ mọi lối vào (hàng ở màn Tôi, widget Trang chủ, route) ẩn/chặn hoàn toàn.
 */
export function useCoinsEnabled(): boolean {
  return useFeature('coins') === true;
}
