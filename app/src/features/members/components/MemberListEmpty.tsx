import { EmptyState } from '@/shared/ui/empty-state';

import type { MemberRoleFilter, MemberStatusFilter } from '../api';

const ROLE_NOUN: Record<MemberRoleFilter, string> = {
  OWNER: 'chủ nhóm',
  ADMIN: 'quản trị viên',
  MEMBER: 'thành viên thường',
};

export interface MemberListEmptyProps {
  canInvite: boolean;
  onClearSearch: () => void;
  onInvite: () => void;
  onShowAll: () => void;
  /** Chuỗi tìm ĐÃ debounce (đúng chuỗi vừa gửi server). */
  query: string;
  role: MemberRoleFilter | undefined;
  status: MemberStatusFilter;
}

/**
 * Bốn ca "không có ai" của màn Thành viên — mỗi ca một câu đúng nghĩa và một lối ra.
 *
 * ⚠️ Bản cũ gộp mọi ca có lọc vào MỘT câu "Không tìm thấy thành viên nào khớp": mở tab "Bị chặn" của một nhóm chưa chặn ai cũng
 * đọc như tìm kiếm thất bại. Giờ: đang tìm → nhắc lại chuỗi đã gõ + "Xoá tìm kiếm"; tab "Bị chặn" rỗng → nói rõ chưa chặn ai; lọc
 * một vai trò rỗng → "Xem tất cả"; không lọc gì → mời thêm người (chỉ khi mời được).
 */
export function MemberListEmpty({
  canInvite,
  onClearSearch,
  onInvite,
  onShowAll,
  query,
  role,
  status,
}: MemberListEmptyProps) {
  if (query) {
    return (
      <EmptyState
        actions={[{ label: 'Xoá tìm kiếm', onPress: onClearSearch }]}
        description="Kiểm tra lại chính tả, hoặc thử tìm theo tên hiển thị trong nhóm."
        icon="search"
        title={`Không tìm thấy "${query}"`}
        tone="neutral"
      />
    );
  }

  if (status === 'BANNED') {
    return (
      <EmptyState
        description="Người bị chặn khỏi nhóm sẽ hiện ở đây. Họ không vào lại được bằng link mời cho tới khi được gỡ chặn."
        icon="close-acc"
        title="Chưa chặn ai"
        tone="neutral"
      />
    );
  }

  if (role) {
    return (
      <EmptyState
        actions={[{ label: 'Xem tất cả', onPress: onShowAll }]}
        description="Nhóm hiện chưa có ai ở vai trò này."
        icon="user"
        title={`Chưa có ${ROLE_NOUN[role]} nào`}
        tone="neutral"
      />
    );
  }

  return (
    <EmptyState
      actions={canInvite ? [{ label: 'Mời thành viên', onPress: onInvite }] : undefined}
      description={
        canInvite
          ? 'Mời thêm người vào nhóm để bắt đầu trò chuyện.'
          : 'Hiện chưa có thành viên nào khác trong nhóm.'
      }
      icon="user"
      title="Chỉ có bạn trong nhóm"
      tone="info"
    />
  );
}
