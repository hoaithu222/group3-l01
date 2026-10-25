import { useMemo } from 'react';

import type { MemberRoleFilter } from '../api';
import { useMembers } from '../queries/members.queries';

/** Số người ĐANG HOẠT ĐỘNG của cả nhóm theo vai trò — `undefined` khi chưa biết (đang tải / lỗi). */
export interface MemberRoleCounts {
  ADMIN?: number;
  /** Cả nhóm (mọi vai trò, kể cả khách). */
  ALL?: number;
  /** Suy ra: tổng − ba vai lọc được (BE chưa cho lọc `role=GUEST` ở kiểu `MemberRoleFilter`). */
  GUEST?: number;
  MEMBER?: number;
  OWNER?: number;
}

/**
 * Đếm thành viên theo vai trò cho chip lọc và tiêu đề nhóm của `MemberListScreen`.
 *
 * BE không có endpoint đếm theo vai trò (chỉ `meta.total` của MỘT bộ lọc) ⇒ gọi lại `useMembers` với đúng bộ lọc mà chip vai trò
 * sẽ gửi (`{ role, status: 'ACTIVE' }`, không `q`). ✅ Cùng khoá cache với danh sách khi người dùng bấm chip đó (`hashKey` bỏ trường
 * `undefined`), nên đây cũng là tải trước: bấm chip là hiện ngay. Cùng tiền tố `memberKeys.listAll` ⇒ `invalidateMemberCopies`
 * (socket `member:updated`, đổi vai trò, loại/chặn) làm mới luôn các con số — không cần đường đồng bộ riêng.
 * ⚠️ Số đếm là của CẢ NHÓM (không theo ô tìm): chip là bộ lọc vai trò, không phải số kết quả tìm.
 */
export function useMemberRoleCounts(wsId: string): MemberRoleCounts {
  const all = useRoleTotal(wsId, undefined);
  const owner = useRoleTotal(wsId, 'OWNER');
  const admin = useRoleTotal(wsId, 'ADMIN');
  const member = useRoleTotal(wsId, 'MEMBER');

  // Object ỔN ĐỊNH theo giá trị: nơi gọi đưa nó vào `useMemo` của danh sách — object mới mỗi lượt vẽ là dựng lại cả danh sách.
  return useMemo(() => {
    const known =
      all !== undefined && owner !== undefined && admin !== undefined && member !== undefined;
    // Các truy vấn về lệch nhịp (người mới vào giữa chừng) có thể cho hiệu âm — kẹp về 0 thay vì vẽ "-1".
    const guest = known ? Math.max(0, all - owner - admin - member) : undefined;
    return { ADMIN: admin, ALL: all, GUEST: guest, MEMBER: member, OWNER: owner };
  }, [admin, all, member, owner]);
}

function useRoleTotal(wsId: string, role: MemberRoleFilter | undefined): number | undefined {
  const { data } = useMembers(wsId, { role, status: 'ACTIVE' });
  return data?.pages[0]?.meta.total;
}
