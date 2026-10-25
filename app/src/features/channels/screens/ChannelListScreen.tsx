import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { SearchInput } from '@/shared/ui/search';
import { Skeleton } from '@/shared/ui/skeleton';
import { matchesSearch } from '@/shared/utils/format/string.utils';
import { hapticSelection, hapticTap } from '@/shared/utils/haptics';
import { useWorkspaceUnread } from '@/shell/notifications';

import type { ChannelListItem as ChannelListItemData } from '../api';
import { ChannelItemActionsSheet } from '../components/ChannelItemActionsSheet';
import { ChannelPreviewSheet } from '../components/ChannelPreviewSheet';
import { ChannelSection } from '../components/ChannelSection';
import { useChannelSocket } from '../hooks/useChannelSocket';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useChannelMe } from '../queries/channel-membership.queries';
import { useChannels, useChannelSearch } from '../queries/channels.queries';
import { useCanCreateChannel } from '../queries/workspace-permission.queries';
import { computeMovePosition, mergeDiscoverable, sortJoined, withChannelUnread } from './channel-list.utils';

function openNewChannel(wsId: string): void {
  router.push({ params: { wsId }, pathname: '/workspaces/[wsId]/channels/new' });
}

function openChannel(wsId: string, channelId: string): void {
  router.push({ params: { chId: channelId, wsId }, pathname: '/workspaces/[wsId]/channels/[chId]' });
}

/**
 * Danh sách kênh (app.md p1-03 §3): tìm + lọc client, "Kênh của bạn"/"Khám
 * phá", chạm kênh public chưa tham gia → xem trước, tạo kênh theo quyền.
 *
 * Nhấn giữ (Ghim/Lên-xuống/Tắt tiếng) và bảng VOICE/POMODORO xem trước —
 * xem `ChannelPreviewSheet`/`useChannelMe`; danh sách tối đa 200 kênh/nhóm
 * (be.md §9 `perWorkspaceMax`) nên `.map()` thường đủ nhẹ, không cần FlashList.
 */
export function ChannelListScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  useChannelSocket(wsId);
  const canCreateChannel = useCanCreateChannel(wsId);

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query).trim();
  const searching = debouncedQuery.length > 0;
  const [previewChannelId, setPreviewChannelId] = useState<string | null>(null);
  const [actionsChannel, setActionsChannel] = useState<ChannelListItemData | null>(null);
  const channelMe = useChannelMe(wsId, actionsChannel?.id ?? '');

  const { data, error, isError, isLoading, isRefetching, refetch } = useChannels(wsId);
  const { data: serverResults = [] } = useChannelSearch(wsId, debouncedQuery);
  // p1-07: chấm/số chưa đọc THẬT — danh sách kênh của BE không mang số này; nguồn là `/me/unread`, đã được socket + mốc đọc vá live.
  const { data: unread, refetch: refetchUnread } = useWorkspaceUnread(wsId);

  const joined = useMemo(() => withChannelUnread(sortJoined(data?.joined ?? []), unread), [data, unread]);
  const joinedIds = useMemo(() => new Set(joined.map((item) => item.id)), [joined]);

  const visibleJoined = useMemo(
    () => (searching ? joined.filter((item) => matchesSearch(debouncedQuery, item.name)) : joined),
    [joined, debouncedQuery, searching],
  );
  const visibleDiscoverable = useMemo(() => {
    const discoverable = data?.discoverable ?? [];
    return searching ? mergeDiscoverable(discoverable, serverResults, debouncedQuery, joinedIds) : discoverable;
  }, [data, serverResults, debouncedQuery, searching, joinedIds]);

  function handlePress(channel: ChannelListItemData): void {
    if (channel.visibility === 'PUBLIC' && !joinedIds.has(channel.id)) {
      setPreviewChannelId(channel.id);
      return;
    }
    openChannel(wsId, channel.id);
  }

  const actionsIndex = actionsChannel ? joined.findIndex((item) => item.id === actionsChannel.id) : -1;

  function handleMove(direction: 'down' | 'up'): void {
    if (actionsIndex < 0) return;
    const position = computeMovePosition(joined, actionsIndex, direction);
    if (position === undefined) return;
    hapticSelection(); // đổi thứ tự = đổi lựa chọn trong nhóm
    channelMe.mutate({ position });
    setActionsChannel(null);
  }

  const isEmpty = visibleJoined.length === 0 && visibleDiscoverable.length === 0;

  return (
    <Screen
      header={
        <AppBar
          actions={
            canCreateChannel ? (
              <Button
                accessibilityLabel="Tạo kênh"
                iconLeft="add"
                iconOnly
                size="sm"
                variant="tertiary"
                onPress={() => openNewChannel(wsId)}
              />
            ) : undefined
          }
          title="Kênh"
          onBack={router.back}
        />
      }
      refreshing={isRefetching}
      onRefresh={() => {
        void refetch();
        void refetchUnread();
      }}
    >
      <View className="gap-xl py-xs">
        <SearchInput placeholder="Tìm kênh" onChangeText={setQuery} />

        {isLoading ? (
          // Khung xương CÙNG HÌNH dòng kênh: ô icon 32 + một dòng tên (không phải thanh xám cao 56 như trước).
          <View className="gap-sm">
            {Array.from({ length: 6 }).map((_, index) => (
              <View key={index} className="flex-row items-center gap-sm py-xs">
                <Skeleton className="h-3xl w-3xl rounded-xs" />
                <Skeleton className="flex-1" />
              </View>
            ))}
          </View>
        ) : isError ? (
          <EmptyState
            actions={[{ label: 'Thử lại', onPress: () => void refetch() }]}
            description={toErrorMessage(error)}
            icon="alert-warning"
            title="Không tải được danh sách kênh"
            tone="danger"
          />
        ) : isEmpty ? (
          <EmptyState
            actions={canCreateChannel ? [{ label: 'Tạo kênh', onPress: () => openNewChannel(wsId) }] : undefined}
            description={searching ? 'Không tìm thấy kênh nào khớp.' : 'Chưa có kênh khác trong nhóm này.'}
            icon={searching ? 'search' : 'chat-bubble'}
            title={searching ? 'Không có kết quả' : 'Chưa có kênh khác'}
            tone={searching ? 'neutral' : 'info'}
          />
        ) : (
          <>
            <ChannelSection
              channels={visibleJoined}
              title="Kênh của bạn"
              onLongPressChannel={setActionsChannel}
              onPressChannel={handlePress}
            />
            <ChannelSection channels={visibleDiscoverable} title="Khám phá" onPressChannel={handlePress} />
          </>
        )}
      </View>

      <ChannelPreviewSheet channelId={previewChannelId} wsId={wsId} onClose={() => setPreviewChannelId(null)} />

      <ChannelItemActionsSheet
        canMoveDown={actionsIndex >= 0 && actionsIndex < joined.length - 1}
        canMoveUp={actionsIndex > 0}
        channel={actionsChannel}
        onClose={() => setActionsChannel(null)}
        onMove={handleMove}
        onToggleMute={() => {
          if (!actionsChannel) return;
          hapticSelection();
          channelMe.mutate({ notifyMode: actionsChannel.notifyMode === 'MUTED' ? 'INHERIT' : 'MUTED' });
          setActionsChannel(null);
        }}
        onTogglePin={() => {
          if (!actionsChannel) return;
          hapticTap(); // ghim = hành động chính (xem `shared/utils/haptics`)
          channelMe.mutate({ pinned: !actionsChannel.pinned });
          setActionsChannel(null);
        }}
      />
    </Screen>
  );
}
