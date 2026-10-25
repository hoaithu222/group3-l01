import { type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { alert, type AlertTone } from './alert.styles';
import { AlertCloseButton } from './AlertCloseButton';
import { AlertIcon } from './AlertIcon';

/**
 * Hộp thông báo NẰM TRONG trang.
 *
 * ⚠️ Khác `ToastHost`, và lẫn hai thứ này là lỗi thiết kế hay gặp: toast nổi
 * lên trên, tự biến mất, hợp với việc VỪA XẢY RA ("Đã sao chép số tài khoản");
 * alert nằm cố định trong bố cục, không tự tắt, hợp với điều kiện GẮN LIỀN với
 * khối nội dung bên cạnh (điều khoản dịch vụ, hạn mức, kết quả duyệt hồ sơ).
 * Alert mà tự tắt sẽ làm người dùng đọc dở câu.
 *
 * Công thức màu và số đo nằm ở `alert.styles.ts`; biểu tượng mặc định theo tông
 * nằm ở `AlertIcon.tsx`.
 *
 * ```tsx
 * <Alert description="Số dư khả dụng không đủ." title="Không thực hiện được" tone="error" />
 * <Alert description="Vui lòng kiểm tra thông tin." tone="brand" />   // cố ý không icon
 * <Alert description="Đã lưu nháp." icon={null} />                    // tắt icon mặc định
 * ```
 */

export interface AlertProps {
  /**
   * Nút hành động dưới phần mô tả (cách 12dp theo Figma).
   * Thường là `<LinkButton>` hoặc `<Button size="xs">` — `_button alert` của
   * bản vẽ (259:93598) cao **32dp**, tức là `xs`; `sm` là 40dp.
   */
  actions?: ReactNode;
  className?: string;
  /**
   * Nội dung chính. Nhận `ReactNode` để nhấn mạnh được một cụm giữa câu — mẫu
   * Figma có "…vui lòng liên hệ **1900 9247**".
   * ⚠️ Chỉ truyền chuỗi hoặc `<Text>` con: nó nằm TRONG một `<Text>`, nhét
   * `<View>` vào đó là RN ném lỗi lúc chạy.
   */
  description: ReactNode;
  /**
   * Biểu tượng đầu hộp, khung 24dp.
   *
   * ✅ Bỏ trống thì lấy hình MẶC ĐỊNH theo tông (`AlertIcon.tsx`) — bản vẽ định
   * nghĩa intent bằng icon, và tông `warning` bắt buộc phải có icon vì màu của
   * nó không đạt ngưỡng tương phản AA.
   * Truyền `icon={null}` để cố ý bỏ icon; truyền phần tử để ghi đè.
   */
  icon?: ReactNode;
  /** Có truyền thì hiện nút ✕. Không truyền thì alert không đóng được — đúng cho cảnh báo bắt buộc đọc. */
  onClose?: () => void;
  title?: string;
  tone?: AlertTone;
}

export function Alert({
  actions,
  className,
  description,
  icon,
  title,
  tone = 'info',
  onClose,
}: AlertProps) {
  const styles = alert({ tone });

  return (
    <View className={styles.root({ className })}>
      <View className={styles.body()}>
        <AlertIcon icon={icon} tone={tone} />

        <View className={styles.content()}>
          <View
            /**
             * ⛔ Thiếu prop này thì alert xuất hiện giữa chừng (sau khi gửi biểu
             * mẫu, sau khi đổi số tiền) LẶNG LẼ với TalkBack: người dùng khiếm
             * thị phải tự dò lại cả trang mới biết có gì mới, và phần lớn sẽ
             * không dò. ⚠️ Android-only; trên iOS `accessibilityRole="alert"`
             * đảm nhiệm việc tương đương.
             */
            accessibilityLiveRegion="polite"
            /**
             * Chỉ tông cảnh báo/lỗi mới nhận role `alert`: role này khiến trình
             * đọc màn hình NGẮT LỜI nội dung đang đọc. Gắn cho cả tông thông tin
             * thì một dòng ghi chú vô hại cũng cắt ngang người dùng giữa câu.
             */
            accessibilityRole={tone === 'warning' || tone === 'error' ? 'alert' : undefined}
            /**
             * ⛔ `accessible` là thứ BIẾN khối chữ thành một phần tử trợ năng.
             *
             * Thiếu nó, `accessibilityRole="alert"` ở trên không có tác dụng
             * nào: với React Native, một `<View>` không `accessible` KHÔNG phải
             * phần tử trợ năng, nên VoiceOver bỏ qua cả role lẫn nội dung gộp.
             * Gắn ở ĐÂY chứ không ở thẻ ngoài cùng là có chủ ý — `accessible`
             * gộp mọi thứ bên trong thành MỘT ô, mà thẻ ngoài cùng còn chứa nút
             * ✕ và các nút hành động; gộp cả chúng vào thì người dùng khiếm thị
             * không cách nào lia tới nút để bấm.
             */
            accessible
            className={styles.header()}
          >
            {title ? <Text className={styles.title()}>{title}</Text> : null}
            <Text className={styles.description()}>{description}</Text>
          </View>

          {actions ? <View className={styles.actions()}>{actions}</View> : null}
        </View>
      </View>

      {onClose ? <AlertCloseButton onPress={onClose} /> : null}
    </View>
  );
}
