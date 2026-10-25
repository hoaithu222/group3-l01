/**
 * UserMenu — avatar + menu tài khoản ở mép phải thanh header.
 *
 * ĐƠN TENANT: KHÔNG có chuyển tổ chức, dự án hay phòng ban.
 *
 * Trigger (ngoài): `<UserMenuTrigger />` — avatar + tên + vai trò, dùng chung
 * ngôn ngữ khung với dãy nút icon bên cạnh.
 *
 * Panel (mở rộng):
 *   1. Thẻ danh tính: avatar + tên + pill vai trò + email
 *   2. Mục tài khoản: hồ sơ · đổi mật khẩu
 *   3. Mục hiển thị:  sáng/tối (tuỳ chọn) · ẩn-hiện Dock · kiểu header
 *   4. Đăng xuất (tông nguy hiểm)
 * Danh sách mục + handler nằm trong `useUserMenuOptions.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * GENERIC — widget KHÔNG đọc store của app
 * ─────────────────────────────────────────────────────────────────────────
 * Danh tính và handler đi vào qua props để tầng `app/` tự nối với store của
 * nó; nhờ vậy widget không phụ thuộc `@/app/**` và tái dùng được ở showcase /
 * Storybook. Hai store CỤC BỘ CỦA WIDGET (kiểu header, chế độ Dock) thì đọc
 * thẳng — chúng chỉ giữ sở thích hiển thị, xem `useUserMenuOptions.ts`.
 *
 * ⚠️ ĐỔI SÁNG/TỐI: bản chuẩn đã gỡ nút rời khỏi thanh và chuyển vào menu này
 * ("4 nút icon cạnh nhau nhìn lặp và rối"). Ở base, mục đó CHỈ hiện khi nơi
 * gọi truyền đủ `theme` + `onThemeToggle` — mặc định không truyền thì menu y
 * hệt trước, `<ThemeToggle>` rời trên thanh vẫn là lối vào duy nhất. Khi
 * `Header.tsx` bơm hai prop này xuống thì nhớ quyết định luôn: giữ cả hai lối
 * vào là lặp, nên bỏ nút rời (`hideThemeToggle`) cho khớp bản chuẩn.
 */
import { memo, useCallback, useMemo } from 'react';

import { Avatar, Badge, Menu, Text, type MenuOption } from '@/shared/ui';

import UserMenuTrigger from './UserMenuTrigger';
import { useUserMenuOptions } from './useUserMenuOptions';
import { userMenuStyles } from './user-menu.theme';
import type { UserMenuKey } from './user-menu.constants';

export interface HeaderUser {
  displayName: string;
  email?: string | null;
  /** Vai trò hiển thị dưới tên (RBAC phẳng — 1 chuỗi là đủ). */
  role?: string | null;
  avatarUrl?: string;
}

interface UserMenuProps {
  user?: HeaderUser | null;
  onSelect?: (key: UserMenuKey) => void;
  /**
   * Chế độ màu đang bật. Truyền KÈM `onThemeToggle` thì menu mọc thêm mục đổi
   * sáng/tối; thiếu một trong hai → không có mục đó (mặc định an toàn).
   */
  theme?: 'light' | 'dark';
  onThemeToggle?: () => void;
}

const s = userMenuStyles();

const UserMenu = memo(function UserMenu({ user, onSelect, theme, onThemeToggle }: UserMenuProps) {
  const displayName = user?.displayName ?? 'Khách';
  const role = user?.role ?? null;

  const { options, handleSelect } = useUserMenuOptions({ theme, onThemeToggle, onSelect });

  const handleMenuSelect = useCallback(
    (option: MenuOption) => handleSelect(option.key as UserMenuKey),
    [handleSelect],
  );

  const header = useMemo(
    () => (
      <span className={s.panelHeader()}>
        {/* `shape="square"` để avatar không "đổi hình" giữa trigger vuông trên
            header và panel mở rộng bên dưới. */}
        <Avatar
          alt={displayName}
          name={displayName}
          shape="square"
          size="md"
          src={user?.avatarUrl}
          variant="brand"
        />
        <span className={s.panelIdentity()}>
          {/* `ellipsis` — email công ty / tên dài không được kéo phình panel. */}
          <Text ellipsis size="small" weight="medium">
            {displayName}
          </Text>
          {role && (
            <span className={s.panelRole()}>
              <Badge color="info" size="sm" variant="tinted">
                {role}
              </Badge>
            </span>
          )}
          {user?.email && (
            <Text ellipsis size="tiny" skin="muted">
              {user.email}
            </Text>
          )}
        </span>
      </span>
    ),
    [displayName, role, user?.email, user?.avatarUrl],
  );

  return (
    <Menu
      align="end"
      contentClassName={s.panel()}
      header={header}
      options={options}
      trigger={
        <UserMenuTrigger avatarSrc={user?.avatarUrl} displayName={displayName} subLabel={role} />
      }
      onSelect={handleMenuSelect}
    />
  );
});

export default UserMenu;
