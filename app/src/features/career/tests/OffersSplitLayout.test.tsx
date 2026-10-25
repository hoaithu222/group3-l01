import { render, screen } from '@testing-library/react-native';
import { useEffect } from 'react';
// Tên bắt đầu bằng `Mock` — quy ước của `babel-plugin-jest-hoist` cho biến được phép dùng trong factory `jest.mock`.
import { Text as MockText } from 'react-native';

import { OffersHomeScreen } from '../screens/jobs/OffersHomeScreen';
import { OffersSplitLayout } from '../screens/jobs/OffersSplitLayout';
import { renderWithClient } from './jobs-fixtures';

/**
 * Bố cục hai cột của "Lời mời" (app.md p6-08 §7). Chỉ test được LOGIC RẼ NHÁNH và tính bất biến vị trí `children` — hình dạng hai cột (bề rộng, đường kẻ) là NativeWind,
 * Jest không biên dịch được, phải xem trên máy tính bảng. Cùng khuôn `conversations/tests/MessagesSplitLayout.test.tsx`.
 */
let mockIsTablet = false;
jest.mock('@/shared/theme', () => ({
  ...jest.requireActual('@/shared/theme'),
  useBreakpoint: () => ({ isTablet: mockIsTablet }),
}));
jest.mock('../screens/jobs/OfferInboxScreen', () => ({
  OfferInboxScreen: () => <MockText>HOP_THU_LOI_MOI</MockText>,
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));

/** Đếm số lần MOUNT — `<Stack/>` thật mà remount thì mất sạch ngăn xếp đang mở. */
let mountCount = 0;
function StackStandIn() {
  useEffect(() => {
    mountCount += 1;
  }, []);
  return <MockText>KHUNG_PHAI</MockText>;
}

beforeEach(() => {
  mockIsTablet = false;
  mountCount = 0;
});

describe('OffersSplitLayout', () => {
  it('điện thoại ⇒ chỉ có khung phải (children), KHÔNG mount hộp thư — tránh hai useMyOffers chạy song song', async () => {
    await render(
      <OffersSplitLayout>
        <StackStandIn />
      </OffersSplitLayout>,
    );
    expect(screen.getByText('KHUNG_PHAI')).toBeOnTheScreen();
    expect(screen.queryByText('HOP_THU_LOI_MOI')).toBeNull();
  });

  it('máy tính bảng ⇒ hộp thư ở cột trái + children ở khung phải', async () => {
    mockIsTablet = true;
    await render(
      <OffersSplitLayout>
        <StackStandIn />
      </OffersSplitLayout>,
    );
    expect(screen.getByText('HOP_THU_LOI_MOI')).toBeOnTheScreen();
    expect(screen.getByText('KHUNG_PHAI')).toBeOnTheScreen();
  });

  it('xoay máy/kéo chia đôi màn hình qua ngưỡng 600dp KHÔNG remount children (mất ngăn xếp đang mở)', async () => {
    const tree = (
      <OffersSplitLayout>
        <StackStandIn />
      </OffersSplitLayout>
    );
    const view = await render(tree);
    mockIsTablet = true;
    await view.rerender(tree);
    mockIsTablet = false;
    await view.rerender(tree);
    expect(mountCount).toBe(1);
  });
});

describe('OffersHomeScreen (offers/index)', () => {
  it('điện thoại ⇒ hộp thư đầy màn; máy tính bảng ⇒ khung phải "Chưa chọn lời mời" (hộp thư đã ở cột trái)', async () => {
    // `NoOfferSelected` dựng `Screen` ⇒ cần SafeAreaProvider (có sẵn trong `renderWithClient`).
    const { screen: view } = await renderWithClient(<OffersHomeScreen />);
    expect(screen.getByText('HOP_THU_LOI_MOI')).toBeOnTheScreen();

    mockIsTablet = true;
    await view.rerender(<OffersHomeScreen />);
    expect(screen.queryByText('HOP_THU_LOI_MOI')).toBeNull();
    expect(screen.getByText('Chưa chọn lời mời')).toBeOnTheScreen();
  });
});
