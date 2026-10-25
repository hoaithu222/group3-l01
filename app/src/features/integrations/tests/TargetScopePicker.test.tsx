import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { IntegrationTarget } from '../api/integrations.types';
import { TargetScopePicker } from '../components/TargetScopePicker';
import { useTargetChannels, useTargetGroupChats } from '../queries/integrations.queries';

/**
 * Chọn nơi nhận tin (p5-03 P1): kênh HOẶC nhóm chat (GROUP). Khoá: danh sách gộp cả hai loại; chọn nhóm chat gửi `scopeType: 'CONVERSATION'`
 * (BE cần cả loại lẫn id); nhóm chat luôn kèm cảnh báo riêng tư; đích hiện tại là nhóm chat hiện đúng nhãn (kể cả tên bị ẩn).
 */
jest.mock('react-native-keyboard-controller', () =>
  jest.requireActual('react-native-keyboard-controller/jest'),
);
jest.mock('../queries/integrations.queries', () => ({
  useTargetChannels: jest.fn(),
  useTargetGroupChats: jest.fn(),
}));

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};
const Wrapper = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>
);

const channelTarget: IntegrationTarget = {
  name: 'chung',
  private: false,
  scopeId: 'ch-1',
  scopeType: 'CHANNEL',
};
const groupTarget: IntegrationTarget = {
  name: 'Nhóm đồ án',
  private: true,
  scopeId: 'cv-1',
  scopeType: 'CONVERSATION',
};

function mockLists({ failed = false }: { failed?: boolean } = {}) {
  jest.mocked(useTargetChannels).mockReturnValue({
    data: failed
      ? undefined
      : [
          { id: 'ch-1', name: 'chung', type: 'TEXT', visibility: 'PUBLIC' },
          { id: 'ch-2', name: 'ban-quan-tri', type: 'TEXT', visibility: 'PRIVATE' },
        ],
    isError: failed,
    isLoading: false,
  } as unknown as ReturnType<typeof useTargetChannels>);
  jest.mocked(useTargetGroupChats).mockReturnValue({
    data: failed
      ? undefined
      : [{ id: 'cv-1', readOnly: false, status: 'ACTIVE', title: 'Nhóm đồ án' }],
    isError: failed,
    isLoading: false,
  } as unknown as ReturnType<typeof useTargetGroupChats>);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLists();
});

describe('TargetScopePicker', () => {
  it('đích hiện tại là kênh công khai: nhãn "#tên", KHÔNG có cảnh báo riêng tư', async () => {
    await render(
      <TargetScopePicker current={channelTarget} value={null} wsId="ws-1" onChange={jest.fn()} />,
      { wrapper: Wrapper },
    );

    expect(screen.getByRole('button', { name: 'Nơi nhận thông báo' })).toHaveAccessibilityValue({
      text: '#chung',
    });
    expect(screen.queryByText(/Thông báo sẽ hiển thị với/)).toBeNull();
  });

  it('đích hiện tại là nhóm chat: nhãn "Nhóm chat · tên" và cảnh báo hiển thị với thành viên nhóm chat', async () => {
    await render(
      <TargetScopePicker current={groupTarget} value={null} wsId="ws-1" onChange={jest.fn()} />,
      { wrapper: Wrapper },
    );

    expect(screen.getByRole('button', { name: 'Nơi nhận thông báo' })).toHaveAccessibilityValue({
      text: 'Nhóm chat · Nhóm đồ án',
    });
    expect(
      screen.getByText('Thông báo sẽ hiển thị với thành viên nhóm chat này.'),
    ).toBeOnTheScreen();
  });

  it('nhóm chat người xem không đọc được (tên null): không lộ tên, chỉ nói "Nhóm chat riêng tư"', async () => {
    await render(
      <TargetScopePicker
        current={{ ...groupTarget, name: null }}
        value={null}
        wsId="ws-1"
        onChange={jest.fn()}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByRole('button', { name: 'Nơi nhận thông báo' })).toHaveAccessibilityValue({
      text: 'Nhóm chat riêng tư',
    });
  });

  it('mở tấm chọn: có CẢ kênh lẫn nhóm chat; chọn nhóm chat → onChange với scopeType CONVERSATION và private = true', async () => {
    const onChange = jest.fn();
    await render(
      <TargetScopePicker current={channelTarget} value={null} wsId="ws-1" onChange={onChange} />,
      { wrapper: Wrapper },
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Nơi nhận thông báo' }));

    expect(screen.getByText('#ban-quan-tri')).toBeOnTheScreen();
    expect(screen.getByText('Kênh riêng tư')).toBeOnTheScreen();
    expect(screen.getByText('Nhóm chat')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Nhóm đồ án'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      id: 'cv-1',
      name: 'Nhóm đồ án',
      private: true,
      scopeType: 'CONVERSATION',
    });
  });

  it('chọn kênh riêng tư → onChange với scopeType CHANNEL và private = true', async () => {
    const onChange = jest.fn();
    await render(
      <TargetScopePicker current={channelTarget} value={null} wsId="ws-1" onChange={onChange} />,
      { wrapper: Wrapper },
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Nơi nhận thông báo' }));
    await fireEvent.press(screen.getByText('#ban-quan-tri'));

    expect(onChange).toHaveBeenCalledWith({
      id: 'ch-2',
      name: 'ban-quan-tri',
      private: true,
      scopeType: 'CHANNEL',
    });
  });

  it('lỗi INT_005 hiện NGAY tại trường; cả hai danh sách lỗi → câu "Không tải được danh sách"', async () => {
    mockLists({ failed: true });
    await render(
      <TargetScopePicker
        current={channelTarget}
        error="Không thể dùng nơi này"
        value={null}
        wsId="ws-1"
        onChange={jest.fn()}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByText('Không thể dùng nơi này')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Nơi nhận thông báo' }));
    expect(screen.getByText('Không tải được danh sách, thử lại sau.')).toBeOnTheScreen();
  });
});
