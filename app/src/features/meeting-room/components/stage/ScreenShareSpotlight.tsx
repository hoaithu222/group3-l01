import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';

import type { RoomPerson } from '../../utils/room-people.utils';
import { SharedScreenView } from './SharedScreenView';
import type { RenderVideo } from './stage.types';
import { ThumbnailStrip } from './ThumbnailStrip';
import { useLatestCallback } from './useLatestCallback';

export interface ScreenShareSpotlightProps {
  /** Thứ tự giơ tay của CẢ phòng (`MeetingStage` tính một lần) cho dải ô nhỏ. */
  handOrder?: ReadonlyMap<string, number>;
  /** Điện thoại nằm ngang: dải ô nhỏ thành cột bên phải nội dung chia sẻ. */
  landscape?: boolean;
  /** Báo cha khi vào/ra toàn màn hình — cha ẩn thanh điều khiển/tiêu đề để nhường chỗ cho nội dung chia sẻ. */
  onExpandedChange?: (expanded: boolean) => void;
  onLongPressTile: (userId: string) => void;
  /** Người đang chia sẻ màn hình của CHÍNH MÌNH bấm "Dừng chia sẻ" ngay trên sân khấu. */
  onStopShare?: () => void;
  /** MỌI người trong phòng (kể cả người chia sẻ) — chạy thành dải ô nhỏ dưới nội dung. */
  people: RoomPerson[];
  pinnedUserId: string | null;
  renderVideo: RenderVideo;
  sharer: RoomPerson;
}

/**
 * Có người chia sẻ màn hình: nội dung chia sẻ chiếm vùng chính (pinch/chạm đúp để phóng), dải ô nhỏ bên dưới (bên phải khi nằm ngang).
 * Chạm nội dung — hoặc nút "Toàn màn hình" — ẩn dải ô nhỏ để nội dung chiếm hết sân khấu.
 *
 * ⛔ Người chia sẻ là CHÍNH MÌNH thì KHÔNG vẽ track màn hình của mình (vẽ ra là gương đối gương: màn hình chứa chính khung này): hiện
 * thông báo + nút "Dừng chia sẻ". Nút "Toàn màn hình" tồn tại NGOÀI cử chỉ chạm vì trình đọc màn hình không kích hoạt được cử chỉ.
 * ⛔ Báo "ra toàn màn hình" cả khi khung này bị THÁO lúc đang phóng (người kia dừng chia sẻ): trước đây cha nhận `true` rồi không bao giờ
 * nhận `false` ⇒ tiêu đề + thanh điều khiển ẩn mãi trên lưới thường, không còn nút Rời. Effect dọn dẹp lo việc đó.
 */
export function ScreenShareSpotlight({
  handOrder,
  landscape = false,
  onExpandedChange,
  onLongPressTile,
  onStopShare,
  people,
  pinnedUserId,
  renderVideo,
  sharer,
}: ScreenShareSpotlightProps) {
  const [expanded, setExpanded] = useState(false);
  const report = useLatestCallback((value: boolean) => onExpandedChange?.(value));
  useEffect(() => {
    if (!expanded) return undefined;
    report(true);
    return () => report(false);
  }, [expanded, report]);
  // Danh tính cố định: `SharedScreenView` được `memo`, hàm mới mỗi lần vẽ là dựng lại video chia sẻ + cử chỉ phóng.
  const toggle = useCallback(() => setExpanded((value) => !value), []);

  return (
    <View className={landscape ? 'flex-1 flex-row' : 'flex-1'}>
      <View className="flex-1">
        {sharer.isLocal ? (
          <View className="flex-1 items-center justify-center gap-sm px-md">
            <Text className="text-center text-label-lg text-fg-on-nav">Mọi người đang xem màn hình của bạn</Text>
            {onStopShare ? <Button label="Dừng chia sẻ" variant="white" onPress={onStopShare} /> : null}
          </View>
        ) : (
          <SharedScreenView renderVideo={renderVideo} shareRef={sharer.screenShareRef} onTap={toggle} />
        )}
        <View className="absolute inset-x-0 top-0 flex-row items-center justify-between gap-xs p-xs" pointerEvents="box-none">
          <View className="shrink rounded-full bg-overlay px-sm py-2xs">
            <Text className="text-caption-sm text-fg-on-nav" maxFontSizeMultiplier={1.3} numberOfLines={1}>
              {sharer.isLocal ? 'Bạn' : sharer.name} đang chia sẻ màn hình
            </Text>
          </View>
          <Button label={expanded ? 'Thu nhỏ' : 'Toàn màn hình'} size="xs" variant="white" onPress={toggle} />
        </View>
      </View>
      {expanded ? null : (
        <ThumbnailStrip
          handOrder={handOrder}
          people={people}
          pinnedUserId={pinnedUserId}
          renderVideo={renderVideo}
          vertical={landscape}
          onLongPressTile={onLongPressTile}
        />
      )}
    </View>
  );
}
