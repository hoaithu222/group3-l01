import type Pdf from 'react-native-pdf';

/** Kiểu của component `Pdf` — CHỈ kiểu (xoá lúc biên dịch), không kéo module native vào bundle sớm. */
export type PdfComponent = typeof Pdf;

/**
 * Nạp `react-native-pdf` LƯỜI, trong try/catch — trả `null` khi thiếu native
 * module (dev-client hiện tại CHƯA biên dịch `react-native-pdf`/`react-native-blob-util`
 * vào — xem app.md p3-01 §6) hoặc bất kỳ lỗi khởi tạo nào.
 *
 * ⛔ TUYỆT ĐỐI không `import Pdf from 'react-native-pdf'` tĩnh ở đầu file nào:
 * `react-native-pdf` nạp `react-native-blob-util` ngay lúc import, mà thiếu
 * native module thì import NÉM LỖI — trên đường import tĩnh nó sập cả cây route
 * chứa `ResourcePreviewScreen` lúc mở app, không chỉ lúc mở PDF. `require` đặt
 * TRONG hàm chỉ chạy khi `PdfPreview` mount lần đầu, và lỗi bắt được ngay tại đây
 * → `PdfPreview` rơi về "Mở bằng ứng dụng khác" thay vì crash.
 *
 * ⚠️ `require` thay vì `import()` động có chủ ý: Jest không chạy `import()` động
 * (không có `--experimental-vm-modules`) nên nhánh "thiếu module" không kiểm
 * được; `require` chạy ở cả Metro lẫn Jest. Đây là chỗ DUY NHẤT của feature cần
 * ngoại lệ `no-require-imports`.
 */
export function loadPdfComponent(): PdfComponent | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- nạp lười trong try/catch, xem chú thích trên
    const loaded = require('react-native-pdf') as { default?: PdfComponent };
    return loaded.default ?? null;
  } catch {
    return null;
  }
}
