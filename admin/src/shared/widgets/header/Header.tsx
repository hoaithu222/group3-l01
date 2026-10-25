/**
 * Header — thanh trên cùng của app.
 *
 * Bố cục (trái → phải):
 *   [⌐ sọc chéo] [Logo] │ [slot start của page]
 *                ⟨ slot TITLE — cụm tâm, page bơm `<PageHeader>` vào ⟩
 *   [slot end của page] │ [actions] [ThemeToggle] [UserMenu] [sọc chéo ¬]
 *
 * Ba slot của page là VÙNG RỖNG: page tự bơm nội dung bằng `<PageHeader>` qua
 * portal (xem `page-header/page-header-slots.tsx`). Trang không đăng ký gì thì
 * slot `:empty` → ẩn hoàn toàn.
 *
 * Trang trí (đều `pointer-events-none`, KHÔNG mang thông tin):
 *  - Sọc chéo hai đầu thanh, mask mờ dần vào giữa — ẩn dưới `md` và trên máy
 *    chạm, nơi hai đầu thanh là chỗ đông nhất.
 *  - Ngoặc góc ở CẢ 4 GÓC thanh.
 *  - Ray gradient đáy + quầng sáng mềm ở tâm ray.
 *
 * ⛔ CỤM TÂM: từ 1280px trở lên canh giữa TUYỆT ĐỐI (rời khỏi luồng flex, ghim
 *    `inset-y-0` nên không bao giờ cao hơn thanh); dưới mốc đó chạy TRONG LUỒNG
 *    và canh giữa nhờ bố cục 3 cột (`left`/`right` cùng `grow basis-0`). Xem
 *    variant `layout` trong `header.theme.ts`.
 *
 * GENERIC — Header KHÔNG đọc store nào của app. Danh tính user, đích của logo
 * và các nút phụ đều đi vào qua props; tầng `app/` nối với store của nó. Nhờ
 * vậy widget không phụ thuộc `@/app/**` và dùng lại được ở showcase. Ngoại lệ
 * DUY NHẤT là `useHeaderLayout()` — store CỤC BỘ của chính widget, giữ sở
 * thích hiển thị của người dùng (giống `useDockSettings` của Dock).
 *
 * ⚠️ Chiều cao thanh do `HEADER_HEIGHT_CLASS.height` quy định (RESPONSIVE
 *    44px → 56px ở `wide`). Mọi phép tính "100vh − header" phải dùng cùng bộ
 *    hằng đó — xem `@/shared/constants/layout`.
 */
import { memo } from 'react';
import type { ReactNode } from 'react';

import { HEADER_HEIGHT_CLASS } from '@/shared/constants/layout';
import { ThemeToggle } from '@/shared/ui';
import { cn } from '@/shared/utils/style/cn';

import { useHeaderLayout } from './header-layout.store';
import { headerStyles, HEADER_ICON_BUTTON_CLASS } from './header.theme';
import Logo from './nav/Logo';
import { useHeaderSlotRef } from './page-header/page-header-context';
import UserMenu from './user/UserMenu';
import type { HeaderUser } from './user/UserMenu';
import type { UserMenuKey } from './user/user-menu.constants';

export interface HeaderProps {
  /** Wordmark của app. */
  brandLabel?: string;
  /** Emblem trước wordmark — `<Image>` / `<SystemIcon>` do app truyền. */
  brandMark?: ReactNode;
  /** Đích của logo. Mặc định `/`. */
  homeHref?: string;
  /** Side-effect kèm theo khi click TRÁI vào logo (vd dọn state). */
  onHomeClick?: () => void;
  /** Danh tính user cho `<UserMenu>`. Bỏ trống → hiện "Khách". */
  user?: HeaderUser | null;
  onUserMenuSelect?: (key: UserMenuKey) => void;
  /** Nút icon toàn cục thêm vào trước ThemeToggle (thông báo, chat…). */
  actions?: ReactNode;
  /**
   * Chế độ sáng/tối hiện tại + hành động lật.
   *
   * Thiếu MỘT trong hai thì nút đổi theme KHÔNG render — Header là widget thuần,
   * nó không có chỗ nào để giữ trạng thái này. Tầng `app/shell` nối vào store
   * (xem `AppHeader.tsx`).
   */
  theme?: 'light' | 'dark';
  onThemeToggle?: () => void;
  /** Ẩn nút đổi theme dù đã truyền `theme`/`onThemeToggle`. */
  hideThemeToggle?: boolean;
  /** `true` khi layout ngoài có cuộn — layout `h-dvh` không cần. */
  sticky?: boolean;
  className?: string;
}

const s = headerStyles();

const Header = memo(function Header({
  brandLabel,
  brandMark,
  homeHref = '/',
  onHomeClick,
  user,
  onUserMenuSelect,
  actions,
  theme,
  onThemeToggle,
  hideThemeToggle = false,
  sticky = false,
  className,
}: HeaderProps) {
  // Kiểu bố cục cụm tâm do người dùng chọn, lưu localStorage.
  const headerLayout = useHeaderLayout();

  // Đích portal cho `<PageHeader>` — ref callback có identity ỔN ĐỊNH, nếu
  // không React sẽ detach → attach → set state → vòng lặp vô tận.
  const startSlotRef = useHeaderSlotRef('start');
  const titleSlotRef = useHeaderSlotRef('title');
  const endSlotRef = useHeaderSlotRef('end');

  return (
    <header
      className={cn(s.root(), HEADER_HEIGHT_CLASS.height, sticky && 'sticky top-0 z-50', className)}
    >
      {/* ── Sọc chéo trang trí hai đầu thanh ─────────────────────── */}
      <span aria-hidden="true" className={s.hatch({ at: 'tl' })} />
      <span aria-hidden="true" className={s.hatch({ at: 'tr' })} />

      {/* ── Ngoặc góc — 4 góc thanh ──────────────────────────────── */}
      <span aria-hidden="true" className={s.corner({ at: 'tl' })} />
      <span aria-hidden="true" className={s.corner({ at: 'tr' })} />
      <span aria-hidden="true" className={s.corner({ at: 'bl' })} />
      <span aria-hidden="true" className={s.corner({ at: 'br' })} />

      {/* ── Ray gradient đáy + quầng sáng tâm ────────────────────── */}
      <span aria-hidden="true" className={s.rail()} />
      <span aria-hidden="true" className={s.railGlow()} />

      {/* ── Trái: brand + slot start của page ───────────────────── */}
      <div className={s.left()}>
        <Logo href={homeHref} label={brandLabel} mark={brandMark} onClick={onHomeClick} />
        <div ref={startSlotRef} className={s.pageSlot()} />
      </div>

      {/* ── Tâm: bảng tên module (portal) ─────────────────────────
          Node này LUÔN đứng nguyên vị trí trong cây; đổi kiểu bố cục chỉ đổi
          class. Di chuyển node giữa hai nhánh JSX là ref callback detach →
          attach lệch thứ tự và xoá nhầm node mới → tiêu đề biến mất. */}
      <div ref={titleSlotRef} className={s.center({ layout: headerLayout })} />

      {/* ── Phải: slot end của page + cụm icon toàn cục ─────────── */}
      <div className={s.right()}>
        <div ref={endSlotRef} className={s.pageSlot()} />

        {actions && (
          <>
            <span aria-hidden="true" className={s.tick()} />
            {actions}
          </>
        )}

        {!hideThemeToggle && theme && onThemeToggle && (
          <>
            <span aria-hidden="true" className={s.tick()} />
            {/* Dùng chung `HEADER_ICON_BUTTON_CLASS` để khung + cỡ + hover
                giống hệt mọi nút icon khác của thanh. */}
            <ThemeToggle
              className={HEADER_ICON_BUTTON_CLASS}
              theme={theme}
              onToggle={onThemeToggle}
            />
          </>
        )}

        <span aria-hidden="true" className={s.tick()} />
        <UserMenu user={user} onSelect={onUserMenuSelect} />
      </div>
    </header>
  );
});

export default Header;
