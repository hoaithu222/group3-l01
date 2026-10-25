/**
 * PageHeaderBack — nút QUAY LẠI của page, ghim ở mép trái thanh header.
 *
 * Chỉ là `PageHeaderChip` icon-only: cùng hình khối, cùng màu, cùng chiều cao
 * với chip tab — không có style riêng nào ở đây, và đó là chủ ý.
 *
 * `side="end"` (nghiêng SANG TRÁI) tuy nút đứng bên trái: chip phải đổ RA
 * NGOÀI, đúng hướng nó đưa user đi. Dùng `start` là chip nghiêng vào tiêu đề,
 * đọc thành "đi tới" — ngược nghĩa. ĐÓ LÀ MẶC ĐỊNH.
 *
 * ⚠️ `side` VẪN CHO PHÉP ĐỔI vì lập luận trên chỉ đúng khi nút này đứng MỘT
 *    MÌNH ở mép trái. Trang nào ghim thêm chip vào slot `start` ngay cạnh nó thì
 *    hai khối nghiêng ngược chiều nhau, khe ở giữa hở thành hình nêm "V" — lúc
 *    đó tính liền mạch của cả cụm thắng ngữ nghĩa "đổ ra ngoài". Đổi ở
 *    CALL-SITE, đừng đổi mặc định ở đây.
 *
 * `anchor="center"` — KHÔNG dính đáy thanh. Dải tab dính đáy là các control
 * THUỘC trang đang mở; nút này thì ĐƯA USER RỜI trang, nên nó đứng cùng hàng
 * canh giữa với logo · nút icon vế phải. Xếp nó vào dải tab là đọc ra như một
 * tab nữa của chính trang này.
 *
 * ⛔ Truyền `href` bất cứ khi nào đích là một PATH CỐ ĐỊNH — chỉ khi đó chuột
 *    phải / Ctrl+click mới mở được tab mới (`navigable-controls.md`). Dùng
 *    `navigate(-1)` thì KHÔNG có href: lịch sử không phải URL.
 */
import { memo } from 'react';

import PageHeaderChip from './PageHeaderChip';
import type { PageHeaderChipAnchor, PageHeaderChipSide } from './PageHeaderChip';

export interface PageHeaderBackProps {
  onBack: () => void;
  /** Tooltip + `aria-label` — mặc định "Quay lại". */
  label?: string;
  /** Hướng nghiêng — mặc định `end` (đổ RA NGOÀI). Xem chú thích ⚠️ đầu file. */
  side?: PageHeaderChipSide;
  /** Path cố định — có thì chip thành `<Link>` thật. */
  href?: string;
  /**
   * Neo dọc — mặc định `center`. Đổi sang `bottom` khi trang đưa CẢ CỤM control
   * xuống dải đáy cùng dải tab: lúc ấy để riêng nút quay lại ở hàng giữa là nó
   * lơ lửng một mình, đọc ra như bị lệch hàng.
   */
  anchor?: PageHeaderChipAnchor;
  /** Bé hơn một bậc về BỀ NGANG — dùng khi cả cụm control của trang cũng compact. */
  compact?: boolean;
}

function PageHeaderBack({
  onBack,
  label = 'Quay lại',
  side = 'end',
  href,
  anchor = 'center',
  compact = false,
}: PageHeaderBackProps) {
  return (
    <PageHeaderChip
      anchor={anchor}
      compact={compact}
      href={href}
      icon="angle-left-outline"
      side={side}
      tooltip={label}
      onSelect={onBack}
    />
  );
}

export default memo(PageHeaderBack);
