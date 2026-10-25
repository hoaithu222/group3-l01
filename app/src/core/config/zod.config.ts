import { z } from 'zod';

const vietnamese = z.locales.vi();

/**
 * Đặt tiếng Việt làm ngôn ngữ mặc định cho MỌI thông báo lỗi của Zod.
 *
 * Không có bước này thì lỗi form ra tiếng Anh ("String must contain at least 1
 * character(s)") giữa một giao diện tiếng Việt — và người dùng cuối không đọc
 * được. Đặt ở tầng cấu hình chứ không đi viết `message` cho từng field: 200
 * field thì 200 chỗ để quên.
 *
 * Hai câu được viết đè vì bản dịch mặc định đọc rất máy móc ở đúng hai ca hay
 * gặp nhất — trường bắt buộc và danh sách chọn bắt buộc.
 *
 * ⛔ Gọi MỘT lần lúc khởi động, TRƯỚC khi bất kỳ schema nào được `parse`.
 * Xem `src/shell/providers/AppProviders.tsx`.
 */
export function configureZodLocale(): void {
  z.config({
    localeError: (issue) => {
      if (issue.code === 'too_small' && issue.minimum === 1) {
        if (issue.origin === 'string') return 'Không được để trống';
        if (issue.origin === 'array') return 'Bắt buộc chọn ít nhất 1 mục';
      }
      return vietnamese.localeError(issue);
    },
  });
}
