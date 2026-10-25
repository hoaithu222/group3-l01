import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AppState, Linking, View } from 'react-native';

import { INVALID_SCAN_COOLDOWN_MS } from '../hooks/useInviteScan';
import { ScanInviteScreen } from '../screens/ScanInviteScreen';
import { renderWithProviders } from './test-utils';

/**
 * `ScanInviteScreen` với module `expo-camera` được thay bằng bản giả (module native không chạy trong Node). Khoá: quét
 * hợp lệ điều hướng ĐÚNG MỘT LẦN dù camera bắn liên tục; quét sai không điều hướng và cho quét lại sau ~1,5 giây; ba
 * trạng thái quyền; "Nhập mã thủ công" luôn có. Trường hợp THIẾU module native: `ScanInviteScreen.unavailable.test.tsx`.
 */

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), dismissTo: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));

const mockCameraView = jest.fn((_props: Record<string, unknown>) => null);
const mockLoadCameraModule = jest.fn();
const mockPermissions = jest.fn();
const mockRequest = jest.fn();
const mockRefresh = jest.fn();

/** ⚠️ Định nghĩa NGOÀI factory: NativeWind chèn tham chiếu `_ReactNativeCSSInterop` vào mọi `require('react-native')`, và
 *  factory của `jest.mock` (bị hoist) không được chạm biến ngoài phạm vi trừ tên bắt đầu bằng `mock`. */
function MockCameraView(props: Record<string, unknown>) {
  mockCameraView(props);
  return <View testID="camera-view" />;
}

// ⚠️ Mock ĐÚNG file nạp module (`load-camera-module`), không mock `expo-camera`: Jest không chạy được `import()` động,
// nên `jest.mock('expo-camera')` không với tới nó — xem chú thích ở `load-camera-module.ts`.
jest.mock('../utils/load-camera-module', () => ({
  loadCameraModule: () => mockLoadCameraModule(),
  useCameraPermissions: () => mockPermissions(),
}));

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-aBcDe';
const LINK_QR = `https://superapp.vcijsc.com/invite/${TOKEN}`;
const NOT_INVITE = 'Mã QR này không phải link mời';

const permission = (granted: boolean, canAskAgain: boolean) => ({
  canAskAgain,
  expires: 'never',
  granted,
  status: granted ? 'granted' : canAskAgain ? 'undetermined' : 'denied',
});
const givePermission = (value: ReturnType<typeof permission> | null) =>
  mockPermissions.mockReturnValue([value, mockRequest, mockRefresh]);

/** Camera bắn một kết quả quét — gọi đúng `onBarcodeScanned` mà màn đã đưa cho `CameraView` ở lần vẽ gần nhất. */
async function scan(data: string): Promise<void> {
  const props = mockCameraView.mock.lastCall?.[0] as {
    onBarcodeScanned: (result: { data: string; type: string }) => void;
  };
  await act(async () => props.onBarcodeScanned({ data, type: 'qr' }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadCameraModule.mockResolvedValue({ CameraView: MockCameraView });
  givePermission(permission(true, true));
});
afterEach(() => jest.useRealTimers());

describe('ScanInviteScreen — quét', () => {
  it('đã cấp quyền: camera sau, CHỈ đọc QR, kèm hướng dẫn và nút nhập tay', async () => {
    await renderWithProviders(<ScanInviteScreen />);

    expect(await screen.findByTestId('camera-view')).toBeOnTheScreen();
    expect(mockCameraView).toHaveBeenLastCalledWith(
      expect.objectContaining({ barcodeScannerSettings: { barcodeTypes: ['qr'] }, facing: 'back' }),
    );
    expect(screen.getByText('Đưa mã QR của link mời vào khung để quét.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Nhập mã thủ công' })).toBeOnTheScreen();
  });

  it.each([
    ['link mời chung', LINK_QR, { params: { code: TOKEN }, pathname: '/invite/[code]' }],
    ['lời mời email', `${LINK_QR.replace('/invite/', '/invite/e/')}`, { params: { token: TOKEN }, pathname: '/invite/e/[token]' }],
  ])('quét %s → điều hướng ĐÚNG MỘT LẦN dù camera bắn liên tục', async (_name, data, href) => {
    await renderWithProviders(<ScanInviteScreen />);
    await screen.findByTestId('camera-view');

    await scan(data);
    await scan(data);
    await scan(data);

    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith(href);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('quét mã KHÔNG phải link mời → báo, không điều hướng; sau ~1,5 giây quét lại được', async () => {
    jest.useFakeTimers();
    await renderWithProviders(<ScanInviteScreen />);
    await act(async () => undefined); // để việc nạp module camera (Promise) xong — không dùng findBy dưới fake timers

    await scan('https://example.com/khong-phai-link-moi');
    expect(screen.getByText(NOT_INVITE)).toBeOnTheScreen();
    expect(router.replace).not.toHaveBeenCalled();

    // Đang trong thời gian chờ: mã hợp lệ đến sớm vẫn bị bỏ qua (tránh nhấp nháy/quét dồn).
    await scan(LINK_QR);
    expect(router.replace).not.toHaveBeenCalled();

    await act(async () => jest.advanceTimersByTime(INVALID_SCAN_COOLDOWN_MS));
    expect(screen.queryByText(NOT_INVITE)).toBeNull();
    expect(screen.getByText('Đưa mã QR của link mời vào khung để quét.')).toBeOnTheScreen();

    await scan(LINK_QR);
    expect(router.replace).toHaveBeenCalledTimes(1);
  });
});

describe('ScanInviteScreen — quyền camera', () => {
  it('đang hỏi quyền (null): chỉ khung giữ chỗ — không camera, không màn giải thích', async () => {
    givePermission(null);
    await renderWithProviders(<ScanInviteScreen />);
    await act(async () => undefined);

    expect(screen.queryByTestId('camera-view')).toBeNull();
    expect(screen.queryByText('Cần quyền dùng camera')).toBeNull();
    expect(screen.getByRole('button', { name: 'Nhập mã thủ công' })).toBeOnTheScreen();
  });

  it('chưa cấp, còn hỏi lại được: màn giải thích + "Cấp quyền camera" (gọi xin quyền), không camera', async () => {
    givePermission(permission(false, true));
    await renderWithProviders(<ScanInviteScreen />);

    expect(await screen.findByText('Cần quyền dùng camera')).toBeOnTheScreen();
    expect(screen.queryByTestId('camera-view')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mở Cài đặt' })).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Cấp quyền camera' }));
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('từ chối vĩnh viễn (canAskAgain=false): nút "Mở Cài đặt" → Linking.openSettings, không còn nút xin quyền', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    givePermission(permission(false, false));
    await renderWithProviders(<ScanInviteScreen />);

    expect(await screen.findByText(/Quyền camera đang bị tắt/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Cấp quyền camera' })).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Mở Cài đặt' }));
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it('quay lại app từ Cài đặt (AppState → active) thì đọc lại quyền', async () => {
    givePermission(permission(false, false));
    await renderWithProviders(<ScanInviteScreen />);
    await screen.findByText('Cần quyền dùng camera');

    const listeners = jest.mocked(AppState.addEventListener).mock.calls;
    await act(async () => {
      for (const [type, handler] of listeners) if (type === 'change') handler('active');
    });

    expect(mockRefresh).toHaveBeenCalled();
  });

  it.each([
    ['đã cấp quyền', permission(true, true)],
    ['chưa cấp quyền', permission(false, true)],
    ['bị chặn vĩnh viễn', permission(false, false)],
  ])('"Nhập mã thủ công" luôn có (%s) và lùi về màn nhập tay', async (_name, value) => {
    givePermission(value);
    await renderWithProviders(<ScanInviteScreen />);
    await screen.findByRole('button', { name: 'Nhập mã thủ công' });

    await fireEvent.press(screen.getByRole('button', { name: 'Nhập mã thủ công' }));

    expect(router.dismissTo).toHaveBeenCalledWith('/workspaces/join');
  });
});
