import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';

import { IntegrationMessage } from '../components/system/IntegrationMessage';

/**
 * Thẻ tin hệ thống `INTEGRATION` (p5-03 app.md §3/§8): tối đa 5 commit dù payload dài hơn, payload thiếu trường không vỡ, nút "Mở trên …" ghi rõ
 * tên miền và CHỈ mở sau khi xác nhận; link không phải https → không có nút.
 */
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn().mockResolvedValue({ type: 'opened' }),
}));

const commits = Array.from({ length: 7 }, (_, i) => ({
  sha7: `abc${i}def`,
  message: `Sửa lỗi số ${i + 1}`,
}));
const payload = {
  source: 'github',
  provider: 'GITHUB',
  summary: 'dev-a đã push 7 commit lên main',
  title: 'dev-a đã push 7 commit lên main',
  repo: 'vci/app',
  url: 'https://github.com/vci/app/compare/a...b',
  commits: commits.slice(0, 5),
  commitCount: 7,
};

beforeEach(() => jest.clearAllMocks());

describe('IntegrationMessage', () => {
  it('hiện tối đa 5 commit + "và 2 commit khác", tiêu đề và nhà cung cấp · repo', async () => {
    await render(<IntegrationMessage message={{ systemPayload: { ...payload, commits } }} />);
    expect(screen.getByText('GitHub · vci/app')).toBeOnTheScreen();
    expect(screen.getByText('dev-a đã push 7 commit lên main')).toBeOnTheScreen();
    expect(screen.getByText(/Sửa lỗi số 5/)).toBeOnTheScreen();
    expect(screen.queryByText(/Sửa lỗi số 6/)).toBeNull();
    expect(screen.getByText('và 2 commit khác')).toBeOnTheScreen();
  });

  it('payload thiếu trường / sai kiểu → không vỡ; không có tiêu đề → "Thông báo từ tích hợp"', async () => {
    await render(<IntegrationMessage message={{ systemPayload: { commits: 'x', url: 42 } }} />);
    expect(screen.getByText('Thông báo từ tích hợp')).toBeOnTheScreen();
    await render(<IntegrationMessage message={{ systemPayload: null }} />);
    expect(screen.getByText('Thông báo từ tích hợp')).toBeOnTheScreen();
  });

  it('nút ghi rõ tên miền; bấm → hộp xác nhận → "Mở liên kết" mới mở trình duyệt', async () => {
    await render(<IntegrationMessage message={{ systemPayload: payload }} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Mở trên GitHub (github.com)' }));
    expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
    await fireEvent.press(await screen.findByRole('button', { name: 'Mở liên kết' }));
    await waitFor(() => expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(payload.url));
  });

  it('link không phải https → không có nút mở', async () => {
    await render(
      <IntegrationMessage
        message={{ systemPayload: { ...payload, url: 'javascript:alert(1)' } }}
      />,
    );
    expect(screen.queryByRole('button', { name: /Mở trên/ })).toBeNull();
  });
});
