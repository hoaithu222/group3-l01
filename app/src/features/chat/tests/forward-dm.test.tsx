import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, userEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { chatService } from '../api/chat.service';
import { makeMessage } from '../cache/apply-socket-event.fixtures';
import { ForwardSheet } from '../components/forward/ForwardSheet';
import { labelOfTarget, targetKey, toForwardTarget } from '../components/forward/forward-targets';

jest.mock('react-native-keyboard-controller', () =>
  jest.requireActual('react-native-keyboard-controller/jest'),
);
jest.mock('../api/chat.service', () => ({
  chatService: { searchPeople: jest.fn(), forward: jest.fn() },
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

async function renderSheet(searchTargets?: () => Promise<never[]>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  return render(
    <ForwardSheet
      message={makeMessage({ id: 'm-9' })}
      searchTargets={searchTargets}
      visible
      onClose={jest.fn()}
    />,
    {
      wrapper: Wrapper,
    },
  );
}

describe('ForwardSheet — chọn người nhận DM', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(chatService.searchPeople).mockResolvedValue([
      { userId: 'u-an', name: 'An', avatarUrl: null },
      { userId: 'u-binh', name: 'Bình', avatarUrl: null },
    ]);
    jest.mocked(chatService.forward).mockResolvedValue({
      results: [
        {
          target: { directUserId: 'u-an' },
          status: 'SENT',
          messageId: 'msg-new',
          scopeType: 'CONVERSATION',
          scopeId: 'c-1',
        },
      ],
    });
  });

  it('liệt kê NGƯỜI (nhóm "Người"), chọn một người và gửi bằng directUserId — không phải scopeType/scopeId', async () => {
    const screen = await renderSheet();
    await waitFor(() => expect(screen.getByText('An')).toBeOnTheScreen());

    await userEvent.press(screen.getByText('An'));
    await userEvent.press(screen.getByText('Chuyển tiếp (1)'));

    await waitFor(() => expect(chatService.forward).toHaveBeenCalledTimes(1));
    const [messageId, payload] = jest.mocked(chatService.forward).mock.calls[0] ?? [];
    expect(messageId).toBe('m-9');
    expect(payload?.targets).toEqual([{ directUserId: 'u-an' }]);
    // kết quả từng đích hiện theo TÊN người, không phải id
    await waitFor(() => expect(screen.getByText('An')).toBeOnTheScreen());
  });

  it('trộn đích KÊNH do màn cha cấp với đích NGƯỜI trong cùng một lượt gửi', async () => {
    const searchTargets = jest
      .fn()
      .mockResolvedValue([{ scopeType: 'CHANNEL', scopeId: 'ch-1', label: 'chung' }]);
    const screen = await renderSheet(searchTargets as never);
    await waitFor(() => expect(screen.getByText('chung')).toBeOnTheScreen());
    await waitFor(() => expect(screen.getByText('Bình')).toBeOnTheScreen());

    await userEvent.press(screen.getByText('chung'));
    await userEvent.press(screen.getByText('Bình'));
    await userEvent.press(screen.getByText('Chuyển tiếp (2)'));

    await waitFor(() => expect(chatService.forward).toHaveBeenCalled());
    const payload = jest.mocked(chatService.forward).mock.calls[0]?.[1];
    expect(payload?.targets).toEqual([
      { scopeType: 'CHANNEL', scopeId: 'ch-1' },
      { directUserId: 'u-binh' },
    ]);
  });

  it('không chọn đích nào thì nút Chuyển tiếp khoá', async () => {
    const screen = await renderSheet();
    await waitFor(() => expect(screen.getByText('An')).toBeOnTheScreen());
    expect(screen.getByRole('button', { name: 'Chuyển tiếp' })).toBeDisabled();
  });

  it('ô ghi chú (đáy tấm) chỉ hiện khi đã chọn đích, và lời nhắn đi kèm lượt gửi', async () => {
    const screen = await renderSheet();
    await waitFor(() => expect(screen.getByText('An')).toBeOnTheScreen());
    expect(screen.queryByLabelText('Ghi chú (không bắt buộc)')).toBeNull();

    await userEvent.press(screen.getByText('An'));
    await userEvent.type(screen.getByLabelText('Ghi chú (không bắt buộc)'), 'Xem giúp nhé');
    await userEvent.press(screen.getByText('Chuyển tiếp (1)'));

    await waitFor(() => expect(chatService.forward).toHaveBeenCalledTimes(1));
    expect(jest.mocked(chatService.forward).mock.calls[0]?.[1]?.note).toBe('Xem giúp nhé');
  });
});

describe('forward-targets', () => {
  it('khoá đích khác nhau cho kênh / người và khớp kết quả BE trả về (directUserId)', () => {
    expect(targetKey({ scopeType: 'CHANNEL', scopeId: 'x' })).toBe('CHANNEL:x');
    expect(targetKey({ userId: 'u1', label: 'An' })).toBe('user:u1');
    expect(targetKey({ directUserId: 'u1' })).toBe('user:u1');
  });

  it('toForwardTarget: người → directUserId, kênh → scopeType+scopeId', () => {
    expect(toForwardTarget({ userId: 'u1', label: 'An' })).toEqual({ directUserId: 'u1' });
    expect(toForwardTarget({ scopeType: 'CONVERSATION', scopeId: 'c1', label: 'Nhóm' })).toEqual({
      scopeType: 'CONVERSATION',
      scopeId: 'c1',
    });
  });

  it('nhãn kết quả: tìm theo đích, không thấy thì chữ trung tính (KHÔNG in id)', () => {
    expect(labelOfTarget([{ userId: 'u1', label: 'An' }], { directUserId: 'u1' })).toBe('An');
    expect(labelOfTarget([], { directUserId: 'u-lạ' })).toBe('Đích chuyển tiếp');
  });
});
