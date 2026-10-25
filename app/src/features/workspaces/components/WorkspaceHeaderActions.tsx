import { router } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { useFeature } from '@/shell/capabilities';

export interface WorkspaceHeaderActionsProps {
  wsId: string;
}

/**
 * Hai nút ở đầu trang nhóm: "Tìm trong nhóm" (kính lúp — p5-04, tìm tin/tệp/kênh/người/cuộc họp toàn nhóm) và "Cài đặt nhóm".
 * Kính lúp CHỈ hiện khi cờ phụ `workspaceSearch` bật (chưa biết cờ = ẩn, không chớp rồi biến); khách vẫn thấy vì BE cho khách
 * tìm trong phạm vi được cấp (tab "Người" do màn tìm tự ẩn). `AppBar` chỉ có hai khe phải — đừng thêm nút thứ ba ở đây.
 */
export function WorkspaceHeaderActions({ wsId }: WorkspaceHeaderActionsProps) {
  const searchEnabled = useFeature('workspaceSearch') === true;

  return (
    <View className="flex-row items-center gap-sm">
      {searchEnabled ? (
        <Button
          accessibilityLabel="Tìm trong nhóm"
          iconLeft="search"
          iconOnly
          size="sm"
          variant="tertiary"
          onPress={() => router.push({ pathname: '/workspaces/[wsId]/search', params: { wsId } })}
        />
      ) : null}
      <Button
        accessibilityLabel="Cài đặt nhóm"
        iconLeft="setting"
        iconOnly
        size="sm"
        variant="tertiary"
        onPress={() => router.push({ pathname: '/workspaces/[wsId]/settings', params: { wsId } })}
      />
    </View>
  );
}
