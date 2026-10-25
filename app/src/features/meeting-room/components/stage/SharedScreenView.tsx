import { memo } from 'react';
import { Text, View } from 'react-native';

import type { RenderVideo } from './stage.types';
import { sameVideoRef } from './tile-equality.utils';
import { ZoomableShareView } from './ZoomableShareView';

export interface SharedScreenViewProps {
  /** Chạm đơn lên nội dung — cha bật/tắt toàn màn hình. ⚠️ Hàm ổn định (`useCallback`), không thì `memo` vô dụng. */
  onTap: () => void;
  renderVideo: RenderVideo;
  /** `screenShareRef` của người chia sẻ (KHÔNG phải mình — cha lo ca gương đối gương). */
  shareRef: unknown;
}

function SharedScreenViewBase({ onTap, renderVideo, shareRef }: SharedScreenViewProps) {
  const content = renderVideo(shareRef, { objectFit: 'contain' });
  if (!content) {
    return (
      <View className="flex-1 items-center justify-center px-md">
        <Text className="text-center text-body-md text-fg-on-nav-muted">
          Đang tải màn hình chia sẻ…
        </Text>
      </View>
    );
  }
  return <ZoomableShareView onTap={onTap}>{content}</ZoomableShareView>;
}

/**
 * Nội dung màn hình được chia sẻ (phóng/kéo được) — hoặc chữ "Đang tải…" khi chưa vẽ được track.
 *
 * ✅ `memo` + `sameVideoRef`: sân khấu vẽ lại theo MỖI snapshot media (người nói, chất lượng mạng) và adapter cấp `screenShareRef` MỚI mỗi
 * lần — không chặn ở đây thì phần tử video chia sẻ và cử chỉ phóng bị dựng lại liên tục dù vẫn cùng một track.
 */
export const SharedScreenView = memo(
  SharedScreenViewBase,
  (a, b) =>
    a.onTap === b.onTap && a.renderVideo === b.renderVideo && sameVideoRef(a.shareRef, b.shareRef),
);
