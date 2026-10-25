import { fireEvent, render, screen } from '@testing-library/react-native';
import { AxiosError, AxiosHeaders } from 'axios';

import { MemberCardLoadError } from '../components/MemberCardLoadError';

/**
 * Lỗi tải thẻ thành viên — mất mạng nói rõ là KẾT NỐI (+ "Thử lại"); 403/404 (người này đã rời/bị loại) ⛔ không "Thử lại"
 * vì thử lại vẫn 404; lỗi khác giữ "Thử lại".
 */
function httpError(status: number): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, undefined, {
    config,
    data: {},
    headers: {},
    status,
    statusText: '',
  });
}

describe('MemberCardLoadError', () => {
  it('mất mạng ⇒ "Mất kết nối" + "Thử lại"', async () => {
    const onRetry = jest.fn();
    const error = new AxiosError('Network Error', 'ERR_NETWORK', { headers: new AxiosHeaders() });
    await render(<MemberCardLoadError error={error} onRetry={onRetry} />);

    expect(screen.getByText('Mất kết nối')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Thử lại'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('404 ⇒ nói người này không còn trong nhóm, KHÔNG có "Thử lại"', async () => {
    await render(<MemberCardLoadError error={httpError(404)} onRetry={jest.fn()} />);

    expect(screen.getByText('Không xem được thẻ thành viên')).toBeOnTheScreen();
    expect(screen.queryByText('Thử lại')).toBeNull();
  });

  it('lỗi máy chủ ⇒ "Không tải được" + "Thử lại"', async () => {
    await render(<MemberCardLoadError error={httpError(500)} onRetry={jest.fn()} />);

    expect(screen.getByText('Không tải được')).toBeOnTheScreen();
    expect(screen.getByText('Thử lại')).toBeOnTheScreen();
  });
});
