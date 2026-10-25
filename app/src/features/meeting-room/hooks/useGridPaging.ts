import { useEffect, useMemo } from 'react';

import { useBreakpoint } from '@/shared/theme/use-breakpoint';

import { GRID_PAGE_SIZE, MAX_SUBSCRIBED_VIDEOS } from '../constants/meeting-room.constants';
import { getMeetingMedia } from '../media/meeting-media.registry';
import { meetingRoomApi, useMeetingRoomStore } from '../store/meeting-room.store';
import { paginate, videoIdentitiesToSubscribe, type RoomPerson } from '../utils/room-people.utils';

interface GridPaging {
  landscape: boolean;
  page: number;
  pageCount: number;
  pageSize: number;
  setPage: (page: number) => void;
}

/**
 * Đổi trang = ghi store. Hàm ở cấp MODULE (danh tính cố định): trước đây là arrow nội tuyến trong `return` ⇒ mỗi lần `InRoomView` vẽ lại
 * (theo MỖI snapshot media) sân khấu nhận một `onChangePage` mới.
 */
const setPage = (page: number): void => meetingRoomApi.patch({ page });

/**
 * Chia trang lưới (điện thoại 2×2, máy tính bảng 3×3) và CHỈ subscribe video của người đang hiện: trang hiện tại + người ghim + người chia sẻ
 * màn hình + người đang nói, tối đa `MAX_SUBSCRIBED_VIDEOS` (app.md §6). Âm thanh luôn nhận từ mọi người. Người vào/ra làm trang cuối rỗng thì
 * tự lùi về trang còn có người.
 */
export function useGridPaging(ordered: RoomPerson[]): GridPaging {
  const { isLandscape, isTablet } = useBreakpoint();
  const layout = useMeetingRoomStore((state) => state.layout);
  const page = useMeetingRoomStore((state) => state.page);
  const pinnedUserId = useMeetingRoomStore((state) => state.pinnedUserId);
  const pageSize = isTablet ? GRID_PAGE_SIZE.tablet : GRID_PAGE_SIZE.phone;
  const pages = useMemo(() => paginate(ordered, pageSize), [ordered, pageSize]);
  const current = Math.min(page, Math.max(0, pages.length - 1));

  const wanted = useMemo(() => {
    const visible = layout === 'GRID' ? (pages[current] ?? []) : ordered.slice(0, MAX_SUBSCRIBED_VIDEOS);
    return videoIdentitiesToSubscribe(visible, {
      max: MAX_SUBSCRIBED_VIDEOS,
      pinnedUserId,
      sharerUserId: ordered.find((p) => p.screenShareRef)?.userId ?? null,
      speakerUserId: ordered.find((p) => p.isSpeaking && !p.isLocal)?.userId ?? null,
    });
  }, [current, layout, ordered, pages, pinnedUserId]);
  const wantedKey = wanted.join('|');

  useEffect(() => {
    getMeetingMedia().setVideoSubscriptions(wantedKey ? wantedKey.split('|') : []);
  }, [wantedKey]);

  useEffect(() => {
    if (page !== current) meetingRoomApi.patch({ page: current });
  }, [current, page]);

  return { landscape: isLandscape, page: current, pageCount: pages.length, pageSize, setPage };
}
