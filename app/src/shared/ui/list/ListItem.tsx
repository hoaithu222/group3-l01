import { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useListItemDefaults } from './ListItemDefaults';
import { listItemStyles, type ListItemVariants } from './list-item.styles';

/**
 * Dòng thông tin nhãn – giá trị: viên gạch của màn xác nhận giao dịch, chi tiết
 * khoản vay, biên lai (Figma `List item` 259:97535, 259:97604, 259:97607).
 *
 * ⚠️ Cạm bẫy bố cục lớn nhất — nhãn dài bóp giá trị về 0px — nằm ở
 * `list-item.styles.ts`. ⛔ Đọc chú thích ở đó TRƯỚC khi đổi class của hai cột.
 *
 * ⛔ Giá trị KHÔNG bao giờ nhận `numberOfLines`. "20.000.0…" đọc thành hai mươi
 * triệu hay hai trăm triệu đều được, và người dùng vẫn bấm Xác nhận. Thà hàng
 * cao thêm một dòng. Cần cắt thì cắt NHÃN (`labelNumberOfLines`) — nhãn thiếu
 * chữ cuối người ta vẫn đoán ra, số tiền thì không.
 */
export interface ListItemProps extends Pick<
  ListItemVariants,
  'align' | 'emphasis' | 'size' | 'tone'
> {
  className?: string;
  /** Chú thích phụ dưới nhãn (điều kiện, ghi chú nhỏ). */
  description?: string;
  /**
   * Khoá hàng: `onPress` không chạy nữa và chữ chuyển sang màu khoá.
   * ⚠️ Chỉ có nghĩa khi hàng có `onPress` — hàng chỉ để đọc thì không khoá gì.
   */
  disabled?: boolean;
  divider?: boolean;
  /**
   * Nhãn bên trái. Là `string` chứ không phải `ReactNode` vì nó phải ghép được
   * vào `accessibilityLabel` — xem chỗ dựng `spokenLabel`.
   */
  label: string;
  /** Số dòng tối đa của NHÃN. ⛔ Cố ý không có prop tương ứng cho giá trị. */
  labelNumberOfLines?: number;
  /** Khe trước nhãn (biểu tượng, ảnh). ⛔ Component này không tự tạo icon. */
  leading?: ReactNode;
  /** Có thì hàng thành nút bấm — mở màn chọn, xem chi tiết. */
  onPress?: () => void;
  /**
   * Hàng ĐANG ĐƯỢC CHỌN trong danh sách chọn một giá trị (`SelectSheet`).
   *
   * ⛔ Không phải prop trang trí: nó là thứ DUY NHẤT đưa trạng thái "đang chọn"
   * tới trình đọc màn hình. Thiếu nó, TalkBack đọc 63 dòng tỉnh/thành y hệt
   * nhau và người khiếm thị không có cách nào biết mình đã chọn cái nào — nền
   * tint thì họ không nhìn thấy.
   *
   * ⚠️ Vẫn nên kèm một dấu hiệu NHÌN THẤY ĐƯỢC ở khe `trailing`
   * (`<Icon name="checkmark-circle" label="Đang chọn" />`): luật của
   * `src/shared/ui/AGENTS.md` cấm để MÀU làm dấu hiệu duy nhất.
   */
  selected?: boolean;
  /** Khe sau giá trị (mũi tên `>`, nút phụ). Nhận từ ngoài, không tự vẽ.
   *  ⚠️ Nằm NGOÀI ô trợ năng của hàng ⇒ mũi tên thuần trang trí phải tự ẩn khỏi
   *  trình đọc màn hình, nếu không nó thành một ô đọc lên "›" sau MỖI hàng. */
  trailing?: ReactNode;
  /** Chuỗi/số thì được bọc `<Text>` theo kiểu chữ của biến thể; phần tử React
   *  (huy hiệu trạng thái, ô nhập) thì đặt nguyên vào cột phải. */
  value?: ReactNode;
  /**
   * Dòng phụ ngay DƯỚI giá trị — tỉ giá quy đổi, ngày hiệu lực, "≈ 1.234,56 USD".
   *
   * Figma có sẵn khe này (`I259:97607;245:1922`, đối xứng với `Support text`
   * dưới nhãn) nhưng nó `hidden` trong instance mẫu nên hay bị bỏ sót.
   * ⚠️ Vẽ được cả khi `value` là phần tử React; ⛔ nhưng KHÔNG hiện nếu không
   * có `value` — nó là dòng phụ CỦA giá trị, đứng một mình thì người đọc không
   * biết nó nói về cái gì.
   */
  valueDescription?: string;
}

export function ListItem({
  align = 'row',
  className,
  description,
  disabled = false,
  divider = false,
  emphasis: emphasisProp,
  label,
  labelNumberOfLines,
  leading,
  onPress,
  selected = false,
  size = 'md',
  tone = 'default',
  trailing,
  value,
  valueDescription,
}: ListItemProps) {
  // Prop thắng mặc định của nhóm (`ListItemDefaultsProvider`); không có cả hai ⇒ 'default' như cũ.
  const defaults = useListItemDefaults();
  const emphasis = emphasisProp ?? defaults.emphasis ?? 'default';
  const styles = listItemStyles({
    align,
    disabled,
    divider,
    emphasis,
    pressable: onPress !== undefined,
    selected,
    size,
    tone,
  });
  const isPlainValue = typeof value === 'string' || typeof value === 'number';

  /**
   * ⛔ Nhãn và giá trị phải đọc thành MỘT câu. Để rời, TalkBack đọc "Số tiền đề
   * nghị vay" — dừng — người dùng vuốt tiếp — "200.000.000 đồng". Giữa hai nhịp
   * đó họ đã quên đang nghe số của dòng nào, mà ở màn xác nhận giao dịch thì
   * nhầm dòng là nhầm tiền.
   *
   * Giá trị là phần tử React (huy hiệu…) thì để `undefined`: `accessible` khiến
   * hệ điều hành tự nối chữ của các con lại, vẫn ra một câu.
   */
  const spokenLabel = isPlainValue
    ? [`${label}: ${String(value)}`, valueDescription, description].filter(Boolean).join('. ')
    : undefined;

  /**
   * ⛔ Ô trợ năng gom ở CỘT GIỮA, thẻ ngoài `accessible={false}`: `Pressable` mặc
   * định `accessible` (RN đặt `accessible: accessible !== false`) mà phần tử
   * `accessible` gộp CẢ cây con thành MỘT ô ⇒ nút phụ ở khe `trailing` hết đường
   * lia tới. Gom nhãn vào một con `accessible` (mẫu `Alert.tsx`): câu đọc vẫn liền
   * mạch, `leading`/`trailing` thành ô rời, và vùng CHẠM vẫn là cả hàng.
   */
  const body = (
    <>
      {leading}
      <View
        accessibilityLabel={spokenLabel}
        accessibilityRole={onPress ? 'button' : undefined}
        /**
         * ⚠️ Cờ khoá VÀ cờ đang-chọn đi cùng chỗ với vai `button` — vai nằm ở
         * CỘT GIỮA, không ở `Pressable` (thẻ ngoài cố ý `accessible={false}`).
         * Khai `selected` ở `Pressable` thôi là nó rơi vào một node mà trình đọc
         * màn hình không dừng lại, và trạng thái coi như không tồn tại.
         */
        accessibilityState={{ disabled, selected }}
        accessible
        className={styles.content()}
      >
        <View className={styles.labelBox()}>
          <Text className={styles.label()} numberOfLines={labelNumberOfLines}>
            {label}
          </Text>
          {description ? <Text className={styles.description()}>{description}</Text> : null}
        </View>

        {value === undefined || value === null ? null : (
          <View className={styles.valueBox()}>
            {isPlainValue ? <Text className={styles.value()}>{value}</Text> : value}
            {valueDescription ? (
              <Text className={styles.valueDescription()}>{valueDescription}</Text>
            ) : null}
          </View>
        )}
      </View>
      {trailing}
    </>
  );

  if (!onPress) return <View className={styles.root({ className })}>{body}</View>;

  return (
    <Pressable
      accessibilityState={{ disabled, selected }}
      accessible={false}
      className={styles.root({ className })}
      disabled={disabled}
      onPress={onPress}
    >
      {body}
    </Pressable>
  );
}
