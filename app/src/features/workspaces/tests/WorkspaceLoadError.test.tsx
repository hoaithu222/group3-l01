import { fireEvent, render, screen } from '@testing-library/react-native';
import { AxiosError, AxiosHeaders } from 'axios';

import { WorkspaceLoadError } from '../components/WorkspaceLoadError';

/**
 * Khối "không tải được nhóm" của ba màn cấp nhóm — ba ca khác hẳn nhau về việc người dùng làm được gì tiếp:
 * mất mạng (nói rõ là KẾT NỐI, có "Thử lại") · 403/404 (mất quyền/nhóm đã xoá — ⛔ KHÔNG "Thử lại", thử lại vẫn 404) · lỗi khác.
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

function networkError(): AxiosError {
  return new AxiosError('Network Error', 'ERR_NETWORK', { headers: new AxiosHeaders() });
}

describe('WorkspaceLoadError', () => {
  it('mất mạng ⇒ "Mất kết nối" + "Thử lại" gọi onRetry', async () => {
    const onRetry = jest.fn();
    await render(<WorkspaceLoadError error={networkError()} onRetry={onRetry} />);

    expect(screen.getByText('Mất kết nối')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Thử lại'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it.each([403, 404])('HTTP %s (không còn quyền) ⇒ nói rõ, KHÔNG có "Thử lại"', async (status) => {
    await render(<WorkspaceLoadError error={httpError(status)} onRetry={jest.fn()} />);

    expect(screen.getByText('Không mở được nhóm')).toBeOnTheScreen();
    expect(screen.queryByText('Thử lại')).toBeNull();
  });

  it('không có lỗi mà cũng không có nhóm ⇒ cùng khối "Không mở được nhóm"', async () => {
    await render(<WorkspaceLoadError error={undefined} onRetry={jest.fn()} />);

    expect(screen.getByText('Không mở được nhóm')).toBeOnTheScreen();
  });

  it('lỗi máy chủ (5xx) ⇒ "Không tải được" + "Thử lại"', async () => {
    const onRetry = jest.fn();
    await render(<WorkspaceLoadError error={httpError(500)} onRetry={onRetry} />);

    expect(screen.getByText('Không tải được')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Thử lại'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
