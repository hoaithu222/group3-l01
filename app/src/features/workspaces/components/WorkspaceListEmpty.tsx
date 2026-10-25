import { View } from 'react-native';

import { useIsScreenFocused } from '@/shared/hooks/useIsScreenFocused';
import { GlowOrbs } from '@/shared/ui/effects';
import { EmptyState } from '@/shared/ui/empty-state';

export interface WorkspaceListEmptyProps {
  onCreate: () => void;
  onJoin: () => void;
}

/**
 * "Chưa có nhóm nào" — màn đầu tiên của người mới, nên là cửa mời chứ không phải ô trống: hình minh hoạ `add-team` + HAI lối
 * vào (tham gia bằng mã · tạo nhóm), trên nền quầng sáng trôi chậm (`GlowOrbs`, kiểu màn chào của Google Classroom).
 *
 * ⚠️ `GlowOrbs` là vòng lặp NỔI BẬT DUY NHẤT của màn danh sách nhóm (`MOTION_LOOP`) — danh sách có nhóm thì không có vòng
 * nào. `active` theo `useIsScreenFocused()`: tab "Nhóm" giữ mounted khi sang tab khác, quầng phải DỪNG trôi lúc không ai
 * nhìn; "Giảm chuyển động" bật thì tự đứng yên. `subtle`: nền nằm SAU chữ mô tả.
 * Nút viền (phụ) đứng TRƯỚC nút đặc (chính) — thứ tự của Figma `EmptyState` (xem `EmptyStateActions`).
 */
export function WorkspaceListEmpty({ onCreate, onJoin }: WorkspaceListEmptyProps) {
  const focused = useIsScreenFocused();
  return (
    <View className="overflow-hidden rounded-md">
      <GlowOrbs active={focused} intensity="subtle" />
      <EmptyState
        actions={[
          { label: 'Tham gia bằng mã', variant: 'secondary', onPress: onJoin },
          { label: 'Tạo nhóm', onPress: onCreate },
        ]}
        description="Tạo nhóm cho lớp, dự án hay câu lạc bộ — hoặc dùng mã mời để vào một nhóm đã có."
        icon="add-team"
        title="Chưa có nhóm nào"
        tone="info"
      />
    </View>
  );
}
