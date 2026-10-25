import { Text, View } from 'react-native';

import type { WorkspaceRole } from '../api';

const SECTION_LABEL: Record<WorkspaceRole, string> = {
  OWNER: 'Chủ nhóm',
  ADMIN: 'Quản trị viên',
  MEMBER: 'Thành viên',
  GUEST: 'Khách',
};

export interface MemberSectionHeaderProps {
  /** Số người của nhóm — vắng mặt khi chưa biết số THẬT (đang tìm mà chưa tải hết trang): không vẽ số đoán. */
  count?: number;
  role: WorkspaceRole;
}

/**
 * Tiêu đề nhóm vai trò trong danh sách thành viên ("CHỦ NHÓM · 1") — nhịp của Discord / Google Classroom "Mọi người".
 *
 * ⛔ Chữ IN HOA chỉ qua `text-overline` (vai DUY NHẤT được kiểm `lineHeight` cho dấu tiếng Việt chồng tầng); chuỗi vẫn viết thường.
 * Vai `header` + nhãn "Quản trị viên, 2 người": trình đọc màn hình nhảy được giữa các nhóm và nghe số người bằng chữ.
 */
export function MemberSectionHeader({ count, role }: MemberSectionHeaderProps) {
  const label = SECTION_LABEL[role];

  return (
    <View
      accessibilityLabel={count === undefined ? label : `${label}, ${count} người`}
      accessibilityRole="header"
      accessible
      className="flex-row items-center gap-2xs px-md pb-2xs pt-md"
    >
      <Text className="text-overline text-fg-2">{label}</Text>
      {count === undefined ? null : <Text className="text-overline text-fg-2">· {count}</Text>}
    </View>
  );
}
