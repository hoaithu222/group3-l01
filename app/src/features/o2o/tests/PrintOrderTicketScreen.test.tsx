import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking } from 'react-native';

import { useAuthStore } from '@/shell/store/slices/auth';

import type { PrintOrderView } from '../api/o2o.types';
import { printService } from '../api/print.service';
import { PrintOrderTicketScreen } from '../screens/PrintOrderTicketScreen';
import { clearPin, readPin, savePin } from '../utils/pin-vault';
import { makeOrder, apiError, renderWithProviders } from './o2o-test-utils';

/** Vé đơn — theo trạng thái (chờ tiệm nhận, đang in, sẵn sàng, đã nhận, từ chối, nháp), huỷ đơn, ẩn/hiện PIN. Realtime kiểm ở `usePrintOrderSocket.test.tsx`. */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('../api/print.service', () => ({
  ORDERS_PAGE_SIZE: 20,
  printService: { get: jest.fn(), cancel: jest.fn(), regeneratePin: jest.fn() },
}));

const service = jest.mocked(printService);

const order = (over: Partial<PrintOrderView> = {}) => makeOrder(over);
const NO_ACTIONS = { canEdit: false, canSubmit: false, canCancel: false, canRegeneratePin: false };

beforeEach(async () => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: { id: 'u1', name: 'Tôi' } as never });
  jest.mocked(useLocalSearchParams).mockReturnValue({ orderId: 'ord-1' });
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  await clearPin('u1', 'ord-1');
  service.get.mockResolvedValue(order());
});
afterEach(() => jest.restoreAllMocks());

describe('vé đơn — đơn đang chờ tiệm nhận', () => {
  it('trạng thái LỚN bằng chữ + việc nên làm; PIN cách quãng; QR; mã đơn; tiến trình; tóm tắt; tiệm', async () => {
    await savePin('u1', 'ord-1', '482913');
    await renderWithProviders(<PrintOrderTicketScreen />);

    expect((await screen.findAllByText('Chờ tiệm nhận')).length).toBeGreaterThan(0);
    expect(
      screen.getByText('Tiệm sẽ xem đơn và nhận in. Bạn có thể huỷ đơn lúc này.'),
    ).toBeOnTheScreen();
    expect(await screen.findByText('482 913')).toBeOnTheScreen();
    expect(screen.getByLabelText('Mã QR nhận hàng')).toBeOnTheScreen();
    expect(screen.getByText('Mã đơn: PO-7K2M9Q')).toBeOnTheScreen();
    // Tiến trình (stepper dùng chung `Progress`): bước đã qua + bước sắp tới — trạng thái bước ĐỌC THÀNH LỜI, dòng phụ "Chưa tới" nhìn thấy được.
    expect(screen.getByText('Đã gửi đơn cho tiệm')).toBeOnTheScreen();
    expect(screen.getByLabelText(/chưa thực hiện: Tiệm đã nhận đơn\. Chưa tới/)).toBeOnTheScreen();
    expect(screen.getAllByText('Chưa tới').length).toBeGreaterThan(0);
    // Tóm tắt từ `quote` đã snapshot lúc gửi.
    expect(screen.getByText('bao-cao.pdf')).toBeOnTheScreen();
    expect(screen.getByText('21.600 VND')).toBeOnTheScreen();
    expect(screen.getByText('A4 · In màu · Hai mặt · 1 bản')).toBeOnTheScreen();
    expect(screen.getByText('Thanh toán tại quầy — chưa thanh toán')).toBeOnTheScreen();
    expect(screen.getByText('1 Đại Cồ Việt, Hà Nội')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Chỉ đường' }));
    expect(Linking.openURL).toHaveBeenCalledWith(expect.stringContaining('21.005,105.843'));
  });

  it('nút ẩn/hiện: ẩn PIN thì QR cũng ẩn (QR chứa chính PIN)', async () => {
    await savePin('u1', 'ord-1', '482913');
    await renderWithProviders(<PrintOrderTicketScreen />);
    await screen.findByText('482 913');

    await fireEvent.press(screen.getByRole('button', { name: 'Ẩn mã' }));
    expect(screen.queryByText('482 913')).toBeNull();
    expect(screen.getByText('••• •••')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Mã QR nhận hàng')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Hiện mã' }));
    expect(screen.getByText('482 913')).toBeOnTheScreen();
  });

  it('"Huỷ đơn" (server cho phép) → hỏi xác nhận → huỷ → đơn thành "Đã huỷ", PIN bị xoá khỏi máy', async () => {
    await savePin('u1', 'ord-1', '482913');
    service.cancel.mockResolvedValue(
      order({
        status: 'CANCELLED',
        myActions: NO_ACTIONS,
        events: [
          { status: 'PENDING', at: '2026-09-27T01:00:00.000Z', note: null },
          { status: 'CANCELLED', at: '2026-09-27T01:05:00.000Z', note: null },
        ],
      }),
    );
    await renderWithProviders(<PrintOrderTicketScreen />);
    await screen.findByText('482 913');

    await fireEvent.press(screen.getByRole('button', { name: 'Huỷ đơn' }));
    expect(await screen.findByText('Huỷ đơn PO-7K2M9Q?')).toBeOnTheScreen();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Huỷ đơn' }).at(-1) as never);

    await waitFor(() => expect(service.cancel).toHaveBeenCalledWith('ord-1', undefined));
    expect((await screen.findAllByText('Đã huỷ')).length).toBeGreaterThan(0);
    expect(screen.queryByText('482 913')).toBeNull();
    await waitFor(async () => expect(await readPin('u1', 'ord-1')).toBeNull());
  });

  it('huỷ lúc đơn vừa sang bước khác (O2O_004) → nói rõ + tải lại đơn cho khớp thực tế', async () => {
    await savePin('u1', 'ord-1', '482913');
    service.cancel.mockRejectedValue(apiError(409, 'O2O_004', { status: 'PRINTING' }));
    await renderWithProviders(<PrintOrderTicketScreen />);
    await screen.findByText('482 913');

    await fireEvent.press(screen.getByRole('button', { name: 'Huỷ đơn' }));
    await fireEvent.press(
      (await screen.findAllByRole('button', { name: 'Huỷ đơn' })).at(-1) as never,
    );

    expect(await screen.findByText(/vừa chuyển sang bước khác/)).toBeOnTheScreen();
    await waitFor(() => expect(service.get.mock.calls.length).toBeGreaterThan(1));
  });
});

describe('vé đơn — theo trạng thái', () => {
  it('ĐANG IN: nút "Huỷ đơn" ẨN (server không cho — myActions.canCancel false)', async () => {
    await savePin('u1', 'ord-1', '482913');
    service.get.mockResolvedValue(
      order({ status: 'PRINTING', myActions: { ...NO_ACTIONS, canRegeneratePin: true } }),
    );
    await renderWithProviders(<PrintOrderTicketScreen />);

    expect((await screen.findAllByText('Đang in')).length).toBeGreaterThan(0);
    expect(screen.getByText('482 913')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Huỷ đơn' })).toBeNull();
  });

  it('SẴN SÀNG NHẬN: hướng dẫn mang PIN tới tiệm', async () => {
    await savePin('u1', 'ord-1', '482913');
    service.get.mockResolvedValue(order({ status: 'READY', myActions: NO_ACTIONS }));
    await renderWithProviders(<PrintOrderTicketScreen />);

    expect((await screen.findAllByText('Sẵn sàng nhận')).length).toBeGreaterThan(0);
    expect(
      screen.getByText('Mang mã PIN tới tiệm để nhận tài liệu và thanh toán tại quầy.'),
    ).toBeOnTheScreen();
  });

  it('ĐÃ NHẬN (PICKED_UP): không còn thẻ PIN và PIN bị XOÁ khỏi kho khoá', async () => {
    await savePin('u1', 'ord-1', '482913');
    service.get.mockResolvedValue(
      order({
        status: 'PICKED_UP',
        myActions: NO_ACTIONS,
        hasPin: true,
        pickedUpAt: '2026-09-27T03:00:00.000Z',
      }),
    );
    await renderWithProviders(<PrintOrderTicketScreen />);

    expect((await screen.findAllByText('Đã nhận tài liệu')).length).toBeGreaterThan(0);
    expect(screen.queryByText('482 913')).toBeNull();
    expect(screen.queryByText('Mã PIN nhận hàng')).toBeNull();
    await waitFor(async () => expect(await readPin('u1', 'ord-1')).toBeNull());
  });

  it('TỪ CHỐI: hiện lý do của tiệm, không PIN, không nút huỷ', async () => {
    service.get.mockResolvedValue(
      order({ status: 'REJECTED', rejectReason: 'Tiệm hết giấy A3', myActions: NO_ACTIONS }),
    );
    await renderWithProviders(<PrintOrderTicketScreen />);

    expect(await screen.findByText('Lý do: Tiệm hết giấy A3')).toBeOnTheScreen();
    expect(screen.queryByText('Mã PIN nhận hàng')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Huỷ đơn' })).toBeNull();
  });

  it('ĐƠN NHÁP: mời "Tiếp tục đặt in" (mở lại cấu hình với orderId), không có thẻ PIN', async () => {
    service.get.mockResolvedValue(
      order({
        status: 'QUOTED',
        hasPin: false,
        submittedAt: null,
        events: [{ status: 'DRAFT', at: '2026-09-27T00:50:00.000Z', note: null }],
        myActions: { canEdit: true, canSubmit: true, canCancel: true, canRegeneratePin: false },
      }),
    );
    await renderWithProviders(<PrintOrderTicketScreen />);

    expect(await screen.findByText('Đơn này chưa được gửi cho tiệm.')).toBeOnTheScreen();
    expect(screen.queryByText('Mã PIN nhận hàng')).toBeNull();
    expect(screen.getByRole('button', { name: 'Bỏ đơn nháp' })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Tiếp tục đặt in' }));
    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/me/o2o/print/new',
      params: { shopId: 'shop-1', orderId: 'ord-1' },
    });
  });
});
