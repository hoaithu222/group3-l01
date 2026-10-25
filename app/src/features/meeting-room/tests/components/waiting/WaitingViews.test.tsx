import { fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { JoinBlockedView } from '../../../components/waiting/JoinBlockedView';
import { LobbyWaitingView } from '../../../components/waiting/LobbyWaitingView';
import { WaitingForHostView } from '../../../components/waiting/WaitingForHostView';
import { BLOCKED_COPY } from '../../../constants/meeting-room.constants';
import type { BlockedCode } from '../../../api/meeting-room.types';
import { renderWithProviders } from '../prejoin/render-helpers';

/** Ba màn chờ/không vào được của người tham dự (app.md p2-05 §3.2): chờ chủ trì · chờ lobby · bị chặn. */

describe('WaitingForHostView', () => {
  const base = { startAt: '2026-10-01T09:00:00.000Z', title: 'Họp giao ban' };

  it('nói rõ chủ trì chưa bắt đầu + đếm ngược theo remainingMs cha truyền', async () => {
    await renderWithProviders(<WaitingForHostView {...base} remainingMs={252_000} onExit={jest.fn()} />);

    expect(screen.getByText('Chủ trì chưa bắt đầu cuộc họp')).toBeOnTheScreen();
    expect(screen.getByText('Họp giao ban')).toBeOnTheScreen();
    expect(screen.getByText('Còn 4 phút 12 giây')).toBeOnTheScreen();
    expect(screen.getByText(/^Cuộc họp bắt đầu lúc \d{2}:\d{2}\./)).toBeOnTheScreen();
  });

  it('đã quá giờ mà chủ trì chưa bắt đầu: "Sắp bắt đầu", không hiện số âm', async () => {
    await renderWithProviders(<WaitingForHostView {...base} remainingMs={0} onExit={jest.fn()} />);

    expect(screen.getByText('Sắp bắt đầu')).toBeOnTheScreen();
  });

  it('"Thoát" gọi onExit; khe xem trước được vẽ nếu cha truyền', async () => {
    const onExit = jest.fn();
    await renderWithProviders(
      <WaitingForHostView {...base} previewSlot={<Text>KHUNG XEM TRƯỚC</Text>} remainingMs={5_000} onExit={onExit} />,
    );

    expect(screen.getByText('KHUNG XEM TRƯỚC')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Thoát' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

describe('LobbyWaitingView', () => {
  it('"Đang chờ chủ trì cho vào…" + "Huỷ yêu cầu" gọi onCancel (reduce motion: không hoạt ảnh)', async () => {
    const onCancel = jest.fn();
    await renderWithProviders(<LobbyWaitingView reduceMotion title="Họp giao ban" onCancel={onCancel} />);

    expect(screen.getByText('Đang chờ chủ trì cho vào…')).toBeOnTheScreen();
    expect(screen.getByText('Họp giao ban')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Huỷ yêu cầu' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('đang huỷ: nút báo busy và không gọi lại onCancel', async () => {
    const onCancel = jest.fn();
    await renderWithProviders(<LobbyWaitingView cancelling reduceMotion onCancel={onCancel} />);

    const button = screen.getByRole('button', { name: 'Huỷ yêu cầu' });
    expect(button).toBeBusy();
    await fireEvent.press(button);
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe('JoinBlockedView', () => {
  const CODES = Object.keys(BLOCKED_COPY) as BlockedCode[];

  it.each(CODES)('mã %s: đúng tiêu đề + mô tả trung tính của BLOCKED_COPY', async (code) => {
    await renderWithProviders(<JoinBlockedView code={code} onClose={jest.fn()} />);

    expect(screen.getByText(BLOCKED_COPY[code].title)).toBeOnTheScreen();
    expect(screen.getByText(BLOCKED_COPY[code].description)).toBeOnTheScreen();
  });

  it('MEET_010 + onOpenExternal: có nút "Mở liên kết cuộc họp" gọi handler, kèm "Về chi tiết cuộc họp"', async () => {
    const onOpenExternal = jest.fn();
    const onClose = jest.fn();
    await renderWithProviders(<JoinBlockedView code="MEET_010" onClose={onClose} onOpenExternal={onOpenExternal} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Mở liên kết cuộc họp' }));
    expect(onOpenExternal).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Về chi tiết cuộc họp' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('mã khác MEET_010 KHÔNG có nút mở liên kết dù cha truyền handler; MEET_010 thiếu handler cũng không', async () => {
    const { rerender } = await renderWithProviders(<JoinBlockedView code="MEET_007" onClose={jest.fn()} onOpenExternal={jest.fn()} />);
    expect(screen.queryByText('Mở liên kết cuộc họp')).toBeNull();

    await rerender(<JoinBlockedView code="MEET_010" onClose={jest.fn()} />);
    expect(screen.queryByText('Mở liên kết cuộc họp')).toBeNull();
  });

  it('GONE (không còn chi tiết để quay về): nút là "Đóng"', async () => {
    await renderWithProviders(<JoinBlockedView code="GONE" onClose={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Đóng' })).toBeOnTheScreen();
    expect(screen.queryByText('Về chi tiết cuộc họp')).toBeNull();
  });
});
