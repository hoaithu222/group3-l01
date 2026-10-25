import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { useResyncForm } from '@/shared/form/useResyncForm';
import { useZodForm } from '@/shared/form/useZodForm';
import { useServerSyncedState } from '@/shared/hooks/useServerSyncedState';
import { useInheritedNotifyChoice } from '@/shared/notifications';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { type SelectOption } from '@/shared/ui/select';
import { Skeleton } from '@/shared/ui/skeleton';
import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';
import { useCapabilities } from '@/shell/capabilities';

import type { ChannelDetail } from '../api';
import { ChannelDangerZoneCard } from '../components/ChannelDangerZoneCard';
import { ChannelInfoHero } from '../components/ChannelInfoHero';
import { ChannelInfoSheets } from '../components/ChannelInfoSheets';
import { ChannelLoadError } from '../components/ChannelLoadError';
import { ChannelManageCard } from '../components/ChannelManageCard';
import { ChannelPersonalCard } from '../components/ChannelPersonalCard';
import { ChannelSafetyCard } from '../components/ChannelSafetyCard';
import { useChannelMe, useLeaveChannel } from '../queries/channel-membership.queries';
import {
  useArchiveChannel,
  useChannel,
  useChannels,
  useRestoreChannel,
  useUpdateChannel,
} from '../queries/channels.queries';
import { readChannelLimits, updateChannelFormSchema, type UpdateChannelFormValues } from '../schemas/channel.schemas';
import { channelNotifyLabel } from '../utils/channel-notify';

/** Thông tin + Cá nhân + Quản lý — tách khỏi chat (app.md p1-03 §3, §7). */
export function ChannelInfoScreen() {
  const { chId, wsId } = useLocalSearchParams<{ chId: string; wsId: string }>();
  const { data: channel, error, isError, isLoading, refetch } = useChannel(chId);

  if (isLoading) {
    return (
      <Screen header={<AppBar title="Thông tin kênh" onBack={router.back} />}>
        {/* Cùng hình nội dung thật: ô icon lớn + tên ở đầu, rồi các khối cài đặt. */}
        <View className="items-center gap-sm py-sm">
          <Skeleton className="h-6xl w-6xl rounded-md" />
          <Skeleton className="h-6 w-40 rounded-md" />
        </View>
        <Skeleton className="mt-xl h-40 rounded-md" />
      </Screen>
    );
  }

  if (isError || !channel) {
    return (
      <Screen header={<AppBar title="Thông tin kênh" onBack={router.back} />}>
        <ChannelLoadError error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  return <ChannelInfoContent key={channel.id} channel={channel} wsId={wsId} />;
}

interface ChannelInfoContentProps {
  channel: ChannelDetail;
  wsId: string;
}

/** State cục bộ khởi tạo TRỰC TIẾP từ `channel` (props luôn có giá trị) — tránh `useEffect`+`setState`. */
function ChannelInfoContent({ channel, wsId }: ChannelInfoContentProps) {
  const { data: capabilities } = useCapabilities();
  const limits = useMemo(() => readChannelLimits(capabilities?.limits), [capabilities?.limits]);
  const schema = useMemo(() => updateChannelFormSchema(limits), [limits]);

  const updateChannel = useUpdateChannel(channel.id, wsId);
  const archiveChannel = useArchiveChannel(channel.id, wsId);
  const restoreChannel = useRestoreChannel(channel.id, wsId);
  const leaveChannel = useLeaveChannel(wsId);
  const channelMe = useChannelMe(wsId, channel.id);
  const { data: allChannels } = useChannels(wsId);
  // p1-07: "Theo mặc định" hiện giá trị kế thừa THỰC TẾ của nhóm (`channelMode`), không phải chữ trống.
  const notifyInherited = useInheritedNotifyChoice('CHANNEL', wsId);

  const serverValues = { name: channel.name, description: channel.description ?? '' };
  const form = useZodForm<UpdateChannelFormValues, UpdateChannelFormValues>(schema, {
    defaultValues: serverValues,
  });
  // Tên/mô tả/chính sách đăng đổi ở máy khác (socket) hoặc tải lại nền ⇒ ô nhập theo bản mới khi chưa sửa gì.
  useResyncForm(form, serverValues, channel.version);

  const [adminsOnly, setAdminsOnly] = useServerSyncedState(channel.postingPolicy === 'ADMINS_ONLY');
  const [notifySheetOpen, setNotifySheetOpen] = useState(false);
  const [archiveSheetOpen, setArchiveSheetOpen] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);

  // Ứng viên thay thế kênh mặc định: TEXT/PUBLIC/ACTIVE, khác chính nó (be.md
  // §5.3) — gộp CẢ `discoverable`, không chỉ `joined`: người quản trị không
  // nhất thiết đã tự tham gia MỌI kênh công khai trong nhóm.
  const replacementOptions: SelectOption[] = [...(allChannels?.joined ?? []), ...(allChannels?.discoverable ?? [])]
    .filter((item) => item.id !== channel.id && item.type === 'TEXT' && item.visibility === 'PUBLIC' && item.status === 'ACTIVE')
    .map((item) => ({ label: item.name, value: item.id }));

  const saveDetails = form.handleSubmit((values) => {
    updateChannel.mutate(
      {
        description: values.description || null,
        expectedVersion: channel.version,
        name: values.name,
        postingPolicy: adminsOnly ? 'ADMINS_ONLY' : 'MEMBERS',
      },
      {
        onError: (mutationError) => {
          const message = toErrorMessage(mutationError);
          showToast('error', message.includes('thay đổi') ? `${message} — dữ liệu đã được giữ nguyên` : message);
        },
        onSuccess: () => {
          hapticSuccess();
          showToast('success', 'Đã lưu thay đổi.');
        },
      },
    );
  });

  return (
    <Screen header={<AppBar title="Thông tin kênh" onBack={router.back} />}>
      {/* `gap-xl` (24) giữa các khối — cùng nhịp Cài đặt nhóm (`screen-layout.md`). */}
      <View className="gap-xl py-xs">
        <ChannelInfoHero channel={channel} />

        <ChannelPersonalCard
          notifyLabel={channelNotifyLabel(channel.notifyMode, notifyInherited)}
          pinned={channel.pinned}
          onNotifyPress={() => setNotifySheetOpen(true)}
          onPinnedChange={(value) => channelMe.mutate({ pinned: value })}
        />

        <ChannelSafetyCard channel={channel} wsId={wsId} />

        {channel.myPermissions.canManage ? (
          <ChannelManageCard
            adminsOnly={adminsOnly}
            control={form.control}
            descriptionMax={limits.descriptionMax}
            disabled={channel.status === 'ARCHIVED'}
            loading={updateChannel.isPending}
            nameMax={limits.nameMax}
            onAdminsOnlyChange={setAdminsOnly}
            onSave={saveDetails}
          />
        ) : null}

        {channel.myPermissions.canArchive || channel.myPermissions.canLeave ? (
          <ChannelDangerZoneCard
            channel={channel}
            restoreLoading={restoreChannel.isPending}
            onArchive={() => setArchiveSheetOpen(true)}
            onLeave={() => setLeaveDialogOpen(true)}
            onRestore={() => restoreChannel.mutate(channel.version)}
          />
        ) : null}
      </View>

      <ChannelInfoSheets
        archiveLoading={archiveChannel.isPending}
        archiveSheetOpen={archiveSheetOpen}
        isDefault={channel.isDefault}
        leaveDialogOpen={leaveDialogOpen}
        leaveLoading={leaveChannel.isPending}
        notifyInherited={notifyInherited}
        notifyMode={channel.notifyMode}
        notifySheetOpen={notifySheetOpen}
        replacementOptions={replacementOptions}
        onArchiveClose={() => setArchiveSheetOpen(false)}
        onArchiveConfirm={(replacementDefaultChannelId) =>
          archiveChannel.mutate(
            { expectedVersion: channel.version, replacementDefaultChannelId },
            { onSuccess: () => setArchiveSheetOpen(false) },
          )
        }
        onLeaveClose={() => setLeaveDialogOpen(false)}
        onLeaveConfirm={() =>
          leaveChannel.mutate(channel.id, {
            onSuccess: () => {
              setLeaveDialogOpen(false);
              router.replace({ params: { wsId }, pathname: '/workspaces/[wsId]/channels' });
            },
          })
        }
        onNotifyChange={(mode) => channelMe.mutate({ notifyMode: mode })}
        onNotifyClose={() => setNotifySheetOpen(false)}
      />
    </Screen>
  );
}
