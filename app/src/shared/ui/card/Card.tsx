import { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { cardStyles, type CardVariants } from './card.styles';

export interface CardProps extends Pick<CardVariants, 'padded'> {
  children?: ReactNode;
  className?: string;
  /**
   * Khoá thẻ: `onPress` không chạy nữa và thẻ đổi sang nền khoá.
   * ⚠️ Chỉ có nghĩa khi thẻ có `onPress` — thẻ chỉ để đọc thì không có gì để khoá.
   */
  disabled?: boolean;
  /** Nội dung chân thẻ (nút, ghi chú). Nằm sau `children`, cách 12px. */
  footer?: ReactNode;
  /**
   * Khe đứng TRƯỚC `title`: huy hiệu biểu tượng (ô chọn "Chat qua Zalo"
   * `822:32149` — nút tròn 42×42 ở góc trên trái, rồi mới tới tiêu đề), hoặc
   * ảnh bìa của thẻ có ảnh (slide quy định `193:25737`: loại 1 rail ngang
   * 276×170, loại 2 lưới 2 cột vuông 1:1 rộng 165.5).
   *
   * ⛔ Vì sao phải là một PROP chứ không phải mẹo `title={<><Badge/>…</>}`:
   * `splitAction` (xem thân component) chỉ chạy khi `title` là CHUỖI. Nhét
   * huy hiệu vào `title` là mất nhánh đó — `Pressable` giữ `accessible` và gộp
   * cả cây con thành MỘT ô, tức là mọi hàng bấm được bên trong thẻ biến mất
   * khỏi trình đọc màn hình. Có `media` thì `title` vẫn là chuỗi.
   *
   * ⚠️ `media` nằm TRONG đệm của thẻ (`padded` mặc định) — đúng cho huy hiệu
   * 42×42 cách mép 16. Ảnh bìa dán sát mép thì `padded={false}`, và nơi gọi tự
   * cho khối chữ bên dưới lề riêng (`className="p-sm"` theo quy định slide).
   */
  media?: ReactNode;
  /**
   * Có thì cả thẻ thành nút bấm. ⚠️ Kèm ràng buộc trợ năng: thẻ bấm được nên có
   * `title` dạng CHUỖI, và ⛔ đừng đặt nút hay `<ListItem onPress>` vào thẻ bấm
   * được mà không có tiêu đề chuỗi — xem chú thích ở thân component.
   */
  onPress?: () => void;
  /**
   * Ép thẻ KHÔNG gộp cây con thành một ô trợ năng, kể cả khi `title` không phải
   * chuỗi.
   *
   * ⛔ Chỉ bật khi `children` đã TỰ có một phần tử mang `accessibilityRole="button"`
   * đặt tên cho hành động của thẻ. Bật mà không có phần tử đó thì thẻ bấm được
   * bằng ngón tay nhưng BIẾN MẤT khỏi trình đọc màn hình — không còn node nào
   * mang vai `button`, và người khiếm thị không có đường nào mở được thẻ.
   *
   * Sinh ra cho `MediaCard`: ảnh bìa phải dán sát mép còn chữ phải thụt 12, nên
   * nó chạy `padded={false}` và tự dựng khối chữ — tức `title` không đi qua khe
   * `title` của `Card` và nhánh tự động bên dưới không bắt được.
   */
  splitAction?: boolean;
  /**
   * Tiêu đề nhóm. Chuỗi thì được bọc `<Text>` kèm `accessibilityRole="header"`
   * — trình đọc màn hình nhờ đó nhảy được giữa các nhóm thay vì phải vuốt qua
   * từng dòng (⚠️ thẻ có `onPress` thì vai đổi sang `button`, xem thân
   * component). Phần tử React thì đặt nguyên (tiêu đề có biểu tượng, có nút phụ).
   */
  title?: ReactNode;
}

/**
 * Khối trắng bo góc bao một nhóm nội dung — thường là một chồng `<ListItem>`
 * (Figma "Frame 1000005018" 259:97534 và thẻ nhóm 259:97603 / 259:97608).
 *
 * Công thức class, bảng biến thể và lý do thẻ KHÔNG đổ bóng nằm ở
 * `card.styles.ts`.
 */
export function Card({
  children,
  className,
  disabled = false,
  footer,
  media,
  onPress,
  padded = true,
  splitAction: splitActionProp,
  title,
}: CardProps) {
  const styles = cardStyles({
    disabled,
    media: media != null,
    padded,
    pressable: onPress !== undefined && !disabled,
  });

  /**
   * ⛔ Thẻ bấm được KHÔNG được nuốt nội dung của chính nó.
   *
   * `Pressable` mặc định `accessible` (RN đặt `accessible: accessible !== false`)
   * và một phần tử `accessible` gộp CẢ cây con thành MỘT ô. Mà `children` ở đây
   * theo thiết kế là một chồng `<ListItem>` — mọi hàng bấm được trong đó, cùng
   * nút ở `footer`, biến mất khỏi trình đọc màn hình; đổi lại là một ô duy nhất
   * xướng nguyên khối chữ dài của cả thẻ, không ai nghe hết.
   *
   * Cách vá: hạ cờ ở `Pressable` rồi để chính TIÊU ĐỀ mang vai `button` — nó là
   * thứ duy nhất trong thẻ đặt tên được cho hành động. Một node chỉ mang được
   * MỘT vai nên thẻ bấm được sẽ mất vai `header`: giữ `header` thì thẻ hết kích
   * hoạt được bằng trình đọc màn hình, mà đó mới là thứ không thay thế được.
   *
   * ⚠️ Suy ra tự động thì chỉ làm được khi tiêu đề là CHUỖI. Tiêu đề dạng phần
   * tử (hoặc không có tiêu đề) thì `Card` không biết chỗ nào đặt vai, nên thẻ
   * giữ kiểu gộp cũ — và ⛔ đừng đặt nút vào một thẻ như vậy.
   *
   * ⚠️ `splitAction` truyền vào ĐÈ suy luận đó: nó dành cho thẻ tự dựng tiêu đề
   * bên trong `children` và tự gắn vai (xem `MediaCard`). ⛔ Đừng bật nó chỉ để
   * "cho chắc" — xem cảnh báo ở khai báo prop.
   */
  const splitAction = onPress !== undefined && (splitActionProp ?? typeof title === 'string');

  const body = (
    <>
      {/* ⚠️ TRƯỚC `title`: thứ tự vẽ ở đây là thứ tự trên màn — huy hiệu/ảnh bìa
          luôn nằm trên tiêu đề trong bản vẽ (`822:32149`, `193:25737`). */}
      {media}
      {typeof title === 'string' ? (
        <Text
          accessibilityRole={splitAction ? 'button' : 'header'}
          /**
           * ⚠️ Cờ khoá phải đi CÙNG CHỖ với vai `button`: khi `splitAction`, vai
           * nằm ở tiêu đề chứ không ở `Pressable`, nên đặt `accessibilityState`
           * ở `Pressable` thôi là trình đọc màn hình xướng "nút" mà không xướng
           * "đã tắt" — người dùng bấm rồi ngồi đợi một phản hồi không tới.
           */
          accessibilityState={splitAction ? { disabled } : undefined}
          className={styles.title()}
        >
          {title}
        </Text>
      ) : (
        title
      )}
      {children}
      {footer}
    </>
  );

  if (!onPress) return <View className={styles.root({ className })}>{body}</View>;

  return (
    <Pressable
      accessibilityRole={splitAction ? undefined : 'button'}
      accessibilityState={{ disabled }}
      accessible={!splitAction}
      className={styles.root({ className })}
      disabled={disabled}
      onPress={onPress}
    >
      {body}
    </Pressable>
  );
}
