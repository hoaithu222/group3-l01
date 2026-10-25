import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { InvitationDto } from '../api';
import { InvitationRow } from '../components/InvitationRow';

/**
 * Dòng lời mời email đã gửi: lời mời ĐANG CHỜ có menu "⋯" (Gửi lại · Thu hồi) thay cho hai nút viền cạnh nhau ở mỗi dòng;
 * lời mời đã xử lý xong thì không có menu. Thu hồi vẫn đi qua hộp xác nhận ở màn cha (`InvitationListScreen`).
 */

jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

function invitation(patch: Partial<InvitationDto> = {}): InvitationDto {
  return {
    email: 'an@example.com',
    expiresAt: '2026-10-01T00:00:00.000Z',
    guestDays: null,
    id: 'inv-1',
    lastSentAt: '2026-09-20T00:00:00.000Z',
    role: 'MEMBER',
    sendCount: 1,
    status: 'PENDING',
    ...patch,
  } as InvitationDto;
}

async function renderRow(patch: Partial<InvitationDto>, props: { busy?: boolean } = {}) {
  const onResend = jest.fn();
  const onRevoke = jest.fn();
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <InvitationRow busy={props.busy} invitation={invitation(patch)} onResend={onResend} onRevoke={onRevoke} />
    </SafeAreaProvider>,
  );
  return { onResend, onRevoke };
}

const MENU = { name: 'Tuỳ chọn cho lời mời tới an@example.com' };

describe('InvitationRow', () => {
  it('đang chờ: không còn nút "Gửi lại"/"Thu hồi" nằm sẵn trên dòng, chỉ có menu "⋯"', async () => {
    await renderRow({});

    expect(screen.getByRole('button', MENU)).toBeOnTheScreen();
    expect(screen.queryByText('Gửi lại')).toBeNull();
    expect(screen.queryByText('Thu hồi')).toBeNull();
  });

  it('chọn "Gửi lại lời mời" trong menu gọi onResend đúng một lần', async () => {
    const { onResend, onRevoke } = await renderRow({});

    await userEvent.press(screen.getByRole('button', MENU));
    await userEvent.press(await screen.findByText('Gửi lại lời mời'));

    await waitFor(() => expect(onResend).toHaveBeenCalledTimes(1));
    expect(onResend).toHaveBeenCalledWith(expect.objectContaining({ id: 'inv-1' }));
    expect(onRevoke).not.toHaveBeenCalled();
  });

  it('chọn "Thu hồi lời mời" gọi onRevoke (màn cha hỏi xác nhận rồi mới thu hồi thật)', async () => {
    const { onResend, onRevoke } = await renderRow({});

    await userEvent.press(screen.getByRole('button', MENU));
    await userEvent.press(await screen.findByText('Thu hồi lời mời'));

    await waitFor(() => expect(onRevoke).toHaveBeenCalledTimes(1));
    expect(onResend).not.toHaveBeenCalled();
  });

  it('đang xử lý chính lời mời này (busy): hai hàng trong menu bị khoá', async () => {
    const { onResend } = await renderRow({}, { busy: true });

    await userEvent.press(screen.getByRole('button', MENU));
    await fireEvent.press(await screen.findByText('Gửi lại lời mời'));

    expect(onResend).not.toHaveBeenCalled();
  });

  it.each(['ACCEPTED', 'REVOKED', 'EXPIRED'] as const)('lời mời %s: không có menu', async (status) => {
    await renderRow({ status });

    expect(screen.queryByRole('button', MENU)).toBeNull();
  });
});
