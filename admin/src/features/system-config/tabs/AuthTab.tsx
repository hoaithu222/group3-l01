import { memo } from 'react';

import CapabilitiesPreview from '../components/CapabilitiesPreview';
import ConfigGroupList from '../components/ConfigGroupList';

/**
 * Tab "Xác thực" (p0-07 admin.md §2, p0-13) — cờ đăng nhập sinh trắc học và khoá ứng dụng
 * (khoá registry `auth`, tab `auth`). Form sinh từ metadata BE như tab "Giới hạn"; các field dùng
 * path lồng (`biometricLogin.enabled`, `appLock.enabled`, `appLock.lockAfterBackgroundSeconds`)
 * nên `config-form` đổi path chấm thành khoá phẳng khi dựng form và gửi lại object lồng khi lưu.
 * `capabilities.auth` là thứ app đọc sau khi lưu — mở "Capabilities hiện hành" để đối chiếu.
 */
const AuthTab = memo(function AuthTab() {
  return (
    <div className="flex flex-col gap-3">
      <ConfigGroupList tab="auth" tabLabel="xác thực" />
      <CapabilitiesPreview />
    </div>
  );
});

export default AuthTab;
