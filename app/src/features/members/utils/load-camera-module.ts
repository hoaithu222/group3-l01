import { logger } from '@/shared/utils/logger';

const importCameraModule = () => import('expo-camera');

/** Kiểu module — suy từ chính lời gọi `import()`, nên không cần một dòng `import … from 'expo-camera'` nào. */
export type CameraModule = Awaited<ReturnType<typeof importCameraModule>>;

/** Module đã nạp thành công (cache cho cả phiên) — `useCameraPermissions` bên dưới đọc từ đây. */
let loaded: CameraModule | null = null;

/**
 * Nạp LƯỜI `expo-camera` bằng `import()` động, trong try/catch — trả `null` khi thiếu module native.
 *
 * ⛔ KHÔNG viết `import … from 'expo-camera'` ở đầu BẤT KỲ file nào được nạp lúc khởi động — kể cả file này.
 *
 * `expo-camera` là module NATIVE (`ExpoCamera`). Expo Router nạp MỌI file route lúc khởi động, kéo theo mọi thứ
 * chúng import tĩnh; `expo-camera` khi được nạp gọi `requireNativeModule('ExpoCamera')` và NÉM LỖI
 * (`Cannot find native module 'ExpoCamera'`) nếu bản dev client đang cài chưa build lại với plugin `expo-camera`
 * (thêm module native ⇒ phải build lại). Import tĩnh nghĩa là app đỏ màn NGAY LÚC MỞ trên mọi máy chưa build lại —
 * kể cả người chẳng bao giờ vào màn quét. `import()` động thì lỗi chỉ xảy ra khi MỞ màn quét, và bắt được ở đây.
 * `tests/expo-camera-lazy.test.ts` quét nguồn để chặn import tĩnh quay lại. Cùng khuôn với
 * `@/core/media/livekit-loader.ts`.
 *
 * ⚠️ Jest KHÔNG chạy được `import()` động (không có `--experimental-vm-modules`): `jest.mock('expo-camera')` không
 * với tới nó, nên test của màn quét mock CHÍNH file này (`jest.mock('../utils/load-camera-module')`) — xem
 * `ScanInviteScreen.test.tsx`. Đó là lý do hàm nằm ở file riêng thay vì trong hook.
 */
export async function loadCameraModule(): Promise<CameraModule | null> {
  if (loaded) return loaded;
  try {
    loaded = await importCameraModule();
    return loaded;
  } catch (error) {
    // Cảnh báo (vàng, chỉ ở dev) chứ không ném: người phát triển thấy ngay "cần build lại dev client", còn người dùng
    // cuối chỉ thấy màn "chưa hỗ trợ quét mã" với lối sang nhập tay.
    if (__DEV__) {
      logger.warn(
        '[members] Không nạp được expo-camera — bản cài đặt này chưa có module native ExpoCamera. ' +
          'Build lại dev client (npm run start:android) để quét được mã QR.',
        error,
      );
    }
    return null;
  }
}

/**
 * `useCameraPermissions` của module ĐÃ NẠP, đứng sau một hook TĨNH (định danh cố định) của chính app.
 *
 * Vì sao không gọi thẳng `camera.useCameraPermissions()` từ prop: React Compiler (đang BẬT) từ chối biên dịch
 * component có hook lấy từ giá trị động ("Hooks must be the same function on every render") — nó không chứng minh
 * được `camera` không đổi, nên bỏ qua CẢ component và ta mất memo hoá mà không có lỗi nào báo (Jest không chạy
 * compiler). Đọc qua biến cấp module thì compiler coi là hook đã biết.
 *
 * ⛔ CHỈ gọi sau khi `loadCameraModule()` đã trả module (màn quét chỉ dựng `InviteScanner` ở trạng thái `ready`) —
 * số hook mỗi lần vẽ nhờ đó luôn cố định.
 */
export function useCameraPermissions() {
  if (loaded === null) throw new Error('useCameraPermissions được gọi trước khi nạp xong expo-camera');
  return loaded.useCameraPermissions();
}
