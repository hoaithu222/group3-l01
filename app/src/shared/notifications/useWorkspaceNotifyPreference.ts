import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  notificationKeys,
  notificationPreferencesService,
  type UpdateWorkspaceNotificationPreferencePayload,
  type WorkspaceNotificationPreference,
} from '@/core/notifications';

/**
 * Cài đặt thông báo của tôi cho MỘT nhóm làm việc (`groupMode`/`channelMode`, p1-07 `app.md` §4.5). Dùng ở màn cài đặt nhóm
 * và ở `useInheritedNotifyChoice` (giá trị `INHERIT` của kênh/hội thoại kế thừa từ đây → tài khoản → mặc định).
 *
 * Đổi LẠC QUAN, lỗi (`NOTI_004`, mất mạng) thì hoàn về giá trị cũ. ⛔ KHÔNG tự toast lỗi: `apiClient` đã toast đúng
 * MỘT lần — thêm ở đây là toast đôi (cùng lý do `useUpdateAccountNotificationPreference`).
 */
export function useWorkspaceNotifyPreference(workspaceId: string | undefined) {
  const queryClient = useQueryClient();
  const key = notificationKeys.workspacePrefs(workspaceId ?? '');

  const query = useQuery({
    enabled: Boolean(workspaceId),
    queryFn: () => notificationPreferencesService.getWorkspace(workspaceId ?? ''),
    queryKey: key,
    staleTime: 5 * 60_000,
  });

  const mutation = useMutation({
    mutationFn: (patch: UpdateWorkspaceNotificationPreferencePayload) =>
      notificationPreferencesService.updateWorkspace(workspaceId ?? '', patch),
    // ⚠️ `onMutate` PHẢI đứng TRƯỚC `onError` (kiểu `context` suy theo thứ tự khai báo).
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<WorkspaceNotificationPreference>(key);
      if (previous) queryClient.setQueryData(key, { ...previous, ...patch });
      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    // Bản BE trả về đã có `effective` tính lại (sau khi kế thừa) — ghi thẳng thay vì tải lại.
    onSuccess: (saved) => queryClient.setQueryData(key, saved),
  });

  return {
    ...query,
    isUpdating: mutation.isPending,
    update: (patch: UpdateWorkspaceNotificationPreferencePayload) => mutation.mutate(patch),
  };
}
