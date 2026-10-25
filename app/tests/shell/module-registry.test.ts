import fs from 'node:fs';
import path from 'node:path';

import { HOME_MODULE, MODULE_REGISTRY } from '@/shell/navigation/module-registry';
import { BAR_MODULE_LIMIT } from '@/shell/navigation/types';

const APP_GROUP_DIR = path.join(__dirname, '..', '..', 'app', '(app)');

/**
 * Route cấp `(app)/` tên `name` tồn tại dưới dạng file `name.tsx` HOẶC thư mục `name/` CÓ `_layout.tsx`.
 *
 * ⛔ Thư mục KHÔNG có `_layout.tsx` (vd `activity/index.tsx` trơn) cho route tên `activity/index`, không phải `activity` —
 * `<Tabs.Screen name>` và `AppTabBar` không khớp được, tab biến mất im lặng. Chỉ `existsSync(thư mục)` là không đủ.
 */
function topLevelRouteExists(name: string): boolean {
  return (
    fs.existsSync(path.join(APP_GROUP_DIR, name, '_layout.tsx')) ||
    fs.existsSync(path.join(APP_GROUP_DIR, `${name}.tsx`))
  );
}

/** `'/messages/calls'` → có `app/(app)/messages/calls.tsx` hoặc `app/(app)/messages/calls/index.tsx`. */
function hrefHasRouteFile(href: string): boolean {
  const relative = href.replace(/^\//, '');
  if (relative === '') return fs.existsSync(path.join(APP_GROUP_DIR, 'index.tsx'));
  return (
    fs.existsSync(path.join(APP_GROUP_DIR, `${relative}.tsx`)) ||
    fs.existsSync(path.join(APP_GROUP_DIR, relative, 'index.tsx'))
  );
}

describe('MODULE_REGISTRY', () => {
  const barModules = MODULE_REGISTRY.filter((module) => module.placement === 'bar');

  it(`thanh tab có tối đa ${String(BAR_MODULE_LIMIT)} phân hệ chính (Trang chủ ở giữa không tính)`, () => {
    expect(barModules.length).toBeLessThanOrEqual(BAR_MODULE_LIMIT);
    // Nút Trang chủ không phải một phân hệ — không được lọt vào registry (sẽ bị đếm hai lần).
    expect(MODULE_REGISTRY.some((module) => module.id === HOME_MODULE.id)).toBe(false);
  });

  it('id không trùng, và `name` (route cấp (app)/) không trùng', () => {
    const ids = MODULE_REGISTRY.map((module) => module.id);
    expect(new Set(ids).size).toBe(ids.length);

    const names = MODULE_REGISTRY.flatMap((module) => (module.name ? [module.name] : []));
    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain(HOME_MODULE.name);
  });

  /**
   * ⛔ Bẫy đã ghi ở `types.ts`: `name` sai một ký tự thì `<Tabs.Screen name>` không khớp route nào —
   * tab hiện ra (Expo Router tự sinh) nhưng bấm không có gì, không lỗi nào báo.
   */
  it.each(MODULE_REGISTRY.flatMap((module) => (module.name ? [[module.id, module.name]] : [])))(
    'phân hệ %s: `name` "%s" có route cấp (app)/ tương ứng',
    (_id, name) => {
      expect(topLevelRouteExists(name as string)).toBe(true);
    },
  );

  it('phân hệ chính BẮT BUỘC có `name` (mới khai được `<Tabs.Screen>`)', () => {
    for (const module of barModules) {
      expect(module.name).toBeTruthy();
    }
  });

  it.each(MODULE_REGISTRY.map((module) => [module.id, module.href as string]))(
    'phân hệ %s: `href` "%s" có file route',
    (_id, href) => {
      expect(hrefHasRouteFile(href as string)).toBe(true);
    },
  );

  it('Trang chủ là route `index` — file route và `PATHS.HOME` cùng trỏ vào đó', () => {
    expect(HOME_MODULE.name).toBe('index');
    expect(HOME_MODULE.href).toBe('/');
    expect(hrefHasRouteFile(HOME_MODULE.href)).toBe(true);
  });

  it('phân hệ phụ nào cũng có mô tả (danh sách chọn phân hệ hiện dòng phụ dưới nhãn)', () => {
    for (const module of MODULE_REGISTRY.filter((entry) => entry.placement === 'menu')) {
      expect(module.description?.length ?? 0).toBeGreaterThan(0);
    }
  });
});
