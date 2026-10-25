import { useQuery } from '@tanstack/react-query';

import { wellbeingService } from '../api/wellbeing.service';
import type { WellbeingDays } from '../api/wellbeing.types';
import { WELLBEING_STALE_MS } from '../constants/wellbeing.constants';
import { useWellbeingEnabled } from '../hooks/useWellbeingEnabled';
import { wellbeingKeys } from './wellbeing.keys';

/**
 * Cài đặt theo dõi của tôi (`GET /me/wellbeing`) — kèm `latest` và `pendingAlert`. Chỉ gọi khi cờ `burnout` BẬT (cờ tắt BE trả 404). Chưa bật thì BE chỉ trả
 * mặc định TẮT và KHÔNG tạo dòng nào, nên gọi ở mọi lần mở app (để lấy `pendingAlert`) không để lại dấu vết gì ở máy chủ.
 */
export function useWellbeingSetting() {
  const enabled = useWellbeingEnabled();
  return useQuery({
    enabled,
    queryFn: () => wellbeingService.setting(),
    queryKey: wellbeingKeys.setting(),
    retry: false,
    staleTime: WELLBEING_STALE_MS,
  });
}

/**
 * Chỉ số ngày + đánh giá 7|30 ngày của tôi. `active` = ĐÃ biết là đang bật theo dõi (từ `useWellbeingSetting`): chưa bật thì BE trả 409 `WELL_001`, và
 * gọi thử chỉ để nhận lỗi là thừa. Dữ liệu chỉ nằm ở bộ nhớ (gcTime mặc định của cache chung) và bị xoá ngay khi tắt theo dõi/xoá dữ liệu/đăng xuất.
 */
export function useWellbeingHistory(days: WellbeingDays, active: boolean) {
  const enabled = useWellbeingEnabled();
  return useQuery({
    enabled: enabled && active,
    queryFn: () => wellbeingService.history(days),
    queryKey: wellbeingKeys.history(days),
    retry: false,
    staleTime: WELLBEING_STALE_MS,
  });
}

/**
 * P1 — nhóm tôi đã tự bật chia sẻ mức rủi ro (màn Cài đặt, `ShareWithWorkspaceList`). `active` = ĐANG bật theo dõi (chưa bật thì danh sách
 * luôn rỗng và gọi thử chỉ tốn một request — cùng lý do `useWellbeingHistory`).
 */
export function useWellbeingShares(active: boolean) {
  const enabled = useWellbeingEnabled();
  return useQuery({
    enabled: enabled && active,
    queryFn: () => wellbeingService.shares(),
    queryKey: wellbeingKeys.shares(),
    retry: false,
    staleTime: WELLBEING_STALE_MS,
  });
}

/**
 * Đoạn khoá `my-workspaces`, GHÉP từ hai mẩu: viết liền thành một chuỗi thì `check:classes` đọc nhầm là tiện ích Tailwind
 * `my-*` (lề dọc) và báo class chết (base-rules §4 — sửa phía code, không nới bộ lọc). Giá trị lúc chạy không đổi.
 */
const MY_WORKSPACES_KEY = ['my', 'workspaces'].join('-');

/** P1 — nhóm tôi đang là thành viên, cho danh sách bật/tắt chia sẻ. Khoá riêng của feature này (không dùng chung `workspaceKeys`). */
export function useMyWorkspacesForSharing(active: boolean) {
  const enabled = useWellbeingEnabled();
  return useQuery({
    enabled: enabled && active,
    queryFn: () => wellbeingService.myWorkspaces(),
    queryKey: ['wellbeing', MY_WORKSPACES_KEY] as const,
    retry: false,
    staleTime: 30_000,
  });
}
