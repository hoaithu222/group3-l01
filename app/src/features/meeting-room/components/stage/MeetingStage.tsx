import { useMemo } from 'react';
import { View } from 'react-native';

import type { StageLayout } from '../../store/meeting-room.store';
import { raisedHandOrder } from '../../utils/hand-queue.utils';
import { paginate, type RoomPerson } from '../../utils/room-people.utils';
import { AloneStage } from './AloneStage';
import { GridPager } from './GridPager';
import { OneOnOneStage } from './OneOnOneStage';
import { PageDots } from './PageDots';
import { ScreenShareSpotlight } from './ScreenShareSpotlight';
import { SpeakerLayout } from './SpeakerLayout';
import type { RenderVideo } from './stage.types';
import { useLatestCallback } from './useLatestCallback';

export interface MeetingStageProps {
  /** Điện thoại nằm ngang (`useBreakpoint().isLandscape`): hai người chia hai cột, dải ô nhỏ thành cột bên phải. */
  landscape: boolean;
  layout: StageLayout;
  onChangePage: (page: number) => void;
  /** Có người chia sẻ: báo vào/ra toàn màn hình để cha ẩn tiêu đề + thanh điều khiển. */
  onExpandedChange?: (expanded: boolean) => void;
  /** Thiếu thì ẩn nút "Mời người khác" của trạng thái chỉ có mình. */
  onInvite?: () => void;
  /** `null` = bỏ ghim. Ghim là CỤC BỘ (chỉ mình thấy) — không gọi server. */
  onPin: (userId: string | null) => void;
  /** Khi CHÍNH MÌNH đang chia sẻ: nút "Dừng chia sẻ" ngay trên sân khấu. */
  onStopShare?: () => void;
  /** Trang lưới đang xem (0-based). */
  page: number;
  /** Số ô mỗi trang: 4 điện thoại · 9 máy tính bảng (`GRID_PAGE_SIZE`). */
  pageSize: number;
  /** ĐÃ sắp bởi cha (`sortForStage`): ghim → đang nói → giơ tay → camera bật → vào trước. */
  people: RoomPerson[];
  pinnedUserId: string | null;
  renderVideo: RenderVideo;
}

/**
 * Sân khấu phòng họp — chọn bố cục theo THỨ TỰ ưu tiên:
 *  1. chỉ có mình (hoặc chưa ai) → `AloneStage`: ô của mình + "Bạn đang là người duy nhất ở đây" + "Mời người khác";
 *  2. có người chia sẻ màn hình → `ScreenShareSpotlight` (chia sẻ chiếm vùng chính) — bố cục Lưới/Diễn giả tạm nhường chỗ;
 *  3. Lưới + đúng 1:1 (mình và MỘT người) → `OneOnOneStage`: người kia full sân khấu, mình là khung tự xem kéo được;
 *  4. bố cục Diễn giả → `SpeakerLayout`;
 *  5. còn lại → lưới phân trang (`GridPager` + `PageDots`).
 *
 * ✅ Thứ tự giơ tay (`raisedHandOrder`) tính MỘT lần ở đây cho cả sân khấu — số "✋ 2" trên ô trùng với danh sách người và viên đếm.
 * ✅ Callback xuống ô có danh tính CỐ ĐỊNH (`useLatestCallback`): cha truyền hàm nội tuyến mới ở mỗi snapshot, chuyển thẳng xuống là phá
 *    `memo` của mọi ô.
 * ⛔ Nền `ink-10` cố định ở CẢ HAI theme (sân khấu video luôn tối) — mọi chữ trên sân khấu dùng `fg-on-nav*`, không dùng `bg-bg-*`/`fg-1`.
 */
export function MeetingStage({
  landscape,
  layout,
  onChangePage,
  onExpandedChange,
  onInvite,
  onPin,
  onStopShare,
  page,
  pageSize,
  people,
  pinnedUserId,
  renderVideo,
}: MeetingStageProps) {
  const handOrder = useMemo(() => raisedHandOrder(people), [people]);
  // Nhấn giữ một ô đang ghim = bỏ ghim; ô khác = ghim ô đó (cha chỉ nhớ MỘT người được ghim).
  const togglePin = useLatestCallback((userId: string) => onPin(userId === pinnedUserId ? null : userId));
  const changePage = useLatestCallback((next: number) => onChangePage(next));

  if (people.length <= 1) {
    const only = people[0];
    return (
      <View className="flex-1 bg-ink-10">
        <AloneStage
          handOrder={only ? handOrder.get(only.userId) : undefined}
          landscape={landscape}
          person={only}
          pinned={only?.userId === pinnedUserId}
          renderVideo={renderVideo}
          onInvite={onInvite}
          onLongPressTile={togglePin}
        />
      </View>
    );
  }

  const sharer = people.find((person) => person.screenShareRef);
  if (sharer) {
    return (
      <View className="flex-1 bg-ink-10">
        <ScreenShareSpotlight
          handOrder={handOrder}
          landscape={landscape}
          people={people}
          pinnedUserId={pinnedUserId}
          renderVideo={renderVideo}
          sharer={sharer}
          onExpandedChange={onExpandedChange}
          onLongPressTile={togglePin}
          onStopShare={onStopShare}
        />
      </View>
    );
  }

  const me = people.find((person) => person.isLocal);
  const other = people.find((person) => !person.isLocal);
  if (layout === 'GRID' && people.length === 2 && me && other) {
    return (
      <View className="flex-1 bg-ink-10">
        <OneOnOneStage
          handOrder={handOrder}
          me={me}
          other={other}
          pinnedUserId={pinnedUserId}
          renderVideo={renderVideo}
          onLongPressTile={togglePin}
        />
      </View>
    );
  }

  if (layout === 'SPEAKER') {
    return (
      <View className="flex-1 bg-ink-10">
        <SpeakerLayout
          handOrder={handOrder}
          landscape={landscape}
          people={people}
          pinnedUserId={pinnedUserId}
          renderVideo={renderVideo}
          onLongPressTile={togglePin}
        />
      </View>
    );
  }

  const pages = paginate(people, pageSize);
  const current = Math.min(Math.max(page, 0), pages.length - 1);

  return (
    <View className="flex-1 bg-ink-10">
      <GridPager
        handOrder={handOrder}
        landscape={landscape}
        page={current}
        pages={pages}
        pinnedUserId={pinnedUserId}
        renderVideo={renderVideo}
        onChangePage={changePage}
        onLongPressTile={togglePin}
      />
      <PageDots activeIndex={current} className="mb-xs" count={pages.length} />
    </View>
  );
}
