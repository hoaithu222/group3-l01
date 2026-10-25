import { Text } from 'react-native';

import { LinkButton } from '@/shared/ui/button';

import { openReceipts, type ReceiptsTarget } from '../utils/open-receipts';

export interface ReceiptsLinkProps {
  confirmedCount: number;
  /** Thiếu `workspaceId` (màn cha không truyền) thì chỉ hiện số, không bấm mở được. */
  target: Omit<ReceiptsTarget, 'workspaceId'> & { workspaceId?: string };
}

/**
 * Người yêu cầu / quản trị kênh thấy "N đã xác nhận" ngay trên tin → chạm mở danh sách (app.md §3). Dùng `LinkButton` của bộ
 * chung (chữ 16/24 + `hitSlop` ⇒ vùng chạm 44dp) thay vì tự dựng `Pressable` + `Text`.
 */
export function ReceiptsLink({ confirmedCount, target }: ReceiptsLinkProps) {
  const { workspaceId } = target;
  const label = `${confirmedCount} đã xác nhận`;

  if (!workspaceId) return <Text className="text-label-md font-semibold text-fg-2">{label}</Text>;
  return (
    <LinkButton
      iconRight="arrow-right-small"
      label={label}
      onPress={() => openReceipts({ ...target, workspaceId })}
    />
  );
}
