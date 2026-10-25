import { logger } from '@/shared/utils/logger';

const importSkia = () => import('@shopify/react-native-skia');

/** Kiểu module — suy từ chính lời gọi `import()`, nên không cần một dòng `import … from '@shopify/react-native-skia'` nào (kể cả `import type`). */
export type SkiaModule = Awaited<ReturnType<typeof importSkia>>;
export type SkCanvas = Parameters<Parameters<SkiaModule['createPicture']>[0]>[0];
export type SkPaint = ReturnType<SkiaModule['Skia']['Paint']>;
export type SkPath = ReturnType<SkiaModule['Skia']['Path']['Make']>;
export type SkFont = ReturnType<SkiaModule['matchFont']>;
export type SkPicture = ReturnType<SkiaModule['createPicture']>;

let loaded: SkiaModule | null = null;

/**
 * Nạp LƯỜI `@shopify/react-native-skia` bằng `import()` động, trong try/catch — trả `null` khi bản dev client chưa có module native (Skia).
 *
 * ⛔ KHÔNG viết `import … from '@shopify/react-native-skia'` ở đầu file nào được nạp lúc khởi động — kể cả `import type`. Expo Router nạp MỌI file route
 * lúc mở app; Skia gọi vào module native khi nạp và NÉM LỖI nếu dev client cài trước đợt thêm gói chưa build lại ⇒ app đỏ màn NGAY LÚC MỞ, kể cả
 * người không vào bảng trắng (`docs/native-libraries.md` "Nạp lười module native"). `tests/skia-lazy.test.ts` quét nguồn để chặn import tĩnh quay lại.
 * Mọi mã vẽ nhận `SkiaModule` qua tham số (`PaintKit.skia`, prop `skia` của `WhiteboardCanvas`) thay vì tự import.
 *
 * ⚠️ Jest không chạy được `import()` động: test màn vẽ mock CHÍNH file này (`jest.mock('../canvas/skia-module')`).
 */
export async function loadSkiaModule(): Promise<SkiaModule | null> {
  if (loaded) return loaded;
  try {
    loaded = await importSkia();
    return loaded;
  } catch (error) {
    if (__DEV__) {
      logger.warn(
        '[whiteboard] Không nạp được @shopify/react-native-skia — bản cài đặt này chưa có module native Skia. Build lại dev client (npm run start:android) để dùng bảng trắng.',
        error,
      );
    }
    return null;
  }
}
