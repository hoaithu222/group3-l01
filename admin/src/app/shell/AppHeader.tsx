import { memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { APP_NAME, PATHS } from '@/app/config';
import { useAuthStore, useThemeStore } from '@/app/store';
import { ChangePasswordModal } from '@/features/auth/components';
import { useSignOut } from '@/features/auth/hooks/useSignOut';
import { useDisclosure } from '@/shared/hooks';
import { CommandPaletteTrigger } from '@/shared/widgets/command-palette';
import Header, { HEADER_ICON_BUTTON_CLASS, RealtimeStatusIndicator } from '@/shared/widgets/header';
import type { UserMenuKey } from '@/shared/widgets/header';

/**
 * Nối `<Header>` (widget thuần) với store của app.
 *
 * Widget cố ý KHÔNG tự đọc store — nhờ vậy nó dùng lại được ở Storybook, ở
 * test, và ở dự án có hình dạng phiên khác. Mọi hiểu biết về "phiên đăng nhập
 * của app này" gom hết vào đây.
 */
const AppHeader = memo(function AppHeader() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const signOut = useSignOut();
  const changePassword = useDisclosure();

  const handleUserMenuSelect = useCallback(
    (key: UserMenuKey) => {
      if (key === 'logout') {
        // Điều hướng SAU khi phiên đã xoá — xem chú thích ở `useSignOut`.
        signOut();
        return;
      }
      if (key === 'change-password') {
        changePassword.open();
        return;
      }
      navigate(key === 'profile' ? PATHS.PROFILE : PATHS.SETTINGS);
    },
    [signOut, changePassword, navigate],
  );

  const { close: closeChangePassword, open: openChangePassword } = changePassword;
  const handleChangePasswordOpenChange = useCallback(
    (next: boolean) => (next ? openChangePassword() : closeChangePassword()),
    [openChangePassword, closeChangePassword],
  );

  return (
    <>
      <Header
        actions={
          <>
            <CommandPaletteTrigger className={HEADER_ICON_BUTTON_CLASS} />
            <RealtimeStatusIndicator />
          </>
        }
        brandLabel={APP_NAME}
        sticky={false}
        theme={theme}
        user={
          user
            ? { displayName: user.name, email: user.email, avatarUrl: user.avatar ?? undefined }
            : null
        }
        onThemeToggle={toggleTheme}
        onUserMenuSelect={handleUserMenuSelect}
      />
      <ChangePasswordModal
        open={changePassword.isOpen}
        onOpenChange={handleChangePasswordOpenChange}
      />
    </>
  );
});

export default AppHeader;
