import { type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { tv } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';
import type { IconName } from '@/shared/ui/icon';

import { Alert } from '../alert/Alert';
import { IconTile } from '../icon-tile/IconTile';
import { BottomSheet } from './BottomSheet';
import { SheetActions } from './SheetActions';

export interface ConfirmSheetProps {
  /**
   * `row` (mặc định) chia đôi hàng nút. ⚠️ Nhãn nút chính dài hơn ~14 ký tự ("Rời và giao quyền") thì đặt `column`: nửa
   * bề ngang máy 360dp chỉ còn ~150dp, nhãn một dòng bị cắt thành "Rời và giao…".
   */
  actionsLayout?: 'column' | 'row';
  /** Nhãn nút phụ — mặc định "Huỷ". */
  cancelLabel?: string;
  /** Nội dung THÊM dưới mô tả (ô nhập lý do, ô gõ lại tên để xác nhận, danh sách ảnh hưởng…). */
  children?: ReactNode;
  confirmDisabled?: boolean;
  confirmLabel: string;
  description?: string;
  /** Lỗi từ máy chủ — hiện NGAY TRÊN hàng nút, tấm vẫn mở để người dùng thử lại. */
  error?: string | null;
  /** Ô biểu tượng lớn đầu tấm — nói "đây là việc gì" trước khi đọc chữ (`logout`, `delete`, `alert-warning`…). */
  icon?: IconName;
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  /** `danger` cho thao tác phá huỷ: ô biểu tượng đỏ, nút chính đỏ. */
  tone?: 'danger' | 'primary';
  visible: boolean;
}

const confirmSheet = tv(
  {
    slots: {
      hero: 'items-center gap-xs px-xs pb-2xs',
      icon: 'mb-2xs',
      title: 'text-center text-header-sm font-semibold text-fg-1',
      description: 'text-center text-body-md text-fg-2',
      extra: 'gap-sm pt-xs',
    },
  },
  { twMergeConfig },
);

/**
 * Tấm XÁC NHẬN một việc: ô biểu tượng · tiêu đề · mô tả CANH GIỮA, hàng nút [Huỷ | Xác nhận] ở đáy.
 *
 * ```tsx
 * <ConfirmSheet
 *   confirmLabel="Rời nhóm"
 *   description="Bạn sẽ không nhận tin nhắn mới của nhóm này nữa."
 *   icon="logout"
 *   loading={leave.isPending}
 *   title="Rời nhóm này?"
 *   tone="danger"
 *   visible={visible}
 *   onClose={onClose}
 *   onConfirm={() => leave.mutate()}
 * />
 * ```
 *
 * ── Vì sao có component này ─────────────────────────────────────────────────────────────────────────────────────
 * Trước đây mỗi feature tự dựng: `BottomSheet` thân `{null}` + tiêu đề trái + nút ✕ + hai nút tự ghép. Ba lỗi lặp lại:
 * thân rỗng vẫn giữ mốc cao 229dp (dải trắng thừa dưới hàng nút), hai `Button fullWidth` trần trong `flex-row` đẩy nút xác
 * nhận ra ngoài mép, và mỗi tấm một kiểu đặt lỗi. Ở đây: không tiêu đề của header ⇒ tấm tự hiện THANH KÉO (ghi chú thiết kế:
 * có ✕ thì tắt thanh kéo, không ✕ thì bật), và nút "Huỷ" là đường thoát rõ nhất.
 *
 * ⚠️ Tiêu đề mang `accessibilityRole="header"` — tấm không có hàng tiêu đề của `BottomSheet`, đây là mốc DUY NHẤT cho trình
 * đọc màn hình. ⚠️ Đang `loading` thì nút "Huỷ" bị khoá: huỷ giữa lúc yêu cầu đang bay là đóng tấm mà việc vẫn xảy ra.
 * ⛔ Cần chọn giữa NHIỀU phương án (không chỉ có/không) thì dùng `BottomSheet` + `SheetList`, đừng nhồi vào `children`.
 */
export function ConfirmSheet({
  actionsLayout = 'row',
  cancelLabel = 'Huỷ',
  children,
  confirmDisabled = false,
  confirmLabel,
  description,
  error,
  icon,
  loading = false,
  onClose,
  onConfirm,
  title,
  tone = 'primary',
  visible,
}: ConfirmSheetProps) {
  const styles = confirmSheet();

  return (
    <BottomSheet
      // Cùng lý do khoá nút "Huỷ": chạm nền mờ lúc yêu cầu đang bay cũng là đóng tấm mà việc vẫn xảy ra.
      dismissOnBackdrop={!loading}
      footer={
        <SheetActions
          layout={actionsLayout}
          primary={{
            disabled: confirmDisabled,
            label: confirmLabel,
            loading,
            onPress: onConfirm,
          }}
          secondary={{ disabled: loading, label: cancelLabel, onPress: onClose }}
          tone={tone}
        />
      }
      // Tấm xác nhận thường ngắn hơn mốc 229dp của "list thông tin" — giữ mốc đó là thừa một dải trắng dưới hàng nút.
      minHeight={0}
      visible={visible}
      onClose={onClose}
    >
      <View className={styles.hero()}>
        {icon ? (
          <View className={styles.icon()}>
            <IconTile name={icon} size="lg" tone={tone === 'danger' ? 'danger' : 'brand'} />
          </View>
        ) : null}
        <Text accessibilityRole="header" className={styles.title()}>
          {title}
        </Text>
        {description ? <Text className={styles.description()}>{description}</Text> : null}
      </View>

      {children ? <View className={styles.extra()}>{children}</View> : null}
      {error ? <Alert description={error} tone="error" /> : null}
    </BottomSheet>
  );
}
