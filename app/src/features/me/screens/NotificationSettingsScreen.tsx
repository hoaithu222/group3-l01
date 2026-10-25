import { router } from 'expo-router';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { useConnectionState } from '@/core/socket';
import { Card } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Section } from '@/shared/ui/section';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { PATHS } from '@/shell/config';
import { usePushPermission } from '@/shell/notifications';

import { ConversationModesCard } from '../components/ConversationModesCard';
import { DndCard } from '../components/DndCard';
import { LockScreenCard } from '../components/LockScreenCard';
import { MeNavGroup } from '../components/MeNavGroup';
import { MeNavRow } from '../components/MeNavRow';
import { PushPermissionCard } from '../components/PushPermissionCard';
import { WorkspaceNotifyCard } from '../components/WorkspaceNotifyCard';
import {
  useAccountNotificationPreference,
  useUpdateAccountNotificationPreference,
} from '../hooks/useNotificationPreferences';

/**
 * "Thông báo" — cài đặt cấp tài khoản (p0-06 `app.md` §3), mở từ `MeSettingsScreen`.
 *
 * Ba khối (mỗi khối một `Section` có tiêu đề + thẻ, xem `components/`):
 *  1. `PushPermissionCard` — quyền của hệ điều hành: icon lớn + tông theo trạng thái, nút bật/mở Cài đặt. Bị tắt thì chỉ
 *     RÕ ở đây, ⛔ không hộp thoại lặp (PUSH-11); hộp thoại hệ thống chỉ hiện khi bấm "Bật thông báo".
 *  2. `LockScreenCard` — màn hình khoá (`lockScreenPreview` HIDDEN | SENDER | FULL, mặc định ẩn): ba thẻ chọn kèm lời
 *     giải thích rủi ro.
 *  3. `DndCard` — không làm phiền: chip chọn nhanh 1 giờ / 8 giờ / sáng mai, đang bật thì thẻ nổi bật kèm nút Tắt.
 *
 * ⚠️ Màn CHỈ trình bày: mọi thay đổi vẫn đi qua `update.mutate` (lạc quan, lỗi hoàn lại — `useNotificationPreferences`),
 * mất mạng thì `controlsDisabled` khoá toàn bộ điều khiển như cũ.
 *
 * p1-07 thêm khối `ConversationModesCard` (chế độ theo loại cuộc trò chuyện 1-1 / nhóm / kênh + âm thanh) vào CHÍNH màn
 * này — không dựng màn thứ hai (`be.md` p1-07 §15). Route thật là `me/notifications` (không phải `me/settings/notifications`).
 */
export function NotificationSettingsScreen() {
  const { enable, openSettings, permission } = usePushPermission();
  const preference = useAccountNotificationPreference();
  const update = useUpdateAccountNotificationPreference();
  const offline = useConnectionState() === 'offline';

  const data = preference.data;
  const controlsDisabled = offline;

  return (
    <Screen
      header={<AppBar title="Thông báo" onBack={router.back} />}
      refreshing={preference.isRefetching}
      onRefresh={() => void preference.refetch()}
    >
      <View className="gap-xl py-xs">
        {/* `Section icon` ở mọi nhóm của màn (sáu nhóm, kể cả nhóm nằm trong các thẻ con): mốc nhìn cho màn cài đặt dài. */}
        <Section icon="notification" title="Thông báo trên thiết bị">
          <PushPermissionCard
            permission={permission}
            onEnable={() => void enable()}
            onOpenSettings={() => void openSettings()}
          />
        </Section>

        {preference.isLoading ? (
          <Card>
            <SkeletonParagraphWithIcon />
            <SkeletonParagraphWithIcon />
          </Card>
        ) : preference.isError || !data ? (
          <EmptyState
            actions={[{ label: 'Thử lại', onPress: () => void preference.refetch() }]}
            description={toErrorMessage(preference.error)}
            icon="alert-warning"
            title="Không tải được cài đặt thông báo"
            tone="danger"
          />
        ) : (
          <>
            <ConversationModesCard
              data={data}
              disabled={controlsDisabled}
              onChange={(patch) => update.mutate(patch)}
            />
            <WorkspaceNotifyCard disabled={controlsDisabled} />

            <LockScreenCard
              disabled={controlsDisabled}
              value={data.lockScreenPreview}
              onChange={(lockScreenPreview) => update.mutate({ lockScreenPreview })}
            />

            <DndCard
              disabled={controlsDisabled}
              dndUntil={data.dndUntil}
              onChange={(dndUntil) => update.mutate({ dndUntil })}
            />
          </>
        )}

        <Section icon="lap" title="Thiết bị">
          <MeNavGroup>
            <MeNavRow
              description="Xem và gỡ các thiết bị đang nhận thông báo của tài khoản này"
              icon="phone"
              label="Thiết bị nhận thông báo"
              tone="info"
              onPress={() => router.push(PATHS.ME_DEVICES)}
            />
          </MeNavGroup>
        </Section>
      </View>
    </Screen>
  );
}
