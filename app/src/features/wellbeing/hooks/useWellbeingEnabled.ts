import { useFeature } from '@/shell/capabilities';

/**
 * Cờ phân hệ `burnout` (BE `requireFeature('burnout')`, cần `gamification`). ⚠️ "Chưa biết" (`undefined`) KHÔNG phải "bật": chỉ gọi API khi cờ
 * ĐÃ biết là bật — cờ tắt BE trả 404 `CFG_005`. Cờ tắt ⇒ ẩn hàng ở màn Tôi, không nghe socket, không gọi API đọc; route hiện "chưa khả dụng"
 * (chỉ còn hai nút rút lại: tắt theo dõi và xoá dữ liệu — BE vẫn nhận, không cần cờ).
 */
export function useWellbeingEnabled(): boolean {
  return useFeature('burnout') === true;
}
