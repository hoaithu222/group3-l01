import { tCommon } from '@/shared/utils/i18n';

import { Badge } from '../badge/Badge';
import type { BadgeSize } from '../badge/badge.styles';

/** Quá số này thì hiện `99+` (khớp mặc định của `Badge` và của số chưa đọc phía BE). */
const DEFAULT_MAX = 99;

export interface CountBadgeProps {
  /**
   * Ghi đè nhãn trợ năng. Mặc định "3 chưa đọc" (quá trần: "99+ chưa đọc"; `muted`: "3 chưa đọc, đã tắt thông báo").
   * Truyền khi chỗ dùng không phải "chưa đọc" (vd "5 lời mời").
   */
  accessibilityLabel?: string;
  className?: string;
  /** Số hiển thị. `≤ 0`, `NaN` ⇒ KHÔNG vẽ gì (không có gì chưa đọc thì không có huy hiệu). */
  count: number;
  /** Trần rút gọn: vượt thì hiện `${max}+`. Mặc định 99. */
  max?: number;
  /**
   * Cuộc trò chuyện/kênh đã TẮT thông báo: hiện CHẤM XÁM (không số, không đỏ) — vẫn báo "có tin mới" nhưng không giục. Nhãn trợ năng
   * vẫn nói đủ số ("3 chưa đọc, đã tắt thông báo") — màu xám không phải dấu hiệu duy nhất.
   */
  muted?: boolean;
  size?: BadgeSize;
  /** `count` (mặc định): chấm có số. `dot`: chỉ chấm — chỗ chật (tab, avatar) hoặc khi số không quan trọng. */
  variant?: 'count' | 'dot';
}

/**
 * Huy hiệu SỐ CHƯA ĐỌC — lớp mỏng trên `Badge` (p0-12) để mọi danh sách (hội thoại, kênh, hoạt động, tab) dùng CHUNG một quy
 * ước rút gọn ("99+"), nhãn trợ năng và cách hiện khi tắt thông báo, thay vì mỗi màn tự ghép chuỗi `${n} tin chưa đọc`.
 *
 * ```tsx
 * <CountBadge count={unread} />                    // ● 3   — nhãn "3 chưa đọc"
 * <CountBadge count={150} />                       // ● 99+ — nhãn "99+ chưa đọc"
 * <CountBadge count={unread} muted />               // ● xám — nhãn "3 chưa đọc, đã tắt thông báo"
 * <CountBadge count={unread} variant="dot" />      // ●
 * ```
 *
 * Gắn lên góc biểu tượng: bọc trong `BadgeAnchor` (`badge={<CountBadge … />}`). Huy hiệu KHÔNG bấm được (xem `Badge`).
 */
export function CountBadge({
  accessibilityLabel,
  className,
  count,
  max = DEFAULT_MAX,
  muted = false,
  size = 'sm',
  variant = 'count',
}: CountBadgeProps) {
  const value = Number.isFinite(count) ? Math.floor(count) : 0;
  if (value <= 0) return null;

  const text = value > max ? `${String(max)}+` : String(value);
  const label =
    accessibilityLabel ??
    tCommon(muted ? 'count.unreadMuted' : 'count.unread', { text });

  // Tắt thông báo hoặc xin chấm ⇒ chấm trơn. Tông: xám khi muted, đỏ (mặc định của `Badge` dạng chấm) khi còn kêu.
  if (muted || variant === 'dot') {
    return (
      <Badge
        accessibilityLabel={label}
        className={className}
        dot
        size={size}
        variant={muted ? 'disabled' : 'error'}
      />
    );
  }

  return (
    <Badge accessibilityLabel={label} className={className} count={value} maxCount={max} size={size} />
  );
}
