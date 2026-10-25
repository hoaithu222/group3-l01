import { loadCameraModule, useCameraPermissions } from '../utils/load-camera-module';

/**
 * `loadCameraModule` — ranh giới giữa app và module native `ExpoCamera`. Nó phải BẮT lỗi nạp và trả `null` (không ném),
 * để màn quét rơi về "chưa hỗ trợ quét mã" thay vì đỏ màn trên bản dev client chưa build lại.
 *
 * Nhánh THÀNH CÔNG không test được ở đây: Jest không chạy `import()` động (không có `--experimental-vm-modules`),
 * nên nó được thay bằng bản giả ở `ScanInviteScreen.test.tsx`. `expo-camera` được mock ném lỗi giống hệt thật, để kết
 * quả không đổi nếu sau này Jest bật được `import()` động.
 */

jest.mock('expo-camera', () => {
  throw new Error("Cannot find native module 'ExpoCamera'");
});

describe('loadCameraModule — thiếu module native', () => {
  it('trả null, KHÔNG ném lỗi', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(loadCameraModule()).resolves.toBeNull();

    warn.mockRestore();
  });

  it('ở dev: cảnh báo nói rõ cần build lại dev client (để người phát triển không phải đoán vì sao màn quét trống)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await loadCameraModule();

    // `expect.anything()` chứ không `expect.any(Error)`: lỗi của `import()` đến từ realm của Node, không phải `Error` của sandbox Jest.
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Build lại dev client/), expect.anything());
    warn.mockRestore();
  });
});

describe('useCameraPermissions (hook tĩnh của app)', () => {
  it('gọi trước khi nạp xong module → ném lỗi rõ ràng, không rơi vào "undefined is not a function"', () => {
    expect(() => useCameraPermissions()).toThrow(/trước khi nạp xong expo-camera/);
  });
});
