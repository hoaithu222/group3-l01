import { Text, View } from 'react-native';
import { tv } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

import { Button } from '../button/Button';
import type { ButtonVariant } from '../button/button.styles';
import type { IconName } from '@/shared/ui/icon';

/**
 * ⚠️ Nhận DỮ LIỆU chứ không nhận `ReactNode` — cùng lý do `DialogActionProps`: hai nút của vùng đáy phải CHIA ĐÔI bề
 * ngang, cùng cỡ, đúng thứ tự; để mỗi nơi tự ghép `<Button>` là mỗi tấm ra một dáng (đã đo được: 8 tấm đặt hai
 * `Button fullWidth` trần vào `flex-row` ⇒ hai khối `width: 100%` không co (`flexShrink` của RN mặc định 0) ⇒ nút thứ hai —
 * chính là nút XÁC NHẬN — bị đẩy ra ngoài mép tấm và bị `overflow-hidden` cắt mất).
 */
export interface SheetAction {
  /** Nhãn đọc cho trình đọc màn hình khi nhãn nhìn thấy chưa đủ nghĩa (vd "Xoá 3 thẻ đã chọn"). */
  accessibilityLabel?: string;
  disabled?: boolean;
  iconLeft?: IconName;
  label: string;
  /** Khoá nút + vòng quay (gửi yêu cầu mạng). ⚠️ Nút còn lại nên `disabled` cùng lúc để không huỷ giữa chừng. */
  loading?: boolean;
  onPress: () => void;
}

export interface SheetActionsProps {
  /** Dòng ghi chú nhỏ NGAY TRÊN hàng nút (vd "Thao tác này không hoàn tác được") — thay cho chữ đỏ rải trong thân tấm. */
  hint?: string;
  /** `row` (mặc định) chia đôi bề ngang. `column` khi nhãn dài (> ~16 ký tự) hoặc có 3 nút — nút CHÍNH lên trên. */
  layout?: 'column' | 'row';
  /** Nút CHÍNH — bên PHẢI ở hàng ngang (gần ngón cái), TRÊN CÙNG ở cột dọc. */
  primary: SheetAction;
  /** Nút PHỤ (Huỷ · Quay lại · Để sau) — bên TRÁI / bên dưới. Bỏ trống thì nút chính chiếm trọn hàng. */
  secondary?: SheetAction;
  /** `danger` cho thao tác phá huỷ (xoá, rời nhóm, kết thúc cho mọi người): nút chính nền đỏ, nút phụ viền mực. */
  tone?: 'danger' | 'primary';
}

const sheetActions = tv(
  {
    slots: {
      root: 'w-full gap-sm',
      row: 'w-full flex-row gap-sm',
      // ⛔ `flex-1` CHỈ ở hàng ngang. Ở cột dọc, cha cao-theo-nội-dung + con `flexBasis: 0` là nút sập về 0dp.
      action: 'flex-1',
      hint: 'text-center text-caption-lg text-fg-2',
    },
    variants: {
      layout: {
        column: { row: 'flex-col', action: 'w-full flex-none' },
        row: {},
      },
    },
    defaultVariants: { layout: 'row' },
  },
  { twMergeConfig },
);

/**
 * Hàng nút ở ĐÁY tấm trượt — đặt vào prop `footer` của `BottomSheet` (đứng yên, không cuộn theo nội dung).
 *
 * ```tsx
 * <BottomSheet
 *   footer={
 *     <SheetActions
 *       primary={{ label: 'Rời nhóm', loading, onPress: leave }}
 *       secondary={{ label: 'Huỷ', onPress: onClose }}
 *       tone="danger"
 *     />
 *   }
 *   …
 * />
 * ```
 *
 * Thứ tự theo `Dialog` của bộ chung: hàng ngang PHỤ trái – CHÍNH phải; cột dọc CHÍNH trên – PHỤ dưới.
 * Tấm chỉ để XÁC NHẬN một việc (tiêu đề + mô tả + hai nút) thì dùng thẳng `ConfirmSheet`.
 */
export function SheetActions({
  hint,
  layout = 'row',
  primary,
  secondary,
  tone = 'primary',
}: SheetActionsProps) {
  const styles = sheetActions({ layout });
  const primaryVariant: ButtonVariant = tone === 'danger' ? 'danger' : 'primary';
  /* Cạnh nút đỏ, nút phụ viền MỰC (trung tính) để nút đỏ là điểm nhấn duy nhất; cạnh nút thương hiệu thì viền thương hiệu. */
  const secondaryVariant: ButtonVariant = tone === 'danger' ? 'neutral-secondary' : 'secondary';

  const primaryNode = (
    <View key="primary" className={styles.action()}>
      <Button {...primary} fullWidth variant={primaryVariant} />
    </View>
  );
  const secondaryNode = secondary ? (
    <View key="secondary" className={styles.action()}>
      <Button {...secondary} fullWidth variant={secondaryVariant} />
    </View>
  ) : null;

  return (
    <View className={styles.root()}>
      {hint ? <Text className={styles.hint()}>{hint}</Text> : null}
      <View className={styles.row()}>
        {layout === 'column' ? [primaryNode, secondaryNode] : [secondaryNode, primaryNode]}
      </View>
    </View>
  );
}
