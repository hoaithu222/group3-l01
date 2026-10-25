import { Text, View } from 'react-native';

import { Chip } from '@/shared/ui/chip';
import { ScreenState } from '@/shared/ui/screen-state';

import { useWorkspaceOptions } from '../../hooks/useConvertToTask';
import { describeChatExtError } from '../../utils/error-info';

export interface ResourceTargetPickerProps {
  /** Nhóm của phòng chat (kênh) — có thì KHÔNG cho chọn nhóm khác (BE `WORKSPACE_MISMATCH`). */
  fixedWorkspaceId?: string;
  value: string | undefined;
  onChange: (workspaceId: string) => void;
}

/**
 * Chọn NHÓM đích của tệp (kho tài liệu là của nhóm). Kênh: nhóm cố định ⇒ chỉ một dòng giải thích, không tra gì. Hội thoại: chip chọn-một trong nhóm của tôi (cùng nguồn với "Tạo task"); người không có
 * quyền tải lên ở nhóm nào đó vẫn thấy nhóm — BE từ chối lúc gửi (403/404 của kho tài liệu) và tấm hiện câu đó. Tệp luôn vào GỐC kho: chọn thư mục đích chưa có ở đây (BE nhận `folderId`, app chưa dùng).
 */
export function ResourceTargetPicker({ fixedWorkspaceId, value, onChange }: ResourceTargetPickerProps) {
  const workspaces = useWorkspaceOptions(fixedWorkspaceId === undefined);

  if (fixedWorkspaceId !== undefined) {
    return <Text className="text-body-md text-fg-2">Tệp sẽ được lưu vào kho tài liệu của nhóm chứa kênh này.</Text>;
  }
  if (workspaces.isError) {
    return (
      <ScreenState
        action={{ label: 'Thử lại', onPress: () => void workspaces.refetch() }}
        description={describeChatExtError(workspaces.error).message}
        fullscreen={false}
        state="error"
      />
    );
  }

  return (
    <View className="gap-xs">
      <Text accessibilityRole="header" className="text-label-md font-semibold text-fg-1">
        Lưu vào tài liệu của nhóm
      </Text>
      <View className="flex-row flex-wrap gap-xs">
        {(workspaces.data ?? []).map((ws) => (
          <Chip key={ws.id} label={ws.name} role="radio" selected={ws.id === value} onPress={() => onChange(ws.id)} />
        ))}
        {workspaces.isSuccess && workspaces.data.length === 0 ? (
          <Text className="text-body-md text-fg-2">Bạn chưa ở nhóm nào</Text>
        ) : null}
      </View>
    </View>
  );
}
