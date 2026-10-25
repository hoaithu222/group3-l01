import { useMemo } from 'react';

import { useAuthStore } from '@/app/store';
import { useCapabilities } from '@/app/capabilities';
import { isFeatureFlagEnabled } from '../modules/feature-flag.utils';
import { MODULE_REGISTRY } from '../modules/module-registry';
import type { PermissionAction } from './permission.types';
import type { ModuleAudience, ModuleCommandAction, ModuleConfig } from '../modules/types';

/**
 * Suy vai đăng nhập (D-05) từ QUYỀN DỮ LIỆU của người dùng — không phải một
 * field lưu sẵn. `partner:view`/`recruiter:view` tới từ `permissions[]` do BE
 * gắn theo dữ liệu thật (là chủ `PrintShop`/`CompanyMember`), không phải theo
 * `roles[]` hệ thống — một tài khoản có thể vừa là nhân viên vận hành vừa là
 * chủ tiệm in.
 *
 * Thứ tự ưu tiên: `partner` → `recruiter` → `ops`. `admin`/`manager` (vai hệ
 * thống) luôn rơi về `ops` dù dữ liệu có gắn `recruiter:view` (vd admin hỗ trợ
 * vận hành có thể có quyền xem recruiter, nhưng KHÔNG coi họ là "vai recruiter"
 * để đổi hẳn bộ menu — họ vẫn cần thấy menu vận hành đầy đủ).
 */
export function resolveAudience(
  permissions: readonly string[] | undefined,
  roles: readonly string[] | undefined,
): ModuleAudience {
  const permissionSet = new Set(permissions ?? []);
  if (permissionSet.has('partner:view')) return 'partner';
  if (
    permissionSet.has('recruiter:view') &&
    !roles?.includes('admin') &&
    !roles?.includes('manager')
  ) {
    return 'recruiter';
  }
  return 'ops';
}

/**
 * Danh sách phân hệ người dùng hiện tại được phép thấy, đã sắp theo `order`.
 *
 * Dùng cho Dock, menu và trang `/modules`. Lọc ở ĐÚNG MỘT chỗ để menu và
 * `PermissionGuard` không bao giờ nói khác nhau — trước đây hai nơi tự lọc
 * riêng là nguồn của lỗi "thấy mục trong menu nhưng bấm vào thì 403".
 *
 * Ba lớp lọc, theo thứ tự rẻ → đắt: `enabled`/`hideInMenu` (tĩnh) → `audience`
 * (từ store, không cần mạng) → `featureFlag` (cần `capabilities` đã tải xong —
 * TRƯỚC khi tải xong, module có cờ vẫn hiện tạm để tránh menu giật/nhấp nháy
 * mỗi lần F5; route đích tự chặn bằng `FeatureGate` nếu cờ hoá ra đang tắt).
 */
export function useAccessibleModules(): ModuleConfig[] {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const user = useAuthStore((s) => s.user);
  const { data: caps } = useCapabilities();

  return useMemo(() => {
    if (!user) return [];
    const audience = resolveAudience(user.permissions, user.roles);
    return MODULE_REGISTRY.filter((m) => {
      if (m.enabled === false || m.hideInMenu) return false;
      if ((m.audience ?? 'ops') !== audience) return false;
      if (m.featureFlag && caps && !isFeatureFlagEnabled(caps.features, m.featureFlag)) return false;
      if (m.skipPermission) return true;
      const req = m.permission ?? { resource: m.id, action: 'view' as const };
      return hasPermission(req.resource, req.action ?? 'view');
    }).sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    // `user` nằm trong deps vì `hasPermission` đọc `user` qua getter của store —
    // bản thân nó có identity ổn định nên một mình nó không đủ để tính lại.
  }, [hasPermission, user, caps]);
}

/** Hành động ⌘K kèm phân hệ sở hữu — palette cần icon/tiêu đề phân hệ để hiển thị. */
export interface ModuleCommandEntry extends ModuleCommandAction {
  moduleId: string;
  moduleTitle: string;
  iconName: ModuleConfig['iconName'];
}

/**
 * Gom `commandPaletteActions` của các phân hệ NGƯỜI DÙNG ĐƯỢC THẤY (`modules` đã lọc bởi
 * `useAccessibleModules`), rồi lọc thêm theo quyền RIÊNG của từng hành động. Hàm thuần —
 * tách khỏi hook để kiểm thử không cần dựng store.
 */
export function collectCommandActions(
  modules: readonly ModuleConfig[],
  hasPermission: (resource: string, action: PermissionAction) => boolean,
): ModuleCommandEntry[] {
  return modules.flatMap((m) =>
    (m.commandPaletteActions ?? [])
      .filter(
        (a) => !a.permission || hasPermission(a.permission.resource, a.permission.action ?? 'view'),
      )
      .map((a) => ({ ...a, moduleId: m.id, moduleTitle: m.title, iconName: m.iconName })),
  );
}

/**
 * Hành động nhanh cho ⌘K — MỘT nguồn (registry), cùng bộ lọc phân hệ với Dock/menu nên
 * palette không bao giờ gợi ý hành động dẫn tới trang mà người dùng bị chặn (403).
 */
export function useModuleCommandActions(): ModuleCommandEntry[] {
  const modules = useAccessibleModules();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const user = useAuthStore((s) => s.user);

  return useMemo(
    () => collectCommandActions(modules, hasPermission),
    // `user` trong deps: `hasPermission` đọc `user` qua getter của store, identity của nó ổn định.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [modules, hasPermission, user],
  );
}
