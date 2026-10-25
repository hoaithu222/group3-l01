import { act, renderHook } from '@testing-library/react-native';

import { useBreakpoint } from '@/shared/theme/use-breakpoint';

import { GRID_PAGE_SIZE, MAX_SUBSCRIBED_VIDEOS } from '../constants/meeting-room.constants';
import { useGridPaging } from '../hooks/useGridPaging';
import { FakeMeetingMedia } from '../media/meeting-media.fake';
import { setMeetingMediaForTests } from '../media/meeting-media.registry';
import { meetingRoomApi } from '../store/meeting-room.store';
import type { RoomPerson } from '../utils/room-people.utils';
import { makePerson } from './fixtures';

/**
 * Lưới phân trang + chỉ subscribe video của người đang hiện (app.md §6, §8): trang 2 KHÔNG còn subscribe video của trang 1; người ghim và người
 * chia sẻ màn hình luôn được giữ; điện thoại 4 ô/trang, máy tính bảng 9.
 */
jest.mock('@/shared/theme/use-breakpoint', () => ({ useBreakpoint: jest.fn() }));

const breakpoint = jest.mocked(useBreakpoint);
let media: FakeMeetingMedia;

const people = (n: number, from = 1): RoomPerson[] => Array.from({ length: n }, (_, i) => makePerson({ userId: `u${from + i}` }));
const lastSubscription = (): readonly string[] | undefined => media.subscriptions.at(-1);

beforeEach(() => {
  meetingRoomApi.reset();
  media = new FakeMeetingMedia();
  setMeetingMediaForTests(media);
  breakpoint.mockReturnValue({ height: 800, isLandscape: false, isTablet: false, tier: 'phone', width: 390 });
});

afterEach(() => {
  meetingRoomApi.reset();
  setMeetingMediaForTests(null);
});

describe('useGridPaging', () => {
  it(`điện thoại ${GRID_PAGE_SIZE.phone} ô/trang: trang 1 subscribe đúng người của trang; số trang theo số người`, async () => {
    const { result } = await renderHook(() => useGridPaging(people(6)));

    expect(result.current).toMatchObject({ landscape: false, page: 0, pageCount: 2, pageSize: GRID_PAGE_SIZE.phone });
    expect(lastSubscription()).toEqual(['u1', 'u2', 'u3', 'u4']);
  });

  it('sang trang 2: bỏ subscribe video của trang 1, chỉ còn người của trang 2', async () => {
    const list = people(6);
    const { result } = await renderHook(() => useGridPaging(list));

    await act(async () => result.current.setPage(1));
    expect(result.current.page).toBe(1);
    expect(lastSubscription()).toEqual(['u5', 'u6']);
    expect(lastSubscription()).not.toContain('u1');
  });

  it('máy tính bảng: 9 ô/trang', async () => {
    breakpoint.mockReturnValue({ height: 800, isLandscape: true, isTablet: true, tier: 'tablet', width: 1000 });
    const { result } = await renderHook(() => useGridPaging(people(10)));

    expect(result.current).toMatchObject({ landscape: true, pageCount: 2, pageSize: GRID_PAGE_SIZE.tablet });
    expect(lastSubscription()).toHaveLength(9);
  });

  it('người ĐANG GHIM và người CHIA SẺ MÀN HÌNH ở trang khác vẫn được subscribe (chia sẻ, ghim đứng đầu)', async () => {
    const list = [...people(6), makePerson({ screenShareRef: {}, userId: 'sharer' })];
    meetingRoomApi.patch({ pinnedUserId: 'u6' });
    await renderHook(() => useGridPaging(list));

    expect(lastSubscription()?.slice(0, 2)).toEqual(['sharer', 'u6']);
    expect(lastSubscription()).toEqual(expect.arrayContaining(['u1', 'u2']));
  });

  it(`bố cục Diễn giả: subscribe theo người nói/ghim + dải thu nhỏ, tối đa ${MAX_SUBSCRIBED_VIDEOS}`, async () => {
    meetingRoomApi.patch({ layout: 'SPEAKER' });
    const list = [makePerson({ isSpeaking: true, userId: 'noi' }), ...people(12)];
    await renderHook(() => useGridPaging(list));

    expect(lastSubscription()).toHaveLength(MAX_SUBSCRIBED_VIDEOS);
    expect(lastSubscription()?.[0]).toBe('noi');
  });

  it('có người rời làm trang hiện tại rỗng → tự lùi về trang còn người (store cũng được cập nhật)', async () => {
    meetingRoomApi.patch({ page: 1 });
    const { rerender, result } = await renderHook(({ list }: { list: RoomPerson[] }) => useGridPaging(list), { initialProps: { list: people(6) } });
    expect(result.current.page).toBe(1);

    await rerender({ list: people(3) });
    expect(result.current).toMatchObject({ page: 0, pageCount: 1 });
    expect(meetingRoomApi.get().page).toBe(0);
  });

  it('`setPage` giữ NGUYÊN danh tính qua các lần vẽ (sân khấu memo hoá ô — hàm mới mỗi snapshot là vẽ lại cả lưới)', async () => {
    const { rerender, result } = await renderHook(({ list }: { list: RoomPerson[] }) => useGridPaging(list), { initialProps: { list: people(6) } });
    const first = result.current.setPage;

    await rerender({ list: people(6) });
    expect(result.current.setPage).toBe(first);
  });

  it('phòng trống không làm hỏng: không trang, subscribe rỗng', async () => {
    const { result } = await renderHook(() => useGridPaging([]));
    expect(result.current).toMatchObject({ page: 0, pageCount: 0 });
    expect(lastSubscription()).toEqual([]);
  });
});
