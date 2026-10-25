import * as Clipboard from 'expo-clipboard';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Share } from 'react-native';

import { DARK_COLORS, LIGHT_COLORS } from '@/shared/theme';
import { showToast } from '@/shared/utils/toast.utils';

import type { CreateInviteResult } from '../api';
import { InviteCreatedSheet } from '../components/InviteCreatedSheet';
import { renderWithProviders } from './test-utils';

/**
 * `InviteCreatedSheet` — link mời chỉ hiện MỘT lần (be.md §5.1). Kèm mã QR của chính URL đó để người kia quét ở
 * "Tham gia nhóm" khi không bấm được link. `react-native-qrcode-svg` được mock để đọc được props (`value`, màu,
 * `ecl`) — ruột nó là hàng trăm `<Path>` SVG, không có gì để so trong Jest.
 */

const mockQrCode = jest.fn((_props: Record<string, unknown>) => null);

jest.mock('react-native-qrcode-svg', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => mockQrCode(props),
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

const URL_MOI = 'https://superapp.vcijsc.com/invite/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-aBcDe';

const RESULT: CreateInviteResult = {
  expiresAt: '2026-09-26T00:00:00.000Z',
  id: 'inv-1',
  maxUses: 5,
  tokenPrefix: 'AbCdEf',
  url: URL_MOI,
};

beforeEach(() => jest.clearAllMocks());

describe('InviteCreatedSheet', () => {
  it('có mã QR mà nội dung là ĐÚNG url của link mời; nền trắng, mã đen, ecl M', async () => {
    await renderWithProviders(<InviteCreatedSheet result={RESULT} onClose={jest.fn()} />);

    expect(screen.getByLabelText('Mã QR của link mời')).toBeOnTheScreen();
    expect(mockQrCode).toHaveBeenCalledWith(
      expect.objectContaining({
        backgroundColor: LIGHT_COLORS['neutral-0'],
        color: LIGHT_COLORS['ink-10'],
        ecl: 'M',
        size: expect.any(Number),
        value: URL_MOI,
      }),
    );
  });

  it('⚠️ hai token màu của QR GIỐNG HỆT nhau ở chế độ sáng và tối (QR đảo màu thì máy quét không đọc được)', () => {
    expect(DARK_COLORS['neutral-0']).toBe(LIGHT_COLORS['neutral-0']);
    expect(DARK_COLORS['ink-10']).toBe(LIGHT_COLORS['ink-10']);
  });

  it('giữ nguyên URL dạng chữ, cảnh báo "chỉ hiện một lần" và dòng hướng dẫn người khác quét', async () => {
    await renderWithProviders(<InviteCreatedSheet result={RESULT} onClose={jest.fn()} />);

    expect(screen.getByText(URL_MOI)).toBeOnTheScreen();
    expect(screen.getByText(/Link chỉ hiện một lần ở đây/)).toBeOnTheScreen();
    expect(
      screen.getByText('Người khác quét mã này trong mục Tham gia nhóm.'),
    ).toBeOnTheScreen();
  });

  it('nút Sao chép ghi url vào clipboard, nút Chia sẻ mở share sheet với url', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    await renderWithProviders(<InviteCreatedSheet result={RESULT} onClose={jest.fn()} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Sao chép' }));
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith(URL_MOI));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('success', 'Đã sao chép link mời.'));

    await fireEvent.press(screen.getByRole('button', { name: 'Chia sẻ' }));
    expect(share).toHaveBeenCalledWith({ message: URL_MOI });
  });

  it('chưa có kết quả (sheet đóng) → không dựng QR', async () => {
    await renderWithProviders(<InviteCreatedSheet result={null} onClose={jest.fn()} />);

    expect(mockQrCode).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Mã QR của link mời')).toBeNull();
  });
});
