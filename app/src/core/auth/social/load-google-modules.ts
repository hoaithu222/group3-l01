import { logger } from '@/shared/utils/logger';

const importModules = () =>
  Promise.all([
    import('@react-native-google-signin/google-signin'),
    import('@react-native-firebase/auth'),
  ]);

/** `[googleSignIn, firebaseAuth]` — kiểu suy từ chính `import()`, nên không cần dòng `import … from` nào. */
export type GoogleModules = Awaited<ReturnType<typeof importModules>>;

let loaded: GoogleModules | null = null;

/**
 * Nạp LƯỜI `@react-native-google-signin/google-signin` + `@react-native-firebase/auth` bằng `import()` động — trả `null` khi thiếu
 * module native.
 *
 * ⛔ KHÔNG viết `import … from` hai gói này ở đầu BẤT KỲ file nào được nạp lúc khởi động (`tests/google-signin-lazy.test.ts` quét nguồn
 * để chặn). Hai gói là module NATIVE (`RNGoogleSignin`, RNFirebase): Expo Router nạp mọi file route lúc khởi động, kéo theo mọi thứ
 * chúng import tĩnh, và gói nạp xong mà thiếu module native thì NÉM LỖI — app đỏ màn ngay lúc mở trên mọi máy đang cài bản dev
 * client/APK build TRƯỚC khi thêm hai gói này, kể cả người không bao giờ bấm "Tiếp tục với Google". Cùng khuôn với
 * `@/features/members/utils/load-camera-module.ts` và `@/core/media/livekit-loader.ts`.
 *
 * ⚠️ Jest KHÔNG chạy được `import()` động (không có `--experimental-vm-modules`): `jest.mock('@react-native-…')` không với tới nó, nên
 * test mock CHÍNH file này (`jest.mock('../load-google-modules')`). Đó là lý do hàm nằm ở file riêng.
 */
export async function loadGoogleModules(): Promise<GoogleModules | null> {
  if (loaded) return loaded;
  try {
    loaded = await importModules();
    return loaded;
  } catch (error) {
    // Cảnh báo (chỉ ở dev) chứ không ném: người phát triển thấy ngay "cần build lại", người dùng cuối thấy câu "chưa hỗ trợ".
    if (__DEV__) {
      logger.warn(
        '[google-sign-in] Không nạp được module native (RNGoogleSignin / RNFirebase) — build lại dev client (npm run start:android).',
        error,
      );
    }
    return null;
  }
}
