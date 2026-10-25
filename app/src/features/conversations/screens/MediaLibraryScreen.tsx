import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import type { IconName } from '@/shared/ui/icon';
import type { IconTileTone } from '@/shared/ui/icon-tile';
import { AppBar } from '@/shared/ui/navigation';
import { LoadingMore } from '@/shared/ui/progress';
import { Screen, useListRefreshControl } from '@/shared/ui/screen';
import { Tabs, type TabItemData } from '@/shared/ui/tab';

import type { MediaKind } from '../api/conversations.types';
import { FileList } from '../components/media/FileList';
import { LinkList } from '../components/media/LinkList';
import { MediaGrid } from '../components/media/MediaGrid';
import { MediaLibrarySkeleton } from '../components/media/MediaLibrarySkeleton';
import { useConversationMedia } from '../hooks/useConversationMedia';

const KIND_TABS: TabItemData[] = [
  { key: 'MEDIA', label: 'Ảnh, Video' },
  { key: 'FILE', label: 'Tệp' },
  { key: 'LINK', label: 'Liên kết' },
];

/** Hình rỗng theo tab — icon + tông TRÙNG ô icon của lối vào tương ứng ở màn Thông tin (`SharedContentSection`). */
const EMPTY: Record<MediaKind, { description: string; icon: IconName; tone: IconTileTone }> = {
  MEDIA: { description: 'Chưa có ảnh/video nào được chia sẻ.', icon: 'image', tone: 'success' },
  FILE: { description: 'Chưa có tệp nào được chia sẻ.', icon: 'file-2', tone: 'info' },
  LINK: { description: 'Chưa có liên kết nào được chia sẻ.', icon: 'link', tone: 'accent' },
};

/**
 * app.md §3 — tab Ảnh-Video/Tệp/Liên kết, `?kind=` chọn tab ban đầu.
 *
 * Trang 30 mục (cursor): cuối danh sách có "Tải thêm" (đang tải ⇒ `LoadingMore`) — bản cũ chỉ hiện trang đầu, nhóm chia sẻ nhiều thì
 * ảnh cũ không có đường nào xem được. Kéo xuống để làm mới (vòng quay theo token, `useListRefreshControl`).
 */
export function MediaLibraryScreen() {
  const { conversationId, kind: initialKind } = useLocalSearchParams<{
    conversationId: string;
    kind?: MediaKind;
  }>();
  const [kind, setKind] = useState<MediaKind>(initialKind ?? 'MEDIA');
  const media = useConversationMedia(conversationId, kind);
  const items = useMemo(() => media.data?.pages.flatMap((p) => p.data) ?? [], [media.data]);
  const refreshControl = useListRefreshControl({
    onRefresh: () => void media.refetch(),
    refreshing: media.isRefetching && !media.isFetchingNextPage,
  });

  return (
    <Screen
      header={<AppBar title="Thư viện" onBack={router.back} />}
      padded={false}
      scrollable={false}
    >
      <View className="flex-1 gap-sm py-xs">
        <View className="px-md">
          <Tabs items={KIND_TABS} value={kind} onChange={(next) => setKind(next as MediaKind)} />
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={refreshControl}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          {media.isLoading ? (
            <MediaLibrarySkeleton kind={kind} />
          ) : media.isError ? (
            <EmptyState
              actions={[{ label: 'Thử lại', onPress: () => void media.refetch() }]}
              description={toErrorMessage(media.error)}
              icon="alert-warning"
              title="Không tải được"
              tone="danger"
            />
          ) : items.length === 0 ? (
            <EmptyState
              description={EMPTY[kind].description}
              icon={EMPTY[kind].icon}
              title="Chưa có nội dung"
              tone={EMPTY[kind].tone}
            />
          ) : (
            <View className="gap-sm">
              {kind === 'MEDIA' ? (
                <MediaGrid conversationId={conversationId} items={items} />
              ) : kind === 'FILE' ? (
                <FileList conversationId={conversationId} items={items} />
              ) : (
                <LinkList conversationId={conversationId} items={items} />
              )}
              {media.isFetchingNextPage ? (
                <LoadingMore />
              ) : media.hasNextPage ? (
                <View className="items-center">
                  <Button
                    label="Tải thêm"
                    size="sm"
                    variant="tertiary"
                    onPress={() => void media.fetchNextPage()}
                  />
                </View>
              ) : null}
            </View>
          )}
        </ScrollView>
      </View>
    </Screen>
  );
}
