import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, type View } from 'react-native';

import { type TooltipAnchor, type TooltipPlacement } from './tooltip-geometry.utils';
import { resolveTooltipLevel } from './tooltip.constants';
import { TooltipBubble } from './TooltipBubble';
import { useTooltipPosition } from './useTooltipPosition';

/**
 * Bong bóng chú thích cho CẤP 1–2 của thiết kế (nội dung ≤ 175 ký tự / 4 dòng).
 *
 * ⛔ Cấp 3 (> 5 dòng) và cấp 4 (nội dung HTML) KHÔNG dùng component này: cấp 3
 * mở `<TooltipSheet>`, cấp 4 điều hướng sang màn riêng. Xem
 * `resolveTooltipLevel()` / `isHtmlTooltipContent()` trong `tooltip.constants`.
 *
 * File này giữ phần LOGIC (đo phần tử kích hoạt, chọn cấp, tự đóng); phần vẽ
 * lớp phủ nằm ở `TooltipBubble.tsx` cùng thư mục.
 */

export interface TooltipProps {
  /** Đọc cho người dùng trình đọc màn hình biết bấm vào sẽ ra gì. */
  accessibilityHint?: string;
  /** Tự đóng sau ngần này mili-giây. Bỏ trống = không tự đóng. */
  autoHideMs?: number;
  /** Phần tử kích hoạt — bong bóng trỏ vào chính nó. */
  children: ReactNode;
  content: string;
  disabled?: boolean;
  /**
   * Gọi khi `content` rơi vào cấp 3 (quá dài cho bong bóng). Truyền hàm mở
   * `<TooltipSheet>` vào đây; không truyền thì vẫn hiện bong bóng, nhưng nó sẽ
   * cao hơn thiết kế cho phép.
   */
  onExceedsBubble?: () => void;
  placement?: TooltipPlacement;
}

export function Tooltip({
  accessibilityHint = 'Chạm để xem giải thích',
  autoHideMs,
  children,
  content,
  disabled = false,
  onExceedsBubble,
  placement = 'top',
}: TooltipProps) {
  const triggerRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<TooltipAnchor | null>(null);
  const { forgetSize, geometry, maxWidth, minWidth, onBubbleLayout } = useTooltipPosition(
    anchor,
    placement,
  );

  const level = useMemo(() => resolveTooltipLevel(content), [content]);

  const close = useCallback(() => {
    setAnchor(null);
    forgetSize();
  }, [forgetSize]);

  const open = useCallback(() => {
    if (level === 3 && onExceedsBubble) {
      onExceedsBubble();
      return;
    }

    /**
     * ⛔ Phải đo NGAY lúc bấm, không đo một lần rồi nhớ.
     *
     * Phần tử kích hoạt hầu như luôn nằm trong `ScrollView`: toạ độ của nó đổi
     * mỗi lần người dùng cuộn. Số đo cũ thì bong bóng trỏ vào khoảng không.
     */
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      forgetSize();
      setAnchor({ height, width, x, y });
    });
  }, [forgetSize, level, onExceedsBubble]);

  useEffect(() => {
    if (!anchor || !autoHideMs) return;
    const timer = setTimeout(close, autoHideMs);
    return () => clearTimeout(timer);
  }, [anchor, autoHideMs, close]);

  return (
    <>
      <Pressable
        ref={triggerRef}
        accessibilityHint={accessibilityHint}
        accessibilityRole="button"
        // ⛔ Thiếu `disabled` thì trình đọc màn hình vẫn xướng "nút, chạm hai lần
        // để kích hoạt" trên phần tử đã tắt — người dùng bấm mãi, tưởng app hỏng.
        accessibilityState={{ disabled, expanded: anchor !== null }}
        disabled={disabled}
        /**
         * Phần tử kích hoạt thường là một biểu tượng "?" 16–20dp, dưới xa ngưỡng
         * chạm 44dp. Không nới thì người dùng bấm ba lần mới trúng và họ kết
         * luận là app hỏng chứ không phải ngón tay mình.
         */
        hitSlop={12}
        onPress={open}
      >
        {children}
      </Pressable>

      <TooltipBubble
        content={content}
        geometry={geometry}
        maxWidth={maxWidth}
        minWidth={minWidth}
        visible={anchor !== null}
        onBubbleLayout={onBubbleLayout}
        onClose={close}
      />
    </>
  );
}
