import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { PomodoroMyActions } from '../api/pomodoro.types';
import { HostControls, type HostControlsProps } from '../components/HostControls';
import { NO_ACTIONS } from './fixtures';

/**
 * app.md p5-02 §8: host controls ẩn với người không phải host; Skip trong FOCUS hỏi xác nhận "Vòng này sẽ không được tính"; End xác nhận; nút loading riêng
 * và các nút khác khoá khi có lệnh đang chạy.
 */

const METRICS = { frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 44 } };

/** Thao tác phụ/phá huỷ (Cấu hình, Bỏ qua, Kết thúc phiên) nằm trong menu ⋯ — mở menu rồi bấm hàng. */
async function chooseFromMenu(label: string) {
  await fireEvent.press(screen.getByLabelText('Tuỳ chọn của chủ phòng'));
  await fireEvent.press(await screen.findByText(label));
}

const HOST: PomodoroMyActions = { ...NO_ACTIONS, canEnd: true, canPause: true, canSkip: true };

async function mount(over: Partial<HostControlsProps> = {}) {
  const onRun = jest.fn();
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <HostControls actions={HOST} busyKind={null} disabled={false} phase="FOCUS" onRun={onRun} {...over} />
    </SafeAreaProvider>,
  );
  return onRun;
}

it('người không phải chủ phòng (mọi cờ false) hoặc chưa có myActions: không hiện điều khiển nào', async () => {
  await mount({ actions: { ...NO_ACTIONS } });
  expect(screen.queryByLabelText('Điều khiển của chủ phòng')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Tạm dừng' })).toBeNull();
});

it('chưa có myActions ⇒ không hiện gì', async () => {
  await mount({ actions: undefined });
  expect(screen.queryByLabelText('Điều khiển của chủ phòng')).toBeNull();
});

it('Skip (trong menu ⋯) ở giờ TẬP TRUNG hỏi xác nhận, chỉ khi đồng ý mới gửi lệnh', async () => {
  const onRun = await mount();
  // Nút "Bỏ qua" KHÔNG còn là nút rời trên màn — chỉ nằm trong menu.
  expect(screen.queryByRole('button', { name: 'Bỏ qua vòng' })).toBeNull();

  await chooseFromMenu('Bỏ qua vòng');
  expect(await screen.findByText('Vòng này sẽ không được tính vào số vòng hoàn thành.')).toBeOnTheScreen();
  expect(onRun).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByRole('button', { name: 'Không' }));
  expect(onRun).not.toHaveBeenCalled();

  await chooseFromMenu('Bỏ qua vòng');
  await fireEvent.press(await screen.findByRole('button', { name: 'Vẫn bỏ qua' }));
  expect(onRun).toHaveBeenCalledWith('skip');
});

it('Skip ở giờ nghỉ KHÔNG cần xác nhận', async () => {
  const onRun = await mount({ phase: 'SHORT_BREAK' });
  await chooseFromMenu('Bỏ qua nghỉ');
  await waitFor(() => expect(onRun).toHaveBeenCalledWith('skip'));
});

it('Kết thúc phiên (hàng đỏ trong menu ⋯) hỏi xác nhận rồi mới gửi', async () => {
  const onRun = await mount();
  expect(screen.queryByRole('button', { name: 'Kết thúc' })).toBeNull();

  await chooseFromMenu('Kết thúc phiên');
  expect(await screen.findByText('Phiên sẽ kết thúc với mọi người trong phòng.')).toBeOnTheScreen();
  expect(onRun).not.toHaveBeenCalled();

  await fireEvent.press(await screen.findByRole('button', { name: 'Kết thúc phiên' }));
  expect(onRun).toHaveBeenCalledWith('end');
});

it('chỉ có MỘT nút chính trên màn (Tạm dừng); thao tác phụ đều ở trong menu', async () => {
  await mount({ actions: { ...NO_ACTIONS, canConfigure: true, canEnd: true, canPause: true, canSkip: true }, onConfigure: jest.fn() });
  expect(screen.getByRole('button', { name: 'Tạm dừng' })).toBeOnTheScreen();
  for (const name of ['Cấu hình', 'Bỏ qua vòng', 'Kết thúc']) {
    expect(screen.queryByRole('button', { name })).toBeNull();
  }
  expect(screen.getByLabelText('Tuỳ chọn của chủ phòng')).toBeOnTheScreen();
});

it('Tạm dừng gửi ngay (không cần xác nhận)', async () => {
  const onRun = await mount();
  await fireEvent.press(screen.getByRole('button', { name: 'Tạm dừng' }));
  expect(onRun).toHaveBeenCalledWith('pause');
});

it('WAITING: chủ phòng thấy Bắt đầu; PAUSED: thấy Tiếp tục thay cho Tạm dừng', async () => {
  const onRun = await mount({ actions: { ...NO_ACTIONS, canEnd: true, canStart: true }, phase: 'WAITING' });
  await fireEvent.press(screen.getByRole('button', { name: 'Bắt đầu' }));
  expect(onRun).toHaveBeenCalledWith('start');
});

it('PAUSED: Tiếp tục gửi resume', async () => {
  const onRun = await mount({ actions: { ...NO_ACTIONS, canEnd: true, canResume: true }, phase: 'PAUSED' });
  expect(screen.queryByRole('button', { name: 'Tạm dừng' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Tiếp tục' }));
  expect(onRun).toHaveBeenCalledWith('resume');
});

it('có lệnh đang chạy ⇒ các hàng trong menu khoá (không gửi hai lệnh chồng nhau)', async () => {
  const onRun = await mount({ busyKind: 'pause' });
  await chooseFromMenu('Bỏ qua vòng');
  expect(screen.getByRole('button', { name: 'Bỏ qua vòng' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Kết thúc phiên' })).toBeDisabled();
  expect(onRun).not.toHaveBeenCalled();
});

it('ngoại tuyến khoá mọi lệnh', async () => {
  await mount({ disabled: true });
  expect(screen.getByRole('button', { name: 'Tạm dừng' })).toBeDisabled();
});

it('WAITING: menu có Cấu hình (server nói canConfigure); bấm thì mở tấm cấu hình', async () => {
  const onConfigure = jest.fn();
  await mount({ actions: { ...NO_ACTIONS, canConfigure: true, canEnd: true, canStart: true }, onConfigure, phase: 'WAITING' });
  await chooseFromMenu('Cấu hình');
  await waitFor(() => expect(onConfigure).toHaveBeenCalledTimes(1));
});

it('phiên đã chạy (canConfigure=false) ⇒ menu không có Cấu hình', async () => {
  await mount({ onConfigure: jest.fn() });
  await fireEvent.press(screen.getByLabelText('Tuỳ chọn của chủ phòng'));
  expect(await screen.findByText('Kết thúc phiên')).toBeOnTheScreen();
  expect(screen.queryByText('Cấu hình')).toBeNull();
});
