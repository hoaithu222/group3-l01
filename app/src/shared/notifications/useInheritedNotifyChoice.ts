import { useQuery } from '@tanstack/react-query';

import { notificationKeys, notificationPreferencesService } from '@/core/notifications';

import { effectiveChoice, type NotifyChoice } from './notify-mode';
import { useWorkspaceNotifyPreference } from './useWorkspaceNotifyPreference';

export type InheritedKind = 'CHANNEL' | 'DIRECT' | 'GROUP';

/**
 * Giá trị mà chế độ `INHERIT` của một kênh/hội thoại sẽ KẾ THỪA thật sự — để `NotifyModeSheet` hiện "Theo mặc định (Mọi tin)"
 * thay vì chữ trống (p1-07 `app.md` §3). Chuỗi kế thừa (BE `preference-matrix`): nhóm làm việc → tài khoản → mặc định hệ thống.
 *
 *  · `DIRECT`: `directMode` của tài khoản (nhóm làm việc không đặt cho 1-1);
 *  · `GROUP`: `groupMode` của nhóm làm việc nếu hội thoại thuộc một nhóm, không thì của tài khoản;
 *  · `CHANNEL`: `channelMode` của nhóm làm việc.
 *
 * Trả `undefined` khi CHƯA biết (đang tải/lỗi) — sheet khi đó chỉ ghi "Theo mặc định", không bịa giá trị.
 * Dùng chung khoá cache với màn Cài đặt thông báo (`notificationKeys.prefs`) nên không tốn thêm request nếu đã tải.
 */
export function useInheritedNotifyChoice(
  kind: InheritedKind,
  workspaceId: string | null | undefined,
): Exclude<NotifyChoice, 'INHERIT'> | undefined {
  const account = useQuery({
    queryFn: () => notificationPreferencesService.getAccount(),
    queryKey: notificationKeys.prefs,
    staleTime: 60_000,
  });
  const workspace = useWorkspaceNotifyPreference(kind === 'DIRECT' ? undefined : (workspaceId ?? undefined));

  if (kind === 'DIRECT') return account.data ? effectiveChoice(account.data.directMode) : undefined;
  if (workspaceId) {
    const effective = workspace.data?.effective;
    if (!effective) return undefined;
    return effectiveChoice(kind === 'CHANNEL' ? effective.channelMode : effective.groupMode);
  }
  if (kind === 'GROUP' && account.data) return effectiveChoice(account.data.groupMode);
  return undefined;
}
