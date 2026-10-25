import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { AxiosError } from 'axios';

import { showToast } from '@/shared/utils/toast.utils';

import { offersService } from '../api/offers.service';
import { OfferThreadScreen } from '../screens/jobs/OfferThreadScreen';
import { emitSocket, resetSocketMock, setConnection } from './socket-mock';
import { httpError, makeDetail, makeMessage, renderWithClient } from './jobs-fixtures';

/**
 * app.md p6-08 §8 (RNTL) + §3 "Trao đổi": tin theo `clientMessageId` (SENDING → lưu, FAILED có "Gửi lại" dùng LẠI cùng id), `RECR_008` ⇒ ô soạn bị THAY bằng thông báo đóng,
 * socket khoá thread khi đang gõ ⇒ ô soạn đổi ngay, mất mạng ⇒ tự gửi lại khi có mạng, nội dung tin không chứa gì ngoài chữ.
 */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ offerId: 'o1' })),
}));
jest.mock('@/core/socket', () => jest.requireActual('./socket-mock'));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@shopify/flash-list', () => ({
  FlashList: jest.requireActual('react-native').FlatList,
}));

const detail = jest.spyOn(offersService, 'get');
const messages = jest.spyOn(offersService, 'messages');
const send = jest.spyOn(offersService, 'sendMessage');

const OPEN = makeDetail({ status: 'INTERESTED', threadOpen: true });
const page = (items: ReturnType<typeof makeMessage>[]) => ({ items, nextCursor: null });
const INPUT = 'Nội dung tin nhắn';

const type = async (text: string) => {
  await fireEvent.changeText(await screen.findByLabelText(INPUT), text);
  await fireEvent.press(screen.getByRole('button', { name: 'Gửi tin nhắn' }));
};

beforeEach(() => {
  jest.clearAllMocks();
  resetSocketMock();
  detail.mockResolvedValue(OPEN);
  messages.mockResolvedValue(page([]));
});

describe('OfferThreadScreen', () => {
  it('hiện tin theo thứ tự cũ → mới, tin doanh nghiệp mang TÊN DOANH NGHIỆP (không đoán tên HR); rỗng ⇒ "Hãy bắt đầu bằng lời chào"', async () => {
    messages.mockResolvedValue(
      page([
        makeMessage({ content: 'Bạn rảnh thứ Hai không?', id: 'm2', side: 'COMPANY' }),
        makeMessage({ content: 'Em chào chị', id: 'm1', side: 'CANDIDATE' }),
      ]),
    );
    const { screen: view } = await renderWithClient(<OfferThreadScreen />);
    expect(await screen.findByText('Bạn rảnh thứ Hai không?')).toBeOnTheScreen();
    expect(screen.getByText('Em chào chị')).toBeOnTheScreen();
    expect(screen.getAllByText('Công ty Alpha').length).toBeGreaterThan(0);
    await view.unmount();

    messages.mockResolvedValue(page([]));
    await renderWithClient(<OfferThreadScreen />);
    expect(await screen.findByText('Hãy bắt đầu bằng lời chào')).toBeOnTheScreen();
  });

  it('gửi tin: payload có clientMessageId (≥ 8 ký tự) + nội dung đã cắt khoảng trắng; hiện "Đang gửi…" rồi thành tin đã lưu (đúng MỘT bản)', async () => {
    let done: (m: ReturnType<typeof makeMessage>) => void = () => undefined;
    send.mockReturnValue(
      new Promise((resolve) => {
        done = resolve;
      }),
    );
    await renderWithClient(<OfferThreadScreen />);

    await type('  Em chào chị ạ  ');
    expect(await screen.findByText('Đang gửi…')).toBeOnTheScreen();
    expect(send).toHaveBeenCalledWith('o1', {
      clientMessageId: expect.stringMatching(/^.{8,64}$/),
      content: 'Em chào chị ạ',
    });

    await waitFor(() =>
      done(makeMessage({ content: 'Em chào chị ạ', id: 'm9', side: 'CANDIDATE' })),
    );
    await waitFor(() => expect(screen.queryByText('Đang gửi…')).toBeNull());
    expect(screen.getAllByText('Em chào chị ạ')).toHaveLength(1);
    expect((screen.getByLabelText(INPUT).props as { value: string }).value).toBe('');
  });

  it('gửi lỗi (server từ chối) ⇒ "Gửi lại" gửi LẠI cùng clientMessageId (idempotent, không nhân đôi)', async () => {
    send
      .mockRejectedValueOnce(httpError(429, 'RATE_002'))
      .mockResolvedValueOnce(makeMessage({ content: 'Thử lại', id: 'm5', side: 'CANDIDATE' }));
    await renderWithClient(<OfferThreadScreen />);

    await type('Thử lại');
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Tin nhắn gửi không được. Gửi lại' }),
    );
    expect(showToast).toHaveBeenCalledWith('error', expect.any(String));

    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    const [first, second] = send.mock.calls.map((call) => call[1].clientMessageId);
    expect(second).toBe(first);
    await waitFor(() => expect(screen.queryByRole('button', { name: /Gửi lại/ })).toBeNull());
    expect(screen.getAllByText('Thử lại')).toHaveLength(1);
  });

  it('RECR_008 khi gửi ⇒ ô soạn bị THAY bằng "Cuộc trao đổi đã đóng", tin đang gửi bị bỏ', async () => {
    send.mockRejectedValue(httpError(403, 'RECR_008'));
    await renderWithClient(<OfferThreadScreen />);

    await type('Xin chào');
    expect(await screen.findByText(/Cuộc trao đổi đã đóng/)).toBeOnTheScreen();
    expect(screen.queryByLabelText(INPUT)).toBeNull();
    expect(screen.queryByText('Xin chào')).toBeNull();
  });

  it('chi tiết báo thread đóng (threadOpen = false) ⇒ không có ô soạn ngay từ đầu, vẫn đọc được tin cũ', async () => {
    detail.mockResolvedValue(
      makeDetail({ status: 'INTERESTED', threadLocked: true, threadOpen: false }),
    );
    messages.mockResolvedValue(page([makeMessage({ content: 'Tin cũ còn đọc được' })]));
    await renderWithClient(<OfferThreadScreen />);

    expect(await screen.findByText('Tin cũ còn đọc được')).toBeOnTheScreen();
    expect(await screen.findByText(/Cuộc trao đổi đã đóng/)).toBeOnTheScreen();
    expect(screen.queryByLabelText(INPUT)).toBeNull();
  });

  it('socket offer:updated khoá thread khi đang mở ⇒ ô soạn đổi thành thông báo đóng', async () => {
    await renderWithClient(<OfferThreadScreen />);
    expect(await screen.findByLabelText(INPUT)).toBeOnTheScreen();

    detail.mockResolvedValue(
      makeDetail({ status: 'INTERESTED', threadLocked: true, threadOpen: false }),
    );
    await emitSocket('offer:updated', {
      companyId: 'c1',
      offerId: 'o1',
      status: 'INTERESTED',
      threadLocked: true,
      v: 1,
    });
    expect(await screen.findByText(/Cuộc trao đổi đã đóng/)).toBeOnTheScreen();
    expect(screen.queryByLabelText(INPUT)).toBeNull();
  });

  it('mất mạng khi gửi ⇒ tin ở lại chờ, có mạng lại thì TỰ gửi lại (cùng clientMessageId)', async () => {
    send
      .mockRejectedValueOnce(new AxiosError('Network Error', 'ERR_NETWORK'))
      .mockResolvedValueOnce(makeMessage({ content: 'Chờ mạng', id: 'm7', side: 'CANDIDATE' }));
    const { screen: view } = await renderWithClient(<OfferThreadScreen />);

    await type('Chờ mạng');
    await screen.findByRole('button', { name: /Gửi lại/ });
    expect(showToast).not.toHaveBeenCalled();

    setConnection('offline');
    await view.rerender(<OfferThreadScreen />);
    expect(send).toHaveBeenCalledTimes(1);
    setConnection('connected');
    await view.rerender(<OfferThreadScreen />);

    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1]?.[1].clientMessageId).toBe(send.mock.calls[0]?.[1].clientMessageId);
    await waitFor(() => expect(screen.queryByRole('button', { name: /Gửi lại/ })).toBeNull());
  });

  it('thread lỗi tải: 404 ⇒ "Lời mời không còn"; lỗi mạng ⇒ có Thử lại', async () => {
    messages.mockRejectedValue(httpError(404, 'RES_001'));
    const { screen: view } = await renderWithClient(<OfferThreadScreen />);
    expect(await screen.findByText('Lời mời không còn')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
    await view.unmount();

    messages.mockRejectedValue(httpError(500, 'SYS_500'));
    await renderWithClient(<OfferThreadScreen />);
    expect(await screen.findByRole('button', { name: 'Thử lại' })).toBeOnTheScreen();
  });
});
