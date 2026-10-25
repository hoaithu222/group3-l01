import { type ReactNode } from 'react';
import { type ImageProps } from 'expo-image';
import { Text, View } from 'react-native';

import { Card } from './Card';
import { mediaCardStyles, type MediaCardAspect } from './media-card.styles';
import { Thumbnail } from './Thumbnail';

export interface MediaCardProps {
  /**
   * Tỉ lệ khung ảnh — bảng số đo và lý do ở `media-card.styles.ts`.
   * Mặc định `square`: loại 2 (lưới 2 cột) là ca xuất hiện thật nhiều nhất
   * (8 ô sản phẩm ở `222:13411` và `259:123578`).
   */
  aspect?: MediaCardAspect;
  className?: string;
  /** Mô tả / giá bán dưới tiêu đề. */
  description?: string;
  /**
   * Khoá thẻ: `onPress` không chạy nữa, chữ chuyển màu khoá và `Card` đổi nền.
   * ⚠️ Chỉ có nghĩa khi thẻ có `onPress`.
   */
  disabled?: boolean;
  /**
   * Nội dung chân thẻ (nút "Đổi quà ngay", huy hiệu). Nằm TRONG đệm 12dp.
   *
   * ✅ Đặt thứ BẤM ĐƯỢC vào đây là hợp lệ, kể cả khi thẻ đã có `onPress`: gặp cả
   * hai thì thẻ tự chuyển sang chế độ tách ô trợ năng nên nút không bị nuốt —
   * xem `splitAction` ở thân component.
   *
   * ⚠️ Nút trong này phải tự có `accessibilityLabel` nếu nó chỉ có biểu tượng:
   * nó là một ô riêng, không mượn được tên của thẻ.
   */
  footer?: ReactNode;
  /** Có thì cả thẻ thành nút bấm (mở màn chi tiết sản phẩm). */
  onPress?: () => void;
  /** Nguồn ảnh của `expo-image`: URL, `require(...)`, hoặc `{ uri, blurhash }`. */
  source: ImageProps['source'];
  /** Tên sản phẩm / tiêu đề ưu đãi. Chuỗi vì nó là NHÃN của cả thẻ khi bấm được. */
  title: string;
}

/**
 * Thẻ có ảnh bìa dán sát mép — "card thông tin" của slide quy định `193:25737`
 * (ô sản phẩm lưới 2 cột `259:123597`, thẻ rail ngang, banner `193:25366`).
 *
 * ── ✅ Vì sao dựng BẰNG `Card` chứ không dựng lại từ đầu ─────────────────────
 * `Card` vừa có khe `media` (vẽ TRƯỚC `title`) kèm biến thể tự bật
 * `overflow-hidden`. Sau khi có khe đó, phần còn thiếu của thẻ ảnh chỉ là ba
 * thứ: TỈ LỆ khung ảnh, đệm 12 của khối chữ, và khe 4 giữa tên với giá. Bo góc
 * 24, nền `bg-1`, nền lúc khoá, cách cắt ảnh theo góc bo — `Card` đã lo hết.
 *
 * ⛔ Dựng lại từ đầu là có HAI bộ số đo cho cùng một cái hộp, và lần đổi token
 * sau (bo góc 24 → 20 chẳng hạn) sẽ chỉ đổi được một trong hai. Ở đây nhập
 * thẳng `'./Card'` — ⛔ không qua `@/shared/ui` (import vòng, xem barrel tổng).
 *
 * ── ⚠️ Cái giá phải trả: tiêu đề KHÔNG đi qua khe `title` của `Card` ─────────
 * `Card` chỉ đệm được ở lớp GỐC (`padded`), mà ở đây ảnh phải dán sát mép còn
 * chữ phải thụt vào 12 — hai yêu cầu ngược nhau trên cùng một lớp. Nên thẻ chạy
 * `padded={false}` và `MediaCard` tự dựng khối chữ có đệm riêng.
 *
 * Hệ quả trợ năng, và nó rẽ làm HAI nhánh theo `footer`:
 *  · **Không có `footer`** (lưới 8 ô sản phẩm) ⇒ gộp cả thẻ thành MỘT ô. Đó là
 *    điều ĐÚNG ở đây: TalkBack đọc "Kim Gia Bảo 1 chỉ, 17.000.000 VND, nút"
 *    trong một nhịp, thay vì bắt người dùng vuốt ba lần cho MỖI ô trong lưới.
 *  · **Có `footer` + có `onPress`** ⇒ tách ô, và đây là phần đã SỬA. Bản trước
 *    gộp trong mọi ca, nên một nút đặt ở `footer` bị ô đó nuốt mất. Đã mở Figma
 *    kiểm lại: slide `193:25737` vẽ hẳn thẻ "Ví dụ minh hoạ" có `Divider`
 *    (`193:25817`) rồi `Button/bt link` (`193:25818`, HIỆN chứ không `hidden`)
 *    nằm TRONG thẻ — chữ trên nút là "Đổi quà ngay". Tức bản vẽ có thật ca
 *    "thẻ bấm được + nút riêng bên trong", và gộp là bỏ mất một trong hai hành
 *    động đối với người dùng trình đọc màn hình.
 *    ⚠️ Cái giá: thẻ đó thành 3 chặng vuốt thay vì 1. Đổi lại được cả hai hành
 *    động — im lặng mất một nút tệ hơn nhiều.
 *  · Tiêu đề ở đây KHÔNG mang vai `header` như `Card.title`. Cố ý: một lưới 8 ô
 *    sản phẩm mà mỗi ô là một "tiêu đề" thì phím nhảy-theo-tiêu-đề của trình đọc
 *    màn hình hết tác dụng — chúng là mục dữ liệu, không phải mốc chia nhóm.
 *    (Khi tách ô thì nó mang vai `button`, không phải `header` — một node chỉ
 *    mang được một vai, và vai mở được thẻ mới là vai không thay thế được.)
 */
export function MediaCard({
  aspect = 'square',
  className,
  description,
  disabled = false,
  footer,
  onPress,
  source,
  title,
}: MediaCardProps) {
  const styles = mediaCardStyles({ disabled });

  /**
   * ⛔ Điều kiện là `footer` CÓ NỘI DUNG, không phải "thẻ bấm được".
   *
   * Tách ô khi không cần là thiệt thật: mỗi thẻ trong lưới 8 ô thành 2–3 chặng
   * vuốt, và trình đọc màn hình mất câu đọc gọn "tên, giá, nút". Chỉ tách đúng
   * lúc trong thẻ có một hành động THỨ HAI để mà mất — tức khi `footer` được
   * truyền vào (`Button/bt link` của `193:25818`).
   */
  const splitAction = onPress !== undefined && footer !== undefined;

  return (
    <Card
      className={styles.root({ className })}
      disabled={disabled}
      media={
        /**
         * ⛔ Ảnh bìa ở đây là TRANG TRÍ nên KHÔNG truyền `alt`: mọi thông tin
         * của nó đã có trong `title`/`description`. Có `alt` thì trình đọc màn
         * hình xướng thêm một ô "hình ảnh" trước MỖI thẻ — 8 ô rác trong một
         * lưới 8 sản phẩm. (`Thumbnail` tự ẩn khi thiếu `alt`.)
         *
         * ⚠️ `rounded-none` là bắt buộc, không phải cho gọn: `Thumbnail` bo
         * `rounded-sm` (16) cho ca đứng một mình, còn ở đây ảnh dán sát mép
         * TRONG một `Card` đã bo 24 và `overflow-hidden`. Để nguyên 16 thì hai
         * đường cong lồng nhau lệch 8dp ở hai góc trên — sai bản vẽ mà không có
         * lỗi nào báo.
         */
        <Thumbnail aspect={aspect} className="rounded-none" source={source} />
      }
      padded={false}
      splitAction={splitAction}
      onPress={onPress}
    >
      <View className={styles.body()}>
        {/* ⛔ Không `numberOfLines`: bản vẽ khoá "H: theo nội dung" (slide
            `193:25737`), tên sản phẩm hai dòng là chuyện thường và cắt cụt
            "Kim Gia Bảo - 1 c…" thì người dùng không biết mình đang mua cỡ nào. */}
        <Text
          /**
           * ⛔ Khi tách ô, vai `button` PHẢI nằm ở đây. `Card` đã hạ `accessible`
           * của `Pressable` nên không còn node nào khác mang vai đó: thiếu dòng
           * này là thẻ bấm được bằng ngón tay nhưng trình đọc màn hình không có
           * gì để kích hoạt, và lỗi đó im lặng tuyệt đối.
           *
           * ⚠️ `accessibilityState` phải đi CÙNG CHỖ với vai — đặt riêng ở
           * `Pressable` thì TalkBack xướng "nút" mà không xướng "đã tắt", người
           * dùng bấm rồi ngồi đợi một phản hồi không bao giờ tới.
           */
          accessibilityRole={splitAction ? 'button' : undefined}
          accessibilityState={splitAction ? { disabled } : undefined}
          className={styles.title()}
        >
          {title}
        </Text>
        {description ? <Text className={styles.description()}>{description}</Text> : null}
        {footer}
      </View>
    </Card>
  );
}
