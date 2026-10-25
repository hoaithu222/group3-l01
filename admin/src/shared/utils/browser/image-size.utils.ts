/**
 * @file image-size.utils.ts
 * @description Đọc kích thước thật của một tệp ảnh — KHÔNG giải mã lại, KHÔNG
 * đụng vào nội dung tệp.
 *
 * Chat gửi ảnh NGUYÊN BẢN (chốt 07/08 — bỏ hẳn khâu thu nhỏ trước khi upload vì
 * ảnh chụp màn hình tài liệu bị mất chữ), nhưng vẫn cần `w/h` để bong bóng chừa
 * sẵn chỗ, không giật bố cục lúc ảnh tải xong.
 */

/** Ảnh không giải mã được bằng `createImageBitmap` (SVG ở vài trình duyệt). */
const isImage = (file: File): boolean => file.type.startsWith('image/');

/**
 * Trả `{ width, height }` của ảnh, hoặc `null` khi không phải ảnh / không giải
 * mã được. KHÔNG bao giờ ném — thiếu kích thước chỉ làm bong bóng giật nhẹ,
 * không đáng chặn việc gửi tệp.
 */
export const readImageSize = async (
  file: File,
): Promise<{ width: number; height: number } | null> => {
  if (!isImage(file)) return null;
  try {
    const bitmap = await createImageBitmap(file);
    try {
      return { width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
};
