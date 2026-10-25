import { type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { Button } from '@/shared/ui/button';

import { dialog, MAX_HEIGHT_RATIO } from './dialog.styles';
import { type DialogActionProps, type DialogVariant } from './dialog.types';
import { DialogIcon } from './DialogIcon';

/**
 * Hộp thoại giữa màn hình — thông báo, xác nhận, cảnh báo.
 *
 * ⚠️ Khác `BottomSheet`, và chọn nhầm là lỗi thiết kế hay gặp: hộp thoại CẮT
 * NGANG người dùng và bắt trả lời một câu hỏi ngắn ("Huỷ giao dịch này?"), nên
 * nội dung phải gói gọn trong vài dòng. Danh sách để chọn, biểu mẫu, hay khối
 * chữ dài thì dùng tấm trượt đáy — hộp thoại không cuộn được và không có chỗ.
 *
 * ── Số đo Figma (`element modal` 259:96111) ─────────────────────────────────
 *   bo 24 · đệm ngang 16 · đệm dọc 24 · cách nhau 16 giữa icon — chữ — nút
 *   tiêu đề 18/24 semibold · mô tả 14/20 · biểu tượng 48 · hai nút chia đôi,
 *   cách nhau 8, cao 48, bo tròn hết
 *   Chiều ngang: 343 trên khung 375 ⇒ đệm 16 mỗi bên (dựng bằng `px-4` ở lớp
 *   bọc chứ không phải bề rộng cứng, để máy màn to nhỏ đều đúng).
 *
 * ── ⛔ `supportedOrientations` ──────────────────────────────────────────────
 * `<Modal>` dựng một view controller RIÊNG trên iOS. Thiếu prop này thì nó rơi
 * về portrait và vì nằm trên cùng nên CẢ APP hết xoay chừng nào hộp thoại còn
 * mở. ESLint chặn cứng.
 *
 * Công thức class và trần chiều cao nằm ở `dialog.styles.ts`.
 */
export interface DialogProps {
  /**
   * Hướng xếp hai nút. `row` (mặc định) chia đôi hàng — đúng bản vẽ chính.
   * `column` xếp chồng full-width, nút CHÍNH ở trên: dùng khi nhãn dài, vì
   * `Button` cắt cụt nhãn ở một dòng.
   */
  actionsDirection?: 'row' | 'column';
  /** Nội dung phụ dưới phần mô tả — ví dụ dòng đếm ngược của tông `loading`. */
  children?: ReactNode;
  className?: string;
  /**
   * Mô tả. Nhận `ReactNode` để nhấn mạnh được một cụm giữa câu.
   * ⚠️ Chỉ truyền chuỗi hoặc `<Text>` con: nó nằm TRONG một `<Text>`, nhét
   * `<View>` vào là React Native ném lỗi lúc chạy.
   */
  description?: ReactNode;
  /** Bấm nền mờ để đóng. ⛔ Tắt khi hộp thoại BẮT BUỘC phải chọn một phương án. */
  dismissOnBackdrop?: boolean;
  /** Đè biểu tượng mặc định của `variant`. Bỏ trống thì lấy theo tông. */
  icon?: ReactNode;
  onClose: () => void;
  /** Nút chính, nằm bên PHẢI theo bản thiết kế. */
  primaryAction?: DialogActionProps;
  /** Nút phụ, nằm bên trái. Chỉ có nó thì nó chiếm hết bề ngang. */
  secondaryAction?: DialogActionProps;
  title: string;
  variant?: DialogVariant;
  visible: boolean;
}

export function Dialog({
  actionsDirection = 'row',
  children,
  className,
  description,
  dismissOnBackdrop = true,
  icon,
  primaryAction,
  secondaryAction,
  title,
  variant = 'default',
  visible,
  onClose,
}: DialogProps) {
  const styles = dialog({ actionsDirection });
  const window = useWindowDimensions();

  /**
   * Thứ tự vẽ ĐỔI theo hướng, không chỉ đổi `flexDirection`.
   *
   * Hàng ngang: phụ TRÁI – chính PHẢI (bản vẽ chính). Cột dọc: nút CHÍNH lên
   * TRÊN — mock của thiết kế vẽ vậy, và đó cũng là thứ tự đúng trên di động
   * (nút hay dùng nhất nằm gần ngón cái nhất... nhưng ở hộp thoại thì mắt đọc
   * từ trên xuống, nên hành động chính phải đọc được trước).
   * ⛔ Đừng chỉ đổi `flex-col`: giữ nguyên thứ tự thì cột có nút phụ ở trên,
   * ngược cả hai bản vẽ.
   */
  const secondary = secondaryAction ? (
    <View className={styles.action()}>
      <Button {...secondaryAction} fullWidth variant="secondary" />
    </View>
  ) : null;
  const primary = primaryAction ? (
    <View className={styles.action()}>
      <Button {...primaryAction} fullWidth variant="primary" />
    </View>
  ) : null;

  return (
    <Modal
      /* Hộp thoại KHÔNG kéo thả được nên hoạt ảnh có sẵn của React Native là
         đủ — và nó lo cả lượt hiện lẫn lượt tắt, khác `BottomSheet` phải tự
         giữ vị trí để cú vuốt bám theo ngón tay. */
      animationType="fade"
      statusBarTranslucent
      supportedOrientations={['portrait', 'landscape']}
      transparent
      visible={visible}
      /* Nút back cứng của Android. Thiếu thì bấm back không có gì xảy ra. */
      onRequestClose={onClose}
    >
      {/* ⛔ `accessibilityViewIsModal` đặt ở LỚP GỐC của nội dung modal, không
          phải ở thẻ hộp thoại. Đặt ở thẻ thì mọi phần tử ANH EM của nó — trong
          đó có nền mờ đóng được — bị ẩn khỏi trình đọc màn hình, và người dùng
          khiếm thị mất một đường thoát. */}
      <View accessibilityViewIsModal className={styles.root()}>
        {dismissOnBackdrop ? (
          <Pressable
            accessibilityLabel="Đóng"
            accessibilityRole="button"
            className={styles.backdrop()}
            onPress={onClose}
          />
        ) : (
          <View className={styles.backdrop()} />
        )}

        <View
          className={styles.card({ className })}
          style={{ maxHeight: window.height * MAX_HEIGHT_RATIO }}
        >
          <DialogIcon icon={icon} variant={variant} />

          {/* Chỉ phần CHỮ cuộn — biểu tượng và hai nút phải đứng yên, nếu không
              người dùng phải cuộn xuống mới thấy nút và nhiều người không cuộn. */}
          <ScrollView
            /* Mô tả ngắn (ca thường gặp nhất) thì nội dung không tràn — để nảy
               thì thẻ rung rinh lúc chạm, trông như lỗi. */
            bounces={false}
            className={styles.scrollBody()}
            contentContainerClassName={styles.body()}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          >
            <View className={styles.header()}>
              <Text accessibilityRole="header" className={styles.title()}>
                {title}
              </Text>
              {description ? <Text className={styles.description()}>{description}</Text> : null}
            </View>

            {children}
          </ScrollView>

          {primary || secondary ? (
            <View className={styles.actions()}>
              {actionsDirection === 'column' ? (
                <>
                  {primary}
                  {secondary}
                </>
              ) : (
                <>
                  {secondary}
                  {primary}
                </>
              )}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
