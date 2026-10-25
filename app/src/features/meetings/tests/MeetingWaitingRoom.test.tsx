import { act, screen } from '@testing-library/react-native';

import type { MeetingDetailDto } from '../api/meetings.types';
import { MeetingActionsBar } from '../components/detail/MeetingActionsBar';
import { MeetingTimeHero } from '../components/detail/MeetingTimeHero';
import { useJoinWindowRefetch } from '../hooks/useJoinWindowRefetch';
import { useMeetingClock } from '../hooks/useMeetingClock';
import { makeActions, makeMeeting } from './fixtures';
import { renderWithProviders } from './render-helpers';

/**
 * PHÒNG CHỜ (app.md p2-04 §3 `MeetingTimeHero`, §4.1, §7): đếm ngược theo GIỜ SERVER, tới `joinOpensAt` thì hỏi lại server (client không
 * tự suy quyền), đếm về 0 KHÔNG tự vào phòng. Dùng đồng hồ giả — mốc thời gian chính xác đến giây.
 */
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

/** Cuộc họp 02:00Z, phòng chờ mở 01:50Z; `serverNow` do từng ca đặt. */
const SERVER_NOW = '2026-09-30T01:49:50.000Z';

function Harness({ meeting, refetch }: { meeting: MeetingDetailDto; refetch: () => void }) {
  const clock = useMeetingClock(meeting);
  useJoinWindowRefetch(clock.joinRemainingMs, refetch);
  return (
    <>
      <MeetingTimeHero meeting={meeting} nowMs={clock.nowMs} />
      <MeetingActionsBar joinRemainingMs={clock.joinRemainingMs} meeting={meeting} />
    </>
  );
}

const before = makeMeeting({ myActions: makeActions({ canRsvp: true }), serverNow: SERVER_NOW });
const tick = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

afterEach(() => jest.useRealTimers());

describe('phòng chờ trước giờ họp', () => {
  it('trước khi mở: đếm ngược tới giờ họp, nói khi nào phòng mở, nút vào KHOÁ', async () => {
    jest.useFakeTimers({ now: Date.parse(SERVER_NOW) });
    const refetch = jest.fn();
    await renderWithProviders(<Harness meeting={before} refetch={refetch} />);

    expect(screen.getByText('Bắt đầu sau 10 phút')).toBeOnTheScreen();
    expect(
      screen.getByText(/^Phòng chờ mở lúc \d{2}:\d{2} \(10 phút trước giờ họp\)\.$/),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Vào phòng chờ' })).toBeDisabled();
    expect(refetch).not.toHaveBeenCalled();
  });

  it('tới joinOpensAt: làm mới chi tiết ĐÚNG MỘT LẦN (server bật canJoin), giao diện chuyển "phòng chờ đã mở"', async () => {
    jest.useFakeTimers({ now: Date.parse(SERVER_NOW) });
    const refetch = jest.fn();
    await renderWithProviders(<Harness meeting={before} refetch={refetch} />);

    await tick(9_000);
    expect(refetch).not.toHaveBeenCalled();
    await tick(2_000); // qua 01:50:00
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Phòng chờ đã mở — bạn có thể vào trước giờ họp.')).toBeOnTheScreen();
    // Server CHƯA trả canJoin ⇒ nút vẫn không tự bật.
    expect(screen.queryByRole('button', { name: 'Vào phòng chờ' })).toBeNull();

    await tick(30_000);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('đồng hồ MÁY lệch: đếm theo giờ SERVER, không theo đồng hồ máy', async () => {
    // Máy chậm 5 phút so với server: server 01:55:00, máy 01:50:00.
    jest.useFakeTimers({ now: Date.parse('2026-09-30T01:50:00.000Z') });
    const skewed = makeMeeting({
      myActions: makeActions({ canRsvp: true }),
      serverNow: '2026-09-30T01:55:00.000Z',
    });
    await renderWithProviders(<Harness meeting={skewed} refetch={jest.fn()} />);

    expect(screen.getByText('Bắt đầu sau 5 phút')).toBeOnTheScreen();
    expect(screen.getByText('Phòng chờ đã mở — bạn có thể vào trước giờ họp.')).toBeOnTheScreen();
  });

  it('dữ liệu nằm trong CACHE 5 phút vẫn đếm đúng nhờ receivedAt (không lệch đúng bằng tuổi cache)', async () => {
    jest.useFakeTimers({ now: Date.parse('2026-09-30T01:49:50.000Z') });
    const cached = makeMeeting({
      myActions: makeActions({ canRsvp: true }),
      receivedAt: Date.parse('2026-09-30T01:44:50.000Z'),
      serverNow: '2026-09-30T01:44:50.000Z',
    });
    await renderWithProviders(<Harness meeting={cached} refetch={jest.fn()} />);

    // Đúng giờ server hiện tại là 01:49:50 ⇒ còn 10 phút (nếu bỏ qua tuổi cache sẽ hiện 15 phút).
    expect(screen.getByText('Bắt đầu sau 10 phút')).toBeOnTheScreen();
  });

  it('mở màn khi phòng chờ ĐÃ mở: không refetch thừa; server đã bật canJoin ⇒ nút vào bật, đếm về 0 không tự vào', async () => {
    jest.useFakeTimers({ now: Date.parse('2026-09-30T01:59:50.000Z') });
    const open = makeMeeting({
      myActions: makeActions({ canJoin: true, joinVia: 'WAIT_FOR_HOST' }),
      serverNow: '2026-09-30T01:59:50.000Z',
    });
    const refetch = jest.fn();
    await renderWithProviders(<Harness meeting={open} refetch={refetch} />);

    expect(screen.getByRole('button', { name: 'Vào phòng chờ' })).toBeEnabled();
    await tick(20_000); // quá giờ họp
    expect(screen.getByText('Đã tới giờ họp')).toBeOnTheScreen();
    expect(screen.getByText('Đang chờ chủ trì bắt đầu cuộc họp.')).toBeOnTheScreen();
    expect(refetch).not.toHaveBeenCalled();
  });

  it('họp đang diễn ra: đếm thời gian đã diễn ra theo giờ server', async () => {
    jest.useFakeTimers({ now: Date.parse('2026-09-30T02:14:22.000Z') });
    const live = makeMeeting({
      serverNow: '2026-09-30T02:14:22.000Z',
      startedAt: '2026-09-30T02:00:00.000Z',
      status: 'LIVE',
    });
    await renderWithProviders(<Harness meeting={live} refetch={jest.fn()} />);

    expect(screen.getByText('Đang diễn ra 00:14:22')).toBeOnTheScreen();
    await tick(3_000);
    expect(screen.getByText('Đang diễn ra 00:14:25')).toBeOnTheScreen();
  });
});
