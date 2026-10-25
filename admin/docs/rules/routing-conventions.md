# Routing Conventions — Module Registry (CRITICAL)

> Nguồn thật: `src/app/router/modules/{module-registry.ts,types.ts,build-
> routes.tsx}`. File này chỉ tóm tắt luật — JSDoc trong `module-registry.ts`
> và `types.ts` là bản đầy đủ nhất, đọc thẳng đó khi cần chi tiết prop.

## Nguyên tắc: khai 1 chỗ, mọi thứ tự đồng bộ

`src/app/router/modules/module-registry.ts` là **nguồn khai báo DUY NHẤT**
cho mọi phân hệ (module). Route, menu Dock, breadcrumb, tiêu đề tab trình
duyệt và `PermissionGuard` đều **tự dựng** từ registry — KHÔNG có chỗ nào
khác cần sửa tay khi thêm 1 phân hệ mới.

## Thêm phân hệ mới — 2 bước, KHÔNG hơn

1. Tạo `src/app/router/modules/{id}.routes.tsx`, export 1 `ModuleConfig`
   (xem mẫu đầy đủ trong JSDoc đầu `module-registry.ts`, hoặc copy cấu trúc
   từ `demo.routes.tsx` có sẵn).
2. Import và thêm vào mảng `MODULE_REGISTRY` trong `module-registry.ts`.

KHÔNG tự sửa `build-routes.tsx`, Dock config, hay breadcrumb logic — tất cả
đọc từ `MODULE_REGISTRY`/`MODULE_BY_ID`/`MODULE_BY_PATH`/`MODULE_PATHS` được
sinh tự động từ registry.

## `ModuleConfig` — field hay dùng sai

| Field | Ý nghĩa | Lỗi hay gặp |
|---|---|---|
| `id` | kebab-case, cũng là `resource` mặc định khi check quyền | Đổi `id` sau khi đã có URL share ra ngoài → vỡ deep-link |
| `page.lazy` | `() => import('@/features/x/pages/XPage')` | Đường dẫn sai khiến lazy-load fail âm thầm — kiểm bằng cách vào thẳng URL |
| `page.exportName` | Chỉ cần khi page KHÔNG phải default export | Quên set khi page dùng named export → mount lỗi |
| `permission` | Mặc định `{ resource: id, action: 'view' }` | Không set gì thì mặc định ăn theo `id` — đổi `id` vô tình đổi luôn quyền yêu cầu |
| `skipPermission` | Bỏ qua check quyền, chỉ cần đăng nhập | CHỈ dùng cho trang không có dữ liệu riêng ai (showcase, settings chung) — **không copy sang phân hệ nghiệp vụ thật** |
| `tabTitles` + `defaultTab` | Tiêu đề tab con lấy từ `?tab=`/`:tab` | Khai tên tab Ở ĐÂY, KHÔNG import hằng số từ trong feature vào registry — registry được import khắp app, kéo code feature vào phá code-splitting |
| `routes[].path` | Nhận cả tương đối (`'add'`, `':id'`) lẫn tuyệt đối | Nhầm dạng khiến route ghép sai với `module.path` |
| `featureFlag` | Tên cờ trong `capabilities.features` (tắt ⇒ ẩn menu + trang "Chưa bật"). **Mảng ⇒ HIỆN khi BẤT KỲ cờ nào bật** (vd `integration`: `['integration','collab']`) — dùng khi một phân hệ gộp nhiều tính năng độc lập; khi đó MỖI TAB phải tự ẩn theo cờ riêng của nó (xem `IntegrationPage`), nếu không tab của cờ đang tắt vẫn mở được và gọi API bị BE chặn | Quên kiểm cờ ở cấp tab khi `featureFlag` là mảng; đọc `m.featureFlag` như chuỗi (dùng `isFeatureFlagEnabled` ở `app/router/modules/feature-flag.utils.ts`) |
| `badge` | Chấm số việc chờ ở Dock: SỐ ⇒ hiện nguyên số; CHUỖI ⇒ khoá bộ đếm trực tiếp (vd `'moderation-open'`) do `app/shell/useModuleBadges.ts` giải | Import hook/feature vào registry để lấy số — phá code-splitting; registry chỉ khai TÊN khoá, thêm nguồn đếm mới ở `useModuleBadges` (chạy khi mục đang hiện ở menu, tức đã qua quyền + cờ) |

## Chưa có page thật

Trỏ tạm `page: { lazy: placeholderPage }` (từ `module-defaults.ts`) —
**KHÔNG xoá entry khỏi registry** để giữ chỗ trong menu/Dock trong lúc chờ
implement.

## Phân hệ mẫu — `user`

Base từng có `demoModule` (`demo.routes.tsx`, `skipPermission: true` vì là
trang showcase không có dữ liệu riêng ai) làm bản mẫu tham chiếu khi tạo phân
hệ mới. Ở Super App, `demoModule` + `demo.routes.tsx` + `src/features/demo/`
**đã bị xoá** sau khi phân hệ `user` (`user.routes.tsx`) hoàn chỉnh và thay
được vai trò minh hoạ đó — copy cấu trúc `ModuleConfig` từ `user.routes.tsx`
(entry thường, có `permission` thật, KHÔNG `skipPermission`) khi tạo phân hệ
mới. Dự án khác dẫn xuất từ base gốc (chưa có phân hệ nghiệp vụ thật) có thể
vẫn còn `demo` — đừng để trang đó lẫn vào menu production khi đã có phân hệ
thay thế.

## Điều hướng trong code — theo `docs/rules/navigable-controls.md`

Dùng `MODULE_PATHS.<ID>` để dựng URL thay vì hardcode chuỗi path — đổi
`path` của 1 module chỉ sửa đúng entry của nó, mọi nơi dùng `MODULE_PATHS`
tự đi theo. Với tab nội bộ 1 phân hệ (`?tab=`), dùng `useNavHref()`
(`@/shared/hooks`) để giữ nguyên các param lọc khác khi đổi tab.

## Liên quan

`feature-structure.md` (cấu trúc thư mục `src/features/{id}/`) ·
`navigable-controls.md` (điều hướng phải là `<Link>` khi có URL đích) ·
`api-patterns.md` (`useQueryParams` cho state trên URL).
