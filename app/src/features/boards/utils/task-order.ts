import type { TaskCardDto } from '../api/boards.types';

/**
 * So sánh khoá `position` (fractional index) bằng so sánh CHUỖI THÔ theo mã ký
 * tự — đúng cách thư viện `fractional-indexing` và phép sắp của MongoDB (không
 * collation) hiểu thứ tự khoá.
 *
 * ⛔ Đừng dùng `localeCompare`: nó sắp theo bảng chữ cái của ngôn ngữ nên
 * `'a1' < 'B0'` (không phân biệt hoa/thường), trong khi khoá là base-62 có
 * phân biệt hoa/thường — sai thứ tự lặng lẽ, thẻ nhảy vị trí sau mỗi lần tải.
 *
 * `id` làm khoá phụ để hai thẻ trùng `position` (server đã chặn, nhưng khoá
 * tạm client có thể trùng nhau trong tích tắc) vẫn ổn định giữa hai lần vẽ.
 */
export function comparePosition(
  a: Pick<TaskCardDto, 'id' | 'position'>,
  b: Pick<TaskCardDto, 'id' | 'position'>,
): number {
  if (a.position < b.position) return -1;
  if (a.position > b.position) return 1;
  if (a.id < b.id) return -1;
  return a.id > b.id ? 1 : 0;
}

export function sortByPosition(tasks: readonly TaskCardDto[]): TaskCardDto[] {
  return [...tasks].sort(comparePosition);
}
