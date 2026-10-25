/**
 * Nạp LƯỜI hai module native của p6-05 (`@rnmapbox/maps`, `expo-location`) trong try/catch — trả `null` khi thiếu native module.
 *
 * ⛔ TUYỆT ĐỐI không `import Mapbox from '@rnmapbox/maps'` / `import * as Location from 'expo-location'` tĩnh ở file nào của feature (test
 * `tests/o2o-lazy-native.test.ts` quét và chặn). Expo Router nạp MỌI file route lúc khởi động; bản dev client dựng TRƯỚC 2026-09-26 KHÔNG có hai
 * module này nên import tĩnh NÉM LỖI ⇒ cả app đỏ màn ngay lúc mở, kể cả người không bao giờ vào màn "Địa điểm". `import type` thì được (xoá lúc biên dịch).
 * Cùng mẫu `resources/utils/load-pdf-module.ts`.
 *
 * ⚠️ `require` thay vì `import()` động có chủ ý: Jest ở đây không chạy `import()` động nên nhánh "thiếu module" không kiểm được;
 * `require` chạy ở cả Metro lẫn Jest. Đây là chỗ DUY NHẤT của feature cần ngoại lệ `no-require-imports`.
 */
import type * as MapboxNs from '@rnmapbox/maps';
import type * as LocationNs from 'expo-location';

export type MapboxModule = typeof MapboxNs;
export type LocationModule = typeof LocationNs;

export function loadMapboxModule(): MapboxModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- nạp lười trong try/catch, xem chú thích đầu file
    return require('@rnmapbox/maps') as MapboxModule;
  } catch {
    return null;
  }
}

export function loadLocationModule(): LocationModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- nạp lười trong try/catch, xem chú thích đầu file
    return require('expo-location') as LocationModule;
  } catch {
    return null;
  }
}
