import { render, screen } from '@testing-library/react-native';
import { useEffect, type ReactNode } from 'react';
// Tên bắt đầu bằng `Mock` — quy ước của `babel-plugin-jest-hoist` cho biến được phép dùng trong factory `jest.mock`.
import { Text as MockText, View as MockView } from 'react-native';

import { MessagesHomeScreen } from '../screens/MessagesHomeScreen';
import { MessagesSplitLayout } from '../screens/MessagesSplitLayout';

/**
 * Bố cục hai cột của tab "Tin nhắn" (app.md p1-05 §3). Chỉ test được LOGIC RẼ
 * NHÁNH và tính bất biến của vị trí `children` — hình dạng hai cột (bề rộng,
 * đường kẻ) là NativeWind, Jest không biên dịch được, phải xem trên máy tính bảng.
 */

let mockIsTablet = false;
// Giữ nguyên phần còn lại của `@/shared/theme` (`useThemeColors` cho Icon/EmptyState) — chỉ thay `useBreakpoint`.
jest.mock('@/shared/theme', () => ({
  ...jest.requireActual('@/shared/theme'),
  useBreakpoint: () => ({ isTablet: mockIsTablet }),
}));
jest.mock('../screens/ConversationListScreen', () => ({
  ConversationListScreen: () => <MockText>DANH_SACH_HOI_THOAI</MockText>,
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/shared/ui/screen', () => ({
  Screen: ({ children }: { children: ReactNode }) => <MockView>{children}</MockView>,
}));

/** Đếm số lần MOUNT — `<Stack/>` thật mà remount thì mất sạch ngăn xếp đang mở. */
let mountCount = 0;
function StackStandIn() {
  useEffect(() => {
    mountCount += 1;
  }, []);
  return <MockText>KHUNG_PHAI</MockText>;
}

describe('MessagesSplitLayout', () => {
  beforeEach(() => {
    mockIsTablet = false;
    mountCount = 0;
  });

  it('điện thoại ⇒ chỉ có khung phải (children), KHÔNG mount danh sách — tránh hai useConversationList song song', async () => {
    await render(
      <MessagesSplitLayout>
        <StackStandIn />
      </MessagesSplitLayout>,
    );
    expect(screen.getByText('KHUNG_PHAI')).toBeOnTheScreen();
    expect(screen.queryByText('DANH_SACH_HOI_THOAI')).toBeNull();
  });

  it('máy tính bảng ⇒ danh sách bên trái + children bên phải', async () => {
    mockIsTablet = true;
    await render(
      <MessagesSplitLayout>
        <StackStandIn />
      </MessagesSplitLayout>,
    );
    expect(screen.getByText('DANH_SACH_HOI_THOAI')).toBeOnTheScreen();
    expect(screen.getByText('KHUNG_PHAI')).toBeOnTheScreen();
  });

  it('xoay/chia đôi màn hình qua ngưỡng 600dp ⇒ children KHÔNG bị remount (giữ ngăn xếp điều hướng)', async () => {
    // Phần tử MỚI mỗi lần: cùng một tham chiếu thì React bỏ qua lượt vẽ lại và test chẳng đo được gì.
    const tree = () => (
      <MessagesSplitLayout>
        <StackStandIn />
      </MessagesSplitLayout>
    );
    const { rerender } = await render(tree());
    expect(mountCount).toBe(1);

    mockIsTablet = true;
    await rerender(tree());
    expect(screen.getByText('DANH_SACH_HOI_THOAI')).toBeOnTheScreen();

    mockIsTablet = false;
    await rerender(tree());
    expect(screen.queryByText('DANH_SACH_HOI_THOAI')).toBeNull();

    expect(mountCount).toBe(1);
  });
});

describe('MessagesHomeScreen', () => {
  it('điện thoại ⇒ chính danh sách hội thoại', async () => {
    mockIsTablet = false;
    await render(<MessagesHomeScreen />);
    expect(screen.getByText('DANH_SACH_HOI_THOAI')).toBeOnTheScreen();
  });

  it('máy tính bảng ⇒ lời nhắc chọn hội thoại (danh sách đã ở cột trái, không vẽ hai bản)', async () => {
    mockIsTablet = true;
    await render(<MessagesHomeScreen />);
    expect(screen.getByText('Chưa chọn cuộc trò chuyện')).toBeOnTheScreen();
    expect(screen.queryByText('DANH_SACH_HOI_THOAI')).toBeNull();
  });
});
