import { useState } from 'react';
import { ScrollView, StatusBar, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useWindowDimensions } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';

import { chatService } from '../../api/chat.service';
import { useAssetUrl } from '@/core/uploads/use-asset-url';
import { MediaViewerItem } from './MediaViewerItem';
import { MediaViewerState } from './MediaViewerState';
import { MediaViewerToolbar } from './MediaViewerToolbar';

export interface MediaViewerScreenProps {
  messageId: string;
  initialIndex: number;
}

/**
 * Vuốt qua ảnh/video của MỘT tin — zoom pinch CHƯA dựng ở lượt này (app.md §3
 * ghi rõ, ưu tiên thấp nhất của cả module). Tải tin qua `GET /messages/:id`
 * thay vì đọc cache `ChatRoom` (route đứng ĐỘC LẬP ngoài tab, app.md §1 "modal
 * ngoài tab" — không có gì đảm bảo cache còn khi người dùng mở lại từ đâu đó khác).
 *
 * Chưa có tệp nào để xem (đang tải tin · tải lỗi · tin không còn ảnh/video) thì hiện `MediaViewerState` — ⛔ không để một màn
 * đen trống: thanh công cụ cần một tệp đính kèm nên lúc này nó vắng mặt, người dùng không có gì để bấm.
 */
export function MediaViewerScreen({ messageId, initialIndex }: MediaViewerScreenProps) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(initialIndex);
  const {
    data: message,
    isError,
    isLoading,
    refetch,
  } = useQuery({ queryKey: ['chat', 'media-viewer', messageId], queryFn: () => chatService.get(messageId) });
  const attachments = (message?.attachments ?? []).filter((a) => a.kind === 'IMAGE' || a.kind === 'VIDEO');
  const current = attachments[index];
  const { data: currentAsset } = useAssetUrl(current?.assetId);

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  const close = () => router.back();
  const emptyKind = isLoading ? 'loading' : isError ? 'error' : 'empty';

  return (
    // ⛔ `bg-black` không sinh class (`shared/ui/AGENTS.md` mục "bg-white/bg-black
    // không sinh ra class") — `ink-10` là bậc gần đen nhất của thang màu.
    <View className="flex-1 bg-ink-10">
      <StatusBar hidden />
      {attachments.length === 0 ? (
        <MediaViewerState kind={emptyKind} onClose={close} onRetry={() => void refetch()} />
      ) : (
        <ScrollView
          contentOffset={{ x: initialIndex * width, y: 0 }}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          onMomentumScrollEnd={handleScrollEnd}
        >
          {attachments.map((attachment) => (
            <MediaViewerItem key={attachment.assetId} attachment={attachment} />
          ))}
        </ScrollView>
      )}
      {current ? <MediaViewerToolbar assetUrl={currentAsset?.url} attachment={current} onClose={close} /> : null}
    </View>
  );
}
