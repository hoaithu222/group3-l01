interface PageView<T> {
  /** Trang thực sự hiển thị (đã kẹp vào `1..số trang` — `?page=99` trên URL không cho ra bảng trống). */
  page: number;
  rows: T[];
}

/** Phân trang phía client cho danh sách BE trả một lần (không phân trang): `page` 1-based. */
export function paginate<T>(items: readonly T[], page: number, pageSize: number): PageView<T> {
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * pageSize;
  return { page: current, rows: items.slice(start, start + pageSize) };
}
