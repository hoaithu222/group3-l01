import { fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { useIsFocused } from 'expo-router';
import { Text } from 'react-native';

import {
  ActivityWidgetCard,
  ActivityWidgetsSlot,
  registerActivityWidget,
  resetActivityWidgets,
  useRefetchOnFocus,
} from '@/shared/activity-widgets';

/**
 * Khe nối widget "việc đang chờ bạn" vào đầu tab Hoạt động (p4-02 + p4-05): `features/activity` không import feature khác nên feature nguồn đăng ký
 * renderer ở nơi lắp ráp, màn Hoạt động chỉ vẽ `<ActivityWidgetsSlot />`. Cùng mẫu `@/shared/profile` và `@/shared/board-extensions`.
 */
jest.mock('expo-router', () => ({ useIsFocused: jest.fn(() => true) }));

const focused = jest.mocked(useIsFocused);

beforeEach(() => focused.mockReturnValue(true));
afterEach(() => resetActivityWidgets());

describe('ActivityWidgetsSlot', () => {
  it('chưa đăng ký (test, cờ tắt) ⇒ không vẽ gì, màn giữ nguyên hình dạng cũ', async () => {
    await render(<ActivityWidgetsSlot />);

    expect(screen.toJSON()).toBeNull();
  });

  it('đăng ký renderer ⇒ vẽ đúng nội dung', async () => {
    registerActivityWidget('a', () => <Text>Widget A</Text>);
    await render(<ActivityWidgetsSlot />);

    expect(screen.getByText('Widget A')).toBeOnTheScreen();
  });

  it('`order` nhỏ đứng trên, KHÔNG phụ thuộc thứ tự đăng ký; cùng `order` theo thứ tự đăng ký', async () => {
    registerActivityWidget('sau', () => <Text>Thứ ba</Text>, { order: 200 });
    registerActivityWidget('mac-dinh-1', () => <Text>Thứ hai</Text>);
    registerActivityWidget('truoc', () => <Text>Thứ nhất</Text>, { order: 10 });
    registerActivityWidget('mac-dinh-2', () => <Text>Thứ hai b</Text>);
    await render(<ActivityWidgetsSlot />);

    const texts = screen.getAllByText(/Thứ/).map((node) => node.props.children);
    expect(texts).toEqual(['Thứ nhất', 'Thứ hai', 'Thứ hai b', 'Thứ ba']);
  });

  it('đăng ký lại cùng id chỉ GHI ĐÈ (an toàn với Fast Refresh); null gỡ; renderer trả null (cờ tắt) không vẽ gì', async () => {
    registerActivityWidget('a', () => <Text>Cũ</Text>);
    registerActivityWidget('a', () => <Text>Mới</Text>);
    registerActivityWidget('b', () => <Text>Bị gỡ</Text>);
    registerActivityWidget('b', null);
    registerActivityWidget('c', () => null);
    await render(<ActivityWidgetsSlot />);

    expect(screen.getByText('Mới')).toBeOnTheScreen();
    expect(screen.queryByText('Cũ')).toBeNull();
    expect(screen.queryByText('Bị gỡ')).toBeNull();
    expect(screen.getAllByText(/./)).toHaveLength(1);
  });
});

describe('ActivityWidgetCard', () => {
  it('nói việc đang chờ bằng CHỮ và có đúng một nút hành động', async () => {
    const onAction = jest.fn();
    await render(
      <ActivityWidgetCard
        actionLabel="Ôn ngay"
        description="Ôn để nhớ lâu hơn"
        icon="book"
        title="12 thẻ cần ôn hôm nay"
        onAction={onAction}
      />,
    );

    expect(screen.getByText('12 thẻ cần ôn hôm nay')).toBeOnTheScreen();
    expect(screen.getByText('Ôn để nhớ lâu hơn')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Ôn ngay' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

describe('useRefetchOnFocus', () => {
  const setup = (query: { isStale: boolean; refetch: jest.Mock }, enabled = true) =>
    renderHook(() => useRefetchOnFocus(query, enabled));

  it('CHUYỂN blur → focus lúc số đã cũ ⇒ tải lại; lần vẽ đầu KHÔNG tải (useQuery đã lo)', async () => {
    const refetch = jest.fn();
    focused.mockReturnValue(true);
    const { rerender } = await setup({ isStale: true, refetch });
    expect(refetch).not.toHaveBeenCalled();

    focused.mockReturnValue(false);
    await rerender({});
    expect(refetch).not.toHaveBeenCalled();

    focused.mockReturnValue(true);
    await rerender({});
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('số còn mới (chưa quá staleTime) hoặc widget bị tắt cờ ⇒ không tải lại', async () => {
    const fresh = jest.fn();
    focused.mockReturnValue(false);
    const a = await setup({ isStale: false, refetch: fresh });
    focused.mockReturnValue(true);
    await a.rerender({});
    expect(fresh).not.toHaveBeenCalled();

    const disabled = jest.fn();
    focused.mockReturnValue(false);
    const b = await setup({ isStale: true, refetch: disabled }, false);
    focused.mockReturnValue(true);
    await b.rerender({});
    expect(disabled).not.toHaveBeenCalled();
  });
});
