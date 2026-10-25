import type { AuthUser } from '@/app/store/slices/auth/types';
import { matchesSearch } from '@/shared/utils/format/string.utils';

import type { UserOption } from '../types/notifications-config.types';

/**
 * Ghép dòng "Chính tôi" lên ĐẦU danh sách gợi ý người nhận (mặc định của công cụ
 * là chính người thao tác). `AsyncSelectField` không có nút xoá lựa chọn, nên đây
 * là đường quay về "chính mình" sau khi đã chọn người khác.
 *
 * Bản thân người thao tác có thể đã nằm trong kết quả tìm — bỏ dòng trùng để không
 * hiện hai lần. Dòng "Chính tôi" chỉ hiện khi từ khoá rỗng hoặc khớp tên/email
 * mình (so khớp không phân biệt dấu).
 */
export function withSelfOption(
  found: readonly UserOption[],
  self: Pick<AuthUser, 'id' | 'name' | 'email'> | null,
  search: string,
): UserOption[] {
  if (!self) return [...found];
  const rest = found.filter((o) => o.value !== self.id);
  if (!matchesSearch([self.name, self.email], search)) return rest;
  return [{ value: self.id, label: `Chính tôi · ${self.name}` }, ...rest];
}
