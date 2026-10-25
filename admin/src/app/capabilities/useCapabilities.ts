import { useQuery } from '@tanstack/react-query';

import { useAuthStore } from '@/app/store';
import { capabilitiesService } from '@/core/capabilities';

export const CAPABILITIES_KEY = ['capabilities'] as const;

/**
 * Cờ tính năng của hệ thống — cache 5 phút (thay đổi cực hiếm, không cần
 * refetch theo mỗi lần chuyển trang).
 *
 * `enabled` CHỈ bật khi đã đăng nhập.
 *
 * ⛔ CỐ Ý KHÔNG bypass khi `!appConfig.authEnabled` (khác pseudo-code ban đầu
 * ở runbook) — `authEnabled=false` nghĩa là base đang chạy KHÔNG CÓ backend
 * nào (xem chú thích ở `env.config.ts`); bật cờ đó lên vẫn bắn `GET
 * /capabilities` là một request chắc chắn treo/lỗi. Không cần nhánh riêng cho
 * ca này: khi `authEnabled=false`, `useSessionBootstrap` cũng bỏ qua nên
 * `status` không bao giờ rời `'idle'` — điều kiện dưới đây tự nhiên khớp.
 */
export function useCapabilities() {
  const status = useAuthStore((s) => s.status);
  return useQuery({
    queryKey: CAPABILITIES_KEY,
    queryFn: async () => (await capabilitiesService.get()).data,
    staleTime: 5 * 60_000,
    enabled: status === 'authenticated',
  });
}

/**
 * Đọc nhanh MỘT cờ tính năng.
 *
 * `undefined` = chưa có dữ liệu (đang tải lần đầu, hoặc query lỗi) — phân biệt
 * với `false` (BE đã trả lời và cờ đang TẮT) để nơi gọi tự quyết định cách xử
 * lý trạng thái "chưa biết" (vd `FeatureGate` chờ thay vì kết luận vội).
 */
export function useFeature(flag: string): boolean | undefined {
  const { data } = useCapabilities();
  return data ? Boolean(data.features[flag]?.enabled) : undefined;
}
