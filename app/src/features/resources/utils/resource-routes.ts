import type { Href } from 'expo-router';

/**
 * Href tới thư mục GỐC của kho (`resources/index.tsx`).
 *
 * ⚠️ Ép kiểu `as Href` CÓ CHỦ Ý, chỉ ở đây: kiểu route sinh vào `.expo/types/router.d.ts`
 * (typed routes) do dev server ghi lại liên tục, và với route gốc của thư mục có
 * `_layout` bản sinh đó lúc thì viết `/workspaces/[wsId]/resources`, lúc thì
 * `/workspaces/[wsId]/resources/index` — viết literal theo một dạng là `tsc` đỏ
 * ở dạng kia. Các route còn lại (`[folderId]`, `preview/[resourceId]`, `trash`)
 * không có nhập nhằng đó nên vẫn dùng literal có kiểm.
 */
export function resourcesRootHref(wsId: string): Href {
  // Qua `unknown`: literal `pathname` không có trong union của bản sinh "index" nên `as Href` trực tiếp bị TS2352.
  const href: unknown = { pathname: '/workspaces/[wsId]/resources', params: { wsId } };
  return href as Href;
}

/**
 * Href tới màn cấu hình đơn in của phân hệ Địa điểm & in ấn, mang sẵn tệp PDF từ kho (p6-05 app.md §1 — "In tài liệu").
 *
 * ⛔ Feature không import chéo nhau (`check:imports` chặn `@/features/o2o/...`) ⇒ điều hướng bằng ĐƯỜNG DẪN route, giữ
 * ĐÚNG pathname + tham số của `newOrderHref` bên o2o: `/me/o2o/print/new` với `resourceId` + `resourceName` (tên để màn
 * đích hiện ngay, khỏi chờ tải). Route bên đó đổi tên ⇒ typed routes làm `tsc` đỏ ở đây, không hỏng âm thầm.
 */
export function printOrderHref(resource: { id: string; name: string }): Href {
  return {
    pathname: '/me/o2o/print/new',
    params: { resourceId: resource.id, resourceName: resource.name },
  };
}
