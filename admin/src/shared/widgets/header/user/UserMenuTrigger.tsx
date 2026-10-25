/**
 * UserMenuTrigger — khối danh tính ở mép phải thanh header.
 *
 * Bố cục: vạch accent │ avatar (chấm online) │ tên + vai trò │ caret
 *  - Khung dùng CHUNG ngôn ngữ với dãy nút icon đứng cạnh: viền mảnh + ngoặc
 *    góc ngoài + inner glow khi hover/mở (xem `user-menu.theme.ts`).
 *  - Vai trò render dạng micro-label VIẾT HOA giãn chữ thay cho pill `<Badge>`
 *    — trong thanh cao 30px, pill làm khối bị chật và phá nhịp chữ. Pill vẫn
 *    còn ở PANEL, nơi có đủ chỗ thở.
 *
 * ⚠️ HAI ĐIỀU KIỆN BẮT BUỘC để dùng làm trigger `asChild` của Radix:
 *  1. `forwardRef` — Slot cần clone ref xuống `<button>` thật.
 *  2. SPREAD `...rest` lên `<button>` — Radix bơm `onPointerDown` / `onKeyDown`
 *     / `aria-expanded` / `data-state` qua props. Không spread thì nút CHẾT,
 *     bấm không mở được dropdown.
 *
 * Trạng thái mở vì thế đọc từ `data-state` trong recipe, KHÔNG cần nâng state
 * lên React.
 */
import { forwardRef, memo } from 'react';
import type { ButtonHTMLAttributes } from 'react';

import { Avatar } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { cn } from '@/shared/utils/style/cn';

import { userMenuStyles } from './user-menu.theme';

interface UserMenuTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  displayName: string;
  /**
   * Dòng phụ dưới tên — VAI TRÒ, không phải email.
   *
   * ⛔ Đừng đổ email vào đây: `role` viết hoa + giãn chữ, một địa chỉ dài
   *    ("nguyen.van.a@congty.com.vn") ở dạng đó vừa khó đọc vừa chạm trần
   *    `max-w` ngay. Email đã có chỗ đứng đàng hoàng trong panel.
   */
  subLabel?: string | null;
  avatarSrc?: string;
}

const s = userMenuStyles();

const UserMenuTrigger = memo(
  forwardRef<HTMLButtonElement, UserMenuTriggerProps>(function UserMenuTrigger(
    { displayName, subLabel, avatarSrc, className, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        aria-label="Menu người dùng"
        // `className` tách riêng khỏi `...rest` rồi merge — nếu để nó lọt vào
        // spread, một `className: undefined` do Slot merge ra sẽ xoá sạch style.
        className={cn(s.trigger(), className)}
        type="button"
        // Spread SAU cùng: handler + aria/data-state của Radix phải thắng giá
        // trị mặc định ở trên, nếu không dropdown sẽ không mở.
        {...rest}
      >
        <span aria-hidden="true" className={s.accentBar()} />

        <span className={s.avatarWrap()}>
          {/* `shape="square"` để avatar không "đổi hình" giữa trigger vuông trên
              header và panel mở rộng bên dưới. `initialsCount={1}` vì ô chỉ
              rộng 20px — hai chữ cái ở cỡ đó dính vào nhau. */}
          <Avatar
            alt={displayName}
            className={s.avatar()}
            initialsCount={1}
            name={displayName}
            shape="square"
            size="sm"
            src={avatarSrc}
            variant="brand"
          />
          <span aria-hidden="true" className={s.status()} />
        </span>

        <span className={s.info()}>
          <span className={s.name()} title={displayName}>
            {displayName}
          </span>
          {subLabel && (
            <span className={s.role()} title={subLabel}>
              {subLabel}
            </span>
          )}
        </span>

        <SystemIcon className={s.caret()} name="angle-down-bold" size={14} />
      </button>
    );
  }),
);

export default UserMenuTrigger;
