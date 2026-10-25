import { useFeature } from '@/shell/capabilities';

/**
 * Cờ phân hệ `coins` (chợ tài liệu nằm TRONG module BE `coins`, cần cờ này bật trước). ⚠️ Cờ RIÊNG `economy.marketplaceEnabled`
 * (BE `SystemConfig`, mặc định TẮT — chờ điều khoản bản quyền) KHÔNG có trong `capabilities` (đăng ký `affects: ["runtime"]` ở
 * BE, giống `recruiter.enabled`/`portfolio.enabled`) — màn tự nhận biết chợ đang đóng qua lỗi `COIN_008` của chính lời gọi, không
 * qua cờ máy khách (cùng cách các phân hệ runtime-only khác trong app xử lý).
 */
export function useMarketplaceEnabled(): boolean {
  return useFeature('coins') === true;
}
