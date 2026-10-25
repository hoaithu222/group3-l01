/**
 * AuthPageHeading — cụm tiêu đề chuẩn của MỌI trang xác thực.
 *
 *   ▀Chào mừng trở lại▀         ← lời chào (`eyebrow`, tuỳ chọn) — <p>, vệt bút dạ quang
 *   Đăng nhập                   ← <h1> DUY NHẤT của trang
 *   Nhập email và mật khẩu…     ← câu phụ (tuỳ chọn)
 *
 * Vệt bút `HIGHLIGHTER_STYLE` là CÙNG nét với từ khoá "thông minh" ở khoang giới thiệu — thứ nối hai nửa
 * tấm thẻ thành một cuốn sổ.
 *
 * ⛔ `<h1>` THẬT. Bản trước dùng `Heading size="medium"`, mà tag của `Heading` đi theo CỠ — ra `<h3>`, và cả
 *    màn đăng nhập không có h1 nào. `Text as="h1"` giữ đúng cỡ 24px cũ (`text-h3-medium`), cùng cách
 *    `TitleScreen` dựng h1 cho trang nội dung.
 * ⛔ Lời chào nằm NGOÀI h1: tên truy cập của heading phải đúng bằng `title`. Trình đọc màn hình đọc h1
 *    như tên trang, và các bài kiểm tìm heading theo tên ("Đăng nhập", "Liên kết không hợp lệ").
 *
 * VÌ SAO LÀ MỘT COMPONENT: năm trang (bốn trang xác thực + đăng ký nhà tuyển dụng) dùng đúng cụm này. Copy
 * ra năm chỗ thì sửa vệt bút phải nhớ đủ năm — và lần nào cũng sót một chỗ.
 */

import { memo, type ReactNode } from 'react';

import { Text } from '@/shared/ui';

import { HIGHLIGHTER_STYLE } from '../constants/auth-motifs';

export interface AuthPageHeadingProps {
  /** Tiêu đề trang — render thành `<h1>` của màn. */
  title: string;
  /**
   * Câu phụ dưới tiêu đề. Bỏ trống khi trang chỉ có tiêu đề (vd màn báo liên kết hỏng) — lúc đó không
   * sinh thẻ rỗng.
   */
  description?: ReactNode;
  /**
   * Lời chào ngắn TRÊN tiêu đề ("Chào mừng trở lại"). Giọng thân thiện đặt ở ĐÂY, để `title` giữ đúng tên
   * việc của trang. Bỏ trống thì cụm chỉ còn tiêu đề + câu phụ.
   */
  eyebrow?: string;
}

const AuthPageHeading = memo(function AuthPageHeading({
  title,
  description,
  eyebrow,
}: AuthPageHeadingProps) {
  return (
    <div className="flex flex-col gap-2">
      {/* Vệt bút tô lên <span> NỘI TUYẾN, không lên <p>: nền của khối trải hết bề ngang dòng, còn nền nội
          tuyến chỉ phủ đúng chữ — và xuống dòng thì mỗi dòng một vệt (`boxDecorationBreak: clone`). */}
      {eyebrow && (
        <Text as="p" className="text-fg-2" size="small" weight="medium">
          <span style={HIGHLIGHTER_STYLE}>{eyebrow}</span>
        </Text>
      )}

      <div className="flex flex-col gap-1">
        <Text as="h1" size="extraLarge" weight="medium">
          {title}
        </Text>
        {description && (
          <Text as="p" size="small" skin="muted">
            {description}
          </Text>
        )}
      </div>
    </div>
  );
});

export default AuthPageHeading;
