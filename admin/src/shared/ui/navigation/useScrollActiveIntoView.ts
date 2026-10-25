import { useEffect, type RefObject } from 'react';

/**
 * Cuộn NGANG một dải `overflow-x-auto` sao cho phần tử đang "active" của nó nằm trọn trong khung nhìn.
 *
 * ⛔ Tự cộng `scrollLeft` chứ KHÔNG gọi `element.scrollIntoView()`: `scrollIntoView` còn cuộn cả các tổ
 * tiên theo chiều DỌC, nên mở một trang có `?tab=…` mà cả trang nhảy theo tab là lỗi. Ở đây chỉ đúng dải
 * tab dịch ngang, và chỉ dịch khi tab active đang thò ra ngoài (nằm trọn trong khung thì đứng yên).
 *
 * Yêu cầu: dải phải là `position: relative` — `offsetLeft` của phần tử active tính từ nó.
 *
 * @param listRef  dải cuộn.
 * @param selector chọn phần tử active BÊN TRONG dải (vd `[role="tab"][data-state="active"]`).
 * @param trigger  giá trị đổi ⇒ tính lại (vd tab đang chọn). Không đổi ⇒ chỉ chạy lúc mount.
 */
export function useScrollActiveIntoView(
  listRef: RefObject<HTMLElement | null>,
  selector: string,
  trigger: unknown,
): void {
  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>(selector);
    if (!list || !active) return;

    const start = active.offsetLeft;
    const end = start + active.offsetWidth;
    if (start < list.scrollLeft) list.scrollLeft = start;
    else if (end > list.scrollLeft + list.clientWidth) list.scrollLeft = end - list.clientWidth;
  }, [listRef, selector, trigger]);
}
