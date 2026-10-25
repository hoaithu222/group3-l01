import { useMemo } from 'react';

import type { MemberRow, WorkspaceRole } from '../api';
import type { MemberRoleCounts } from './useMemberRoleCounts';

/** Một ô của `FlashList` màn Thành viên: tiêu đề nhóm vai trò hoặc một người. */
export type MemberListItem =
  | { count?: number; key: string; kind: 'header'; role: WorkspaceRole }
  | { key: string; kind: 'member'; member: MemberRow };

/** Thứ tự nhóm — trùng thứ tự `sort=role` của BE (hạng cao trước). */
const ROLE_ORDER: readonly WorkspaceRole[] = ['OWNER', 'ADMIN', 'MEMBER', 'GUEST'];

interface Options {
  /** Đã tải HẾT các trang (đếm tại chỗ là số thật). */
  complete: boolean;
  counts: MemberRoleCounts;
  /** Chỉ chia nhóm ở chế độ "Tất cả" đang hoạt động — đã lọc một vai trò hay xem "Bị chặn" thì tiêu đề nhóm là thừa. */
  grouped: boolean;
  members: MemberRow[];
  /** Đang tìm: số của cả nhóm (`counts`) không còn đúng với danh sách đang hiện. */
  searching: boolean;
}

/**
 * Dàn danh sách phẳng cho `FlashList` (tiêu đề nhóm + hàng người) — kiểu danh sách thành viên của Discord / mục "Mọi người" của
 * Google Classroom: "CHỦ NHÓM · 1", "QUẢN TRỊ VIÊN · 2"…
 *
 * ⚠️ Gom theo XÔ vai trò thay vì chèn tiêu đề mỗi khi vai trò đổi: `member:updated` vá vai trò tại chỗ (dòng vừa lên quản trị viên vẫn
 * nằm giữa nhóm "Thành viên" tới lần tải lại) — chèn theo thứ tự sẽ ra HAI tiêu đề "Quản trị viên" trùng khoá. Xô giữ nguyên thứ tự BE
 * trong từng nhóm.
 * Số trên tiêu đề: không tìm ⇒ số của cả nhóm; đang tìm ⇒ chỉ đếm khi đã tải hết trang (không thì bỏ số — thà thiếu còn hơn sai).
 */
export function useMemberListItems({
  complete,
  counts,
  grouped,
  members,
  searching,
}: Options): MemberListItem[] {
  return useMemo(() => {
    if (!grouped)
      return members.map((member) => ({ key: member.userId, kind: 'member' as const, member }));

    const buckets = new Map<WorkspaceRole, MemberRow[]>();
    for (const member of members) {
      const bucket = buckets.get(member.role);
      if (bucket) bucket.push(member);
      else buckets.set(member.role, [member]);
    }

    const items: MemberListItem[] = [];
    for (const role of ROLE_ORDER) {
      const bucket = buckets.get(role);
      if (!bucket) continue;
      const count = searching ? (complete ? bucket.length : undefined) : counts[role];
      items.push({ count, key: `header:${role}`, kind: 'header', role });
      for (const member of bucket) items.push({ key: member.userId, kind: 'member', member });
    }
    return items;
  }, [complete, counts, grouped, members, searching]);
}
