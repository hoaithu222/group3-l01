import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { accessibleGroupsHidingButtons } from '../../../../tests/helpers/a11y-groups';
import type { PaymentProfileView } from '../api';
import { PaymentProfileRow } from '../components/PaymentProfileRow';
import { SuggestionRow } from '../components/SuggestionRow';

/**
 * Nút lặp lại ở MỖI hàng ("Trả", "Đặt mặc định") phải nêu ĐỐI TƯỢNG trong nhãn trợ năng: trình đọc màn hình duyệt nút
 * theo thứ tự, và mười nút cùng đọc "Trả, nút" không cho người khiếm thị biết đang đứng ở khoản nợ nào — mà ở màn thanh
 * toán, nhầm dòng là nhầm tiền.
 */
/** `ActionMenu` mở `BottomSheet`: thư viện bàn phím gọi native lúc nạp module và `useSafeAreaInsets` cần provider. */
jest.mock('react-native-keyboard-controller', () =>
  jest.requireActual('react-native-keyboard-controller/jest'),
);
const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};
const Wrapper = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>
);

const PROFILE: PaymentProfileView = {
  accountLast4: '1234',
  accountName: 'NGUYEN VAN AN',
  bankBin: '970436',
  bankName: 'Vietcombank',
  createdAt: '2026-09-01T00:00:00.000Z',
  id: 'pp-1',
  isDefault: false,
};

describe('SuggestionRow — nút "Trả"', () => {
  it('nhãn nêu số tiền và người nhận; bấm gọi onPay', async () => {
    const onPay = jest.fn();
    await render(
      <SuggestionRow
        amount={37500}
        canPay
        fromName="Bình"
        toName="An"
        onExplain={jest.fn()}
        onPay={onPay}
      />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Trả 37.500 VND cho An' }));

    expect(onPay).toHaveBeenCalledTimes(1);
  });

  it('câu mô tả dòng vẫn liền mạch và không nuốt nút', async () => {
    const view = await render(
      <SuggestionRow
        amount={37500}
        canPay
        fromName="Bình"
        toName="An"
        onExplain={jest.fn()}
        onPay={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Bình chuyển cho An 37.500 VND')).toBeOnTheScreen();
    expect(accessibleGroupsHidingButtons(view.toJSON())).toEqual([]);
  });
});

/**
 * Thao tác phụ của mỗi tài khoản (đặt mặc định · xoá) gom vào MỘT menu "⋯" — nút "⋯" lặp ở mọi hàng nên nhãn phải nêu
 * ĐỐI TƯỢNG (đuôi 4 số), cùng lý do như các nút "Trả" ở trên.
 */
describe('PaymentProfileRow — menu "⋯"', () => {
  const openMenu = () =>
    userEvent.press(screen.getByRole('button', { name: 'Thao tác cho tài khoản đuôi 1234' }));

  it('nhãn nút "⋯" nêu tài khoản nào; chọn "Đặt làm mặc định" gọi onMakeDefault với đúng hồ sơ', async () => {
    const onMakeDefault = jest.fn();
    await render(
      <PaymentProfileRow profile={PROFILE} onDelete={jest.fn()} onMakeDefault={onMakeDefault} />,
      { wrapper: Wrapper },
    );

    await openMenu();
    await userEvent.press(await screen.findByText('Đặt làm mặc định'));

    await waitFor(() => expect(onMakeDefault).toHaveBeenCalledWith(PROFILE));
  });

  it('chọn "Xoá tài khoản" gọi onDelete (hộp thoại xác nhận do màn cha mở), không đặt mặc định', async () => {
    const onDelete = jest.fn();
    const onMakeDefault = jest.fn();
    await render(
      <PaymentProfileRow profile={PROFILE} onDelete={onDelete} onMakeDefault={onMakeDefault} />,
      { wrapper: Wrapper },
    );

    await openMenu();
    await userEvent.press(await screen.findByText('Xoá tài khoản'));

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(PROFILE));
    expect(onMakeDefault).not.toHaveBeenCalled();
  });

  it('tài khoản ĐÃ là mặc định ⇒ menu không còn mục "Đặt làm mặc định", chỉ còn xoá', async () => {
    await render(
      <PaymentProfileRow
        profile={{ ...PROFILE, isDefault: true }}
        onDelete={jest.fn()}
        onMakeDefault={jest.fn()}
      />,
      { wrapper: Wrapper },
    );

    await openMenu();

    expect(await screen.findByText('Xoá tài khoản')).toBeOnTheScreen();
    expect(screen.queryByText('Đặt làm mặc định')).toBeNull();
  });
});
