import { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';

import { accountCardStyles } from './account-card.styles';

export interface AccountCardProps {
  className?: string;
  /**
   * Khoá thẻ: không bấm được nữa, nền và chữ chuyển sang cặp màu khoá.
   * ⚠️ Chỉ có nghĩa khi thẻ có `onPress` — thẻ chỉ để đọc thì không có gì để khoá.
   */
  disabled?: boolean;
  /** Nhãn dòng đầu, ví dụ "TK nguồn:". */
  label?: string;
  /** Khe ảnh/logo ngân hàng (Figma dùng ô 48×48). ⛔ Không tự tạo icon. */
  leading?: ReactNode;
  /** Có thì thẻ thành nút mở màn chọn tài khoản. */
  onPress?: () => void;
  /** Nhãn dòng hai, ví dụ "Số dư:". */
  secondaryLabel?: string;
  /** Giá trị dòng hai. Bỏ trống thì thẻ chỉ còn một dòng. */
  secondaryValue?: string;
  /**
   * Khe bên phải. Bỏ trống mà thẻ bấm được thì tự vẽ mũi tên — thiếu tín hiệu
   * đó, người dùng không biết thẻ này chạm được và ngồi tìm nút "Đổi" ở đâu.
   *
   * ⚠️ Khe này nằm NGOÀI ô trợ năng của thẻ (đó chính là điều làm nút "Đổi" bấm
   * được bằng trình đọc màn hình). Hệ quả: thứ thuần trang trí đặt vào đây phải
   * tự ẩn bằng `accessibilityElementsHidden` + `importantForAccessibility`.
   */
  trailing?: ReactNode;
  /** Giá trị dòng đầu — số tài khoản. */
  value: string;
}

/**
 * Thẻ chọn tài khoản nguồn: khe ảnh/logo bên trái, hai dòng nhãn – giá trị ở
 * giữa, mũi tên chọn bên phải (Figma "Card tài khoản nguồn" 259:97665).
 *
 * Công thức class, số đo và các quyết định về màu nằm ở `account-card.styles.ts`.
 *
 * ── ⚠️ Vì sao KHÔNG dựng bằng `Card` (khác `MediaCard`) ─────────────────────
 * `MediaCard` dựng bằng `Card` vì nó là ĐÚNG cái hộp đó, chỉ thêm ảnh bìa. Thẻ
 * này thì không: nền `action-base` (xanh rêu) chứ không `bg-1`, đệm `px-md py-xl`
 * chứ không `p-md`, xếp NGANG chứ không dọc, và nền lúc khoá là `action-disabled`
 * chứ không `disabled-1`. Bọc qua `Card` thì mọi lớp đó đều phải bị `className`
 * đè lại — tức là công thức gốc chỉ còn `w-full rounded-md`, và mỗi lần đọc phải
 * mở hai file mới biết class nào thắng.
 *
 * ⛔ Nhưng bo góc thì KHÔNG được gõ số: cả hai đều đi qua `rounded-md` (24), nên
 * đổi token một lần là hai thẻ đổi cùng nhau. Đó mới là thứ cần chung — không
 * phải cái component.
 */
export function AccountCard({
  className,
  disabled = false,
  label,
  leading,
  onPress,
  secondaryLabel,
  secondaryValue,
  trailing,
  value,
}: AccountCardProps) {
  const styles = accountCardStyles({ disabled });

  const lines: { key: string; label?: string; value: string }[] = [
    { key: 'primary', label, value },
  ];
  if (secondaryValue !== undefined) {
    lines.push({ key: 'secondary', label: secondaryLabel, value: secondaryValue });
  }

  /**
   * Cả thẻ đọc thành một câu. Để rời, trình đọc màn hình phát ra bốn mẩu —
   * "TK nguồn", "2611…", "Số dư", "123.456 VND" — và người dùng phải tự ghép
   * lại xem số nào của nhãn nào.
   */
  const spokenLabel = lines
    .map((line) => (line.label ? `${line.label} ${line.value}` : line.value))
    .join('. ');

  /**
   * ⛔ Ô trợ năng gom ở KHỐI GIỮA, thẻ ngoài `accessible={false}`: `Pressable`
   * mặc định `accessible` (RN đặt `accessible: accessible !== false`) mà phần tử
   * `accessible` gộp CẢ cây con thành MỘT ô ⇒ nút "Đổi" đặt qua khe `trailing`
   * hết đường lia tới bằng trình đọc màn hình. Gom nhãn vào một con `accessible`
   * như `Alert.tsx` thì `spokenLabel` vẫn đọc liền một câu, còn `leading` (logo)
   * và `trailing` thành ô rời. ⚠️ Vùng CHẠM vẫn là cả thẻ.
   */
  const body = (
    <>
      {leading}

      <View
        accessibilityLabel={spokenLabel}
        accessibilityRole={onPress ? 'button' : undefined}
        /** ⚠️ Trình đọc màn hình KHÔNG thấy màu — trạng thái khoá phải nói thành lời. */
        accessibilityState={{ disabled }}
        accessible
        className={styles.info()}
      >
        {lines.map((line) => (
          <View key={line.key} className={styles.line()}>
            {line.label ? <Text className={styles.label()}>{line.label}</Text> : null}
            <Text className={styles.value()}>{line.value}</Text>
          </View>
        ))}
      </View>

      {/**
       * ⛔ Mũi tên đi qua `<Icon>`, KHÔNG tự vẽ `<Path>` — luật của
       * `src/shared/ui/AGENTS.md`. `Icon` nhận `color` dạng TOKEN và tự tra bảng
       * màu theo chế độ sáng/tối, tức là đúng việc mà đoạn SVG viết tay trước
       * đây phải gọi `useThemeColors()` để làm lấy.
       *
       * ⚠️ Tên icon theo bộ của ngân hàng: mũi tên xuống là `arrow-down-small`,
       * không phải `chevron-down`.
       */}
      {trailing ??
        (onPress ? (
          <Icon color={disabled ? 'action-disabled-fg' : 'action-fg'} name="arrow-down-small" />
        ) : null)}
    </>
  );

  if (!onPress) return <View className={styles.root({ className })}>{body}</View>;

  return (
    <Pressable
      accessibilityState={{ disabled }}
      accessible={false}
      className={styles.root({ className })}
      disabled={disabled}
      onPress={onPress}
    >
      {body}
    </Pressable>
  );
}
