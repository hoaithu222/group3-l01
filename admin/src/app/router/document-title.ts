/**
 * document-title — NGUỒN DUY NHẤT cho tên tab trình duyệt (`document.title`).
 *
 * Bài toán: mọi tab đều mang đúng một tên lấy từ `index.html`, nên mở song song
 * vài phân hệ là không phân biệt nổi tab nào là tab nào.
 *
 * Cách giải:
 *  - Tên tab lấy TỪ REGISTRY, không khai lại ở đâu khác. Thêm / đổi phân hệ
 *    trong `{id}.routes.tsx` là tab tự đúng theo.
 *  - Ưu tiên `tabTitle` (tên đầy đủ) rồi mới tới `title` (tên ngắn cho Dock —
 *    chỗ đó `truncate` nên không thể dài).
 *  - Route KHÔNG thuộc registry (đăng nhập, 404…) khai trong
 *    `STATIC_ROUTE_TITLES` ngay dưới đây.
 *  - TAB NỘI BỘ của phân hệ (chip trên PageHeader) khai trong
 *    `ModuleConfig.tabTitles`. Bấm tab → URL đổi `?tab=` (hoặc path param
 *    `:tab`) → tab trình duyệt đổi theo.
 *
 * Thứ tự chữ trong tab: PHÂN HỆ ĐỨNG TRƯỚC màn con — tab trình duyệt bị bóp
 * còn ~12-15 ký tự khi mở nhiều tab, nên phần sống sót phải là tên phân hệ.
 *
 * Consumer duy nhất: `DocumentTitleSync` (mount ở root router).
 */

import { matchRoutes } from 'react-router-dom';

import { APP_NAME, PATHS as STATIC_PATHS } from '../config';

import { MODULE_REGISTRY } from './modules/module-registry';
import type { ModuleConfig, ModuleRouteDef } from './modules/types';

/**
 * Tên sản phẩm — đuôi cố định của mọi tab.
 *
 * Lấy từ `APP_NAME` chứ KHÔNG viết cứng: đổi tên app phải sửa đúng một chỗ,
 * và base không được mang tên thương hiệu của dự án nào.
 */
export const APP_TITLE = APP_NAME;

/** Ngăn giữa tên phân hệ và tên màn con. */
export const TITLE_SEPARATOR = ' · ';

/** Ngăn giữa phần nội dung và tên sản phẩm. */
export const APP_SEPARATOR = ' | ';

/**
 * Tên tab khi pathname không khớp route nào (URL lạ, trước lúc redirect /404).
 * ⚠️ Giữ khớp với thẻ `<title>` trong `index.html`.
 */
export const DEFAULT_DOCUMENT_TITLE = APP_NAME;

/**
 * Tên tab cho route NGOÀI `MODULE_REGISTRY`.
 *
 * Key phải là path TUYỆT ĐỐI và trùng đúng path đã mount trong `routes.tsx`
 * — khớp bằng `matchRoutes`, nên segment động (`/user/:id`) phải viết y hệt
 * lúc khai route.
 */
export const STATIC_ROUTE_TITLES: Readonly<Record<string, string>> = {
  // ── Khách ──────────────────────────────────────────────────────────────
  [STATIC_PATHS.LOGIN]: 'Đăng nhập',
  [STATIC_PATHS.REGISTER]: 'Đăng ký',
  [STATIC_PATHS.FORGOT_PASSWORD]: 'Quên mật khẩu',
  [STATIC_PATHS.RESET_PASSWORD]: 'Đặt lại mật khẩu',

  // ── Cá nhân / điều hướng chung ─────────────────────────────────────────
  [STATIC_PATHS.PROFILE]: 'Thông tin cá nhân',
  [STATIC_PATHS.SETTINGS]: 'Cài đặt',
  [STATIC_PATHS.CHANGE_PASSWORD]: 'Đổi mật khẩu',

  // ── Dự phòng ───────────────────────────────────────────────────────────
  [STATIC_PATHS.NOT_FOUND]: 'Không tìm thấy trang',
  [STATIC_PATHS.FORBIDDEN]: 'Không có quyền truy cập',
};

/** Tên param mang tab nội bộ — khớp `tabKey` mặc định của `useQueryParams`. */
const TAB_PARAM = 'tab';

/** Một dòng trong bảng tra cứu path → tên tab. */
interface TitleEntry {
  /** Path tuyệt đối (có thể chứa segment động `:id`). */
  path: string;
  /** Đứng TRƯỚC: tên phân hệ — hoặc tên trang với route tĩnh. */
  primary: string;
  /** Đứng SAU: tên màn con trong phân hệ. */
  secondary?: string;
  /** Phân hệ chứa route — để tra `tabTitles` / `defaultTab`. Route tĩnh: bỏ trống. */
  module?: ModuleConfig;
}

/** Tên tab của phân hệ — `tabTitle` ưu tiên hơn `title` (tên ngắn cho Dock). */
export function getModuleTabTitle(module: ModuleConfig): string {
  return module.tabTitle ?? module.title;
}

/** Tên tab của sub-route. */
function getRouteTabTitle(route: ModuleRouteDef): string {
  return route.tabTitle ?? route.title;
}

/** Ghép path con vào path cha — cùng quy tắc với `build-routes.tsx`. */
function joinPath(parentPath: string, childPath: string): string {
  return childPath.startsWith('/') ? childPath : `${parentPath.replace(/\/$/, '')}/${childPath}`;
}

/** Trải 1 module (root + toàn bộ sub-route lồng nhau) thành các dòng tra cứu. */
function collectModuleEntries(module: ModuleConfig): TitleEntry[] {
  const primary = getModuleTabTitle(module);
  const entries: TitleEntry[] = [{ path: module.path, primary, module }];

  const walk = (parentPath: string, routes: ModuleRouteDef[] | undefined) => {
    for (const route of routes ?? []) {
      const fullPath = joinPath(parentPath, route.path);
      entries.push({ path: fullPath, primary, secondary: getRouteTabTitle(route), module });
      walk(fullPath, route.children);
    }
  };
  walk(module.path, module.routes);

  return entries;
}

/**
 * Bảng tra cứu phẳng — dựng MỘT LẦN lúc import.
 *
 * Bỏ module `enabled === false` cho khớp `buildModuleRoutes()`: path đó không
 * tồn tại trong cây route nên cũng không được có tên tab.
 */
const TITLE_ENTRIES: readonly TitleEntry[] = [
  ...Object.entries(STATIC_ROUTE_TITLES).map(([path, primary]) => ({ path, primary })),
  ...MODULE_REGISTRY.filter((m) => m.enabled !== false).flatMap(collectModuleEntries),
];

/**
 * `matchRoutes` cần `RouteObject[]`; giữ mảng path riêng + Map tra ngược để
 * khỏi ép kiểu `TitleEntry` thành `RouteObject`.
 *
 * Dùng `matchRoutes` chứ KHÔNG tự so chuỗi: nó xếp hạng đúng luật React Router
 * (segment tĩnh thắng segment động), nên `/user/settings` thắng `/user`,
 * và `/report/summary` thắng `/report/:id`.
 */
const MATCH_ROUTES = TITLE_ENTRIES.map((e) => ({ path: e.path }));
const ENTRY_BY_PATH = new Map(TITLE_ENTRIES.map((e) => [e.path, e]));

/**
 * Fallback khi không dòng nào khớp: URL sâu hơn mọi sub-route đã khai
 * (vd `/documents/a/b/c`) vẫn phải hiện đúng tên phân hệ.
 *
 * Chặn biên bằng "/" để `/user` không nuốt `/user-group`, và path DÀI NHẤT
 * thắng.
 */
function findModuleByPrefix(pathname: string): ModuleConfig | undefined {
  const matches = MODULE_REGISTRY.filter(
    (m) => m.enabled !== false && (pathname === m.path || pathname.startsWith(m.path + '/')),
  );
  if (!matches.length) return undefined;
  matches.sort((a, b) => b.path.length - a.path.length);
  return matches[0];
}

/** Ghép `Phân hệ · Màn con | Tên app` — bỏ vế trùng để không lặp chữ. */
function composeTitle(primary: string, secondary?: string): string {
  const head = secondary && secondary !== primary ? primary + TITLE_SEPARATOR + secondary : primary;
  return head + APP_SEPARATOR + APP_TITLE;
}

/**
 * Tên tab NỘI BỘ đang mở của phân hệ.
 *
 * Thứ tự nguồn — khớp đúng cách từng phân hệ lưu tab:
 *  1. `params.tab` — path param (vd `/report/:id/:tab`)
 *  2. `?tab=` — query param, cách phổ biến nhất (xem `useQueryParams`)
 *  3. `module.defaultTab` — CHỈ ở root của phân hệ (`atModuleRoot`)
 *
 * ⛔ `defaultTab` KHÔNG được áp cho sub-route. Sub-route là TRANG KHÁC, không
 * phải tab: `/report/settings` mà lấy `defaultTab = "summary"` thì tên tab
 * thành "Báo cáo · Tổng quan", đè mất tên thật là "Cài đặt".
 * Tab khai tường minh (path/query) thì vẫn thắng, kể cả trên sub-route — đó
 * đúng là ca path param `/report/:id/:tab`.
 *
 * Trả `undefined` khi phân hệ không khai `tabTitles`, hoặc tab đang mở không
 * có trong bảng (key lạ do user sửa URL) → giữ nguyên tên sub-route.
 */
function resolveTabTitle(
  module: ModuleConfig | undefined,
  params: Readonly<Record<string, string | undefined>>,
  search: string,
  atModuleRoot: boolean,
): string | undefined {
  const tabTitles = module?.tabTitles;
  if (!tabTitles) return undefined;

  const fromPath = params[TAB_PARAM];
  const fromQuery = search ? new URLSearchParams(search).get(TAB_PARAM) : null;
  const key = fromPath ?? fromQuery ?? (atModuleRoot ? module?.defaultTab : undefined);

  return key ? tabTitles[key] : undefined;
}

/**
 * Tên tab trình duyệt cho một pathname.
 *
 * @param search Query string của URL (`location.search`) — để đọc `?tab=`.
 *
 * @example
 * resolveDocumentTitle('/user');                       // 'Người dùng | Base App'
 * resolveDocumentTitle('/user/12/edit');               // 'Người dùng · Sửa thông tin | Base App'
 * resolveDocumentTitle('/report', '?tab=summary');      // 'Báo cáo · Tổng quan | Base App'
 * resolveDocumentTitle('/khong-ton-tai');               // 'Base App'
 */
export function resolveDocumentTitle(pathname: string, search = ''): string {
  const matched = matchRoutes(MATCH_ROUTES, pathname);
  const last = matched?.[matched.length - 1];
  const entry = last?.route.path ? ENTRY_BY_PATH.get(last.route.path) : undefined;

  if (entry) {
    // Tab nội bộ cụ thể hơn sub-route → THAY THẾ, không ghép thành 3 tầng
    // ("Người dùng · Chi tiết · Quyền" vừa dài vừa bị tab bóp mất).
    //
    // `secondary` rỗng ⟺ đang ở root phân hệ (`collectModuleEntries` chỉ bỏ
    // trống `secondary` cho đúng entry root) → chỉ chỗ đó mới xét `defaultTab`.
    const tabTitle = resolveTabTitle(
      entry.module,
      last?.params ?? {},
      search,
      entry.secondary === undefined,
    );
    return composeTitle(entry.primary, tabTitle ?? entry.secondary);
  }

  const module = findModuleByPrefix(pathname);
  if (module) {
    // URL sâu hơn mọi sub-route đã khai → coi như đang ở trong phân hệ, không
    // phải root, nên KHÔNG áp `defaultTab`.
    const tabTitle = resolveTabTitle(module, {}, search, false);
    return composeTitle(getModuleTabTitle(module), tabTitle);
  }

  return DEFAULT_DOCUMENT_TITLE;
}
