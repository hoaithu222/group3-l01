import { useMutation, useQueryClient } from '@tanstack/react-query';

import { wellbeingService } from '../api/wellbeing.service';
import { wellbeingKeys } from './wellbeing.keys';

// Hai lệnh P1 "chia sẻ mức rủi ro với nhóm" — tách khỏi `wellbeing.mutations.ts` (giữ mỗi file ≤ 150 dòng, `check:file-size`).
// Cả hai CHỈ vá cache danh sách chia sẻ (`wellbeingKeys.shares()`), không đụng cài đặt theo dõi — ranh giới tách tự nhiên.

/** Một dòng của cache `wellbeingKeys.shares()` (nhóm đã được chia sẻ). */
type ShareRow = { workspaceId: string; name: string };

/**
 * P1 — bật chia sẻ mức rủi ro với một nhóm. Thành công thì vá thẳng vào danh sách (tránh nhấp nháy "đang tải" lại toàn bộ khi chỉ một dòng
 * đổi); lỗi để nơi gọi đọc `error` (`WELL_001`/`WELL_002`) và hiện câu tương ứng — không lạc quan (cần biết CHẮC BE đã đồng ý trước khi
 * hiện "Đã chia sẻ", tránh trấn an giả khi thật ra bị từ chối).
 */
export function useShareWorkspace() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (workspaceId: string) => wellbeingService.share(workspaceId),
    onSuccess: (share) => {
      client.setQueryData<ShareRow[]>(wellbeingKeys.shares(), (old) => {
        const rest = (old ?? []).filter((s) => s.workspaceId !== share.workspaceId);
        return [...rest, share];
      });
    },
  });
}

/** P1 — tắt chia sẻ với một nhóm; luôn được phép (204), gỡ khỏi danh sách ngay khi thành công. */
export function useUnshareWorkspace() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (workspaceId: string) => wellbeingService.unshare(workspaceId),
    onSuccess: (_void, workspaceId) => {
      client.setQueryData<ShareRow[]>(wellbeingKeys.shares(), (old) =>
        (old ?? []).filter((s) => s.workspaceId !== workspaceId),
      );
    },
  });
}
