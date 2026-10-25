import type {
  MemberRoleFilter,
  MembershipStatusValue,
  MemberSort,
} from '../types/workspace-members.types';

/** Nhãn lọc vai trò — `GUEST` (Khách) thêm ở p3-04, cần BE nhận `role=GUEST` (xem `MemberRoleFilter`). */
export const MEMBER_ROLE_FILTER_OPTIONS: ReadonlyArray<{ value: MemberRoleFilter; label: string }> = [
  { value: 'OWNER', label: 'Chủ nhóm' },
  { value: 'ADMIN', label: 'Quản trị viên' },
  { value: 'MEMBER', label: 'Thành viên' },
  { value: 'GUEST', label: 'Khách' },
];

export const MEMBER_STATUS_FILTER_OPTIONS: ReadonlyArray<{
  value: MembershipStatusValue;
  label: string;
}> = [
  { value: 'ACTIVE', label: 'Đang hoạt động' },
  { value: 'PENDING', label: 'Chờ tham gia' },
  { value: 'LEFT', label: 'Đã rời nhóm' },
  { value: 'REMOVED', label: 'Đã bị loại' },
  { value: 'BANNED', label: 'Bị chặn' },
];

export const MEMBER_SORT_OPTIONS: ReadonlyArray<{ value: MemberSort; label: string }> = [
  { value: 'joinedAt', label: 'Tham gia gần nhất' },
  { value: 'role', label: 'Vai trò' },
  { value: 'name', label: 'Tên' },
];
