import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { Linking } from 'react-native';

import { ensureFreshAccessToken } from '@/core/api/session.fresh';

import { PortfolioPreviewScreen } from '../screens/portfolio/PortfolioPreviewScreen';
import { loadWebViewModule } from '../utils/load-webview-module';
import { renderPortfolio } from './portfolio.harness';

/**
 * app.md p6-07 §3, §6, §8 "Xem trước": WebView nạp `GET /me/portfolio/preview` bằng header Authorization (token đã làm mới), KHÔNG JavaScript, chỉ nguồn API, CHẶN điều hướng ra ngoài (mở link bằng
 * `Linking` sau khi xác nhận), công tắc Điện thoại/Máy tính bảng, lỗi + Thử lại, 404 chưa có hồ sơ, offline, dev client chưa có module native.
 * Jest không chạy được `import()` động ⇒ mock chính file loader (xem `load-webview-module.ts`); WebView là mock giữ nguyên prop (`__mocks__/react-native-webview.tsx`).
 */
const mockConnection = { current: 'connected' };
jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock('@/core/config/env.config', () => ({
  appConfig: {
    ...jest.requireActual('@/core/config/env.config').appConfig,
    apiBaseUrl: 'http://10.0.2.2:3000/api/v1',
  },
}));
jest.mock('@/core/api/session', () => ({
  ...jest.requireActual('@/core/api/session'),
  getAccessToken: () => 'token-abc',
}));
jest.mock('@/core/api/session.fresh', () => ({ ensureFreshAccessToken: jest.fn() }));
jest.mock('@/core/socket', () => ({
  ...jest.requireActual('@/core/socket'),
  useConnectionState: () => mockConnection.current,
}));
jest.mock('../utils/load-webview-module', () => ({ loadWebViewModule: jest.fn() }));

const URI = 'http://10.0.2.2:3000/api/v1/me/portfolio/preview';
const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

const web = () => screen.getByTestId('webview');
const webProps = () =>
  web().props as Record<string, unknown> & {
    source: { uri: string; headers: Record<string, string> };
  };
/** Gọi `onShouldStartLoadWithRequest` như WebView thật khi có yêu cầu điều hướng; trong `act` vì nó có thể mở hộp thoại xác nhận (setState). */
async function shouldLoad(url: string): Promise<boolean> {
  let allowed = false;
  await act(async () => {
    allowed = (webProps().onShouldStartLoadWithRequest as (r: { url: string }) => boolean)({ url });
  });
  return allowed;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockConnection.current = 'connected';
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  (ensureFreshAccessToken as jest.Mock).mockResolvedValue(true);
  (loadWebViewModule as jest.Mock).mockResolvedValue(jest.requireMock('react-native-webview'));
});

describe('PortfolioPreviewScreen', () => {
  it('nạp uri + header Authorization (sau khi làm mới token); KHÔNG JavaScript, không cửa sổ mới, chỉ nguồn API', async () => {
    await renderPortfolio(<PortfolioPreviewScreen />);
    await screen.findByTestId('webview');
    expect(ensureFreshAccessToken).toHaveBeenCalled();
    expect(webProps().source).toEqual({ headers: { Authorization: 'Bearer token-abc' }, uri: URI });
    expect(webProps()).toMatchObject({
      javaScriptEnabled: false,
      originWhitelist: ['http://10.0.2.2:3000'],
      setSupportMultipleWindows: false,
    });
  });

  it('thử mẫu chưa lưu (?template=&accent=) ⇒ thêm tham số vào uri và ghi rõ trên thanh tiêu đề', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ accent: 'BLUE', template: 'DEVELOPER' });
    await renderPortfolio(<PortfolioPreviewScreen />);
    await screen.findByTestId('webview');
    expect(webProps().source.uri).toBe(`${URI}?template=DEVELOPER&accent=BLUE`);
    expect(screen.getByText('Đang thử mẫu chưa lưu')).toBeOnTheScreen();
  });

  it('CHẶN điều hướng ra ngoài: lượt nạp đầu qua, link https hỏi xác nhận rồi mới mở bằng Linking, http:// bị bỏ im lặng', async () => {
    await renderPortfolio(<PortfolioPreviewScreen />);
    await screen.findByTestId('webview');
    expect(await shouldLoad(URI)).toBe(true);
    expect(await shouldLoad('about:blank')).toBe(true);
    expect(await shouldLoad('http://khong-an-toan.com')).toBe(false);
    expect(screen.queryByText('Mở liên kết bên ngoài?')).toBeNull();
    expect(await shouldLoad('https://github.com/an')).toBe(false);
    expect(await screen.findByText('Mở liên kết bên ngoài?')).toBeOnTheScreen();
    expect(openURL).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Mở' }));
    expect(openURL).toHaveBeenCalledWith('https://github.com/an');
  });

  it('công tắc Điện thoại / Máy tính bảng: mặc định co theo màn, Máy tính bảng ⇒ khung rộng cố định (viewport giả lập)', async () => {
    await renderPortfolio(<PortfolioPreviewScreen />);
    await screen.findByTestId('webview');
    expect(webProps().style).toEqual({ flex: 1 });
    await fireEvent.press(screen.getByRole('tab', { name: 'Máy tính bảng' }));
    await waitFor(() => expect(webProps().style).toEqual({ width: 820 }));
  });

  it('máy chủ trả 404 ⇒ "Chưa có hồ sơ", KHÔNG có Thử lại; 500 ⇒ lỗi + Thử lại nạp lại với token mới', async () => {
    await renderPortfolio(<PortfolioPreviewScreen />);
    await screen.findByTestId('webview');
    await fireEvent(web(), 'httpError', { nativeEvent: { statusCode: 500 } });
    await fireEvent.press(await screen.findByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(ensureFreshAccessToken).toHaveBeenCalledTimes(2));
    await screen.findByTestId('webview');
    await fireEvent(web(), 'httpError', { nativeEvent: { statusCode: 404 } });
    expect(await screen.findByText('Chưa có hồ sơ để xem trước')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  it('không làm mới được token ⇒ lỗi + Thử lại, KHÔNG nạp trang không có Authorization', async () => {
    (ensureFreshAccessToken as jest.Mock).mockResolvedValue(false);
    await renderPortfolio(<PortfolioPreviewScreen />);
    expect(await screen.findByText('Không tải được bản xem trước.')).toBeOnTheScreen();
    expect(screen.queryByTestId('webview')).toBeNull();
  });

  it('offline ⇒ "Cần kết nối để xem trước" + Thử lại, chưa nạp WebView', async () => {
    mockConnection.current = 'offline';
    await renderPortfolio(<PortfolioPreviewScreen />);
    expect(await screen.findByText('Cần kết nối để xem trước')).toBeOnTheScreen();
    expect(screen.queryByTestId('webview')).toBeNull();
  });

  it('dev client chưa có module native (loader trả null) ⇒ "Chưa hỗ trợ xem trước", không ném lỗi', async () => {
    (loadWebViewModule as jest.Mock).mockResolvedValue(null);
    await renderPortfolio(<PortfolioPreviewScreen />);
    expect(await screen.findByText('Chưa hỗ trợ xem trước')).toBeOnTheScreen();
  });
});
