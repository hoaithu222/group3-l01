import { View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { LoadingMore } from '@/shared/ui/progress';

import type { EligibleWorkspace } from '../../api/portfolio.types';

export interface EligibleWorkspaceRowProps {
  workspace: EligibleWorkspace;
  /** Đang thêm CHÍNH nhóm này. */
  adding: boolean;
  /** Khoá cả hàng: đang thêm nhóm khác, hết chỗ, hoặc offline. */
  disabled: boolean;
  divider: boolean;
  onAdd: () => void;
}

/**
 * Một nhóm đủ điều kiện (app.md p6-07 §3 "Thêm dự án"): tên nhóm, "12 task của bạn", nhãn "Đã lưu trữ" / "Đã rời nhóm" / "Đã thêm". Nhóm đã lưu trữ hoặc đã rời VẪN thêm được — số liệu là việc
 * đã xảy ra thật, không cần quyền đọc hiện tại (README §2); nhóm đã có trong hồ sơ thì khoá. Nhãn là chữ trong `Badge` (không dùng màu làm dấu hiệu duy nhất).
 */
export function EligibleWorkspaceRow({
  adding,
  disabled,
  divider,
  onAdd,
  workspace,
}: EligibleWorkspaceRowProps) {
  return (
    <ListItem
      className="py-xs"
      description={`${workspace.myTasksDone} task của bạn`}
      disabled={disabled || workspace.alreadyAdded}
      divider={divider}
      emphasis="title"
      label={workspace.name}
      // Ô icon "Nhóm" (cùng `add-team` · info với phân hệ Nhóm ở Trang chủ); nhóm đã thêm/không thêm được thì tông trung tính.
      leading={
        <IconTile
          name="add-team"
          tone={workspace.alreadyAdded || disabled ? 'neutral' : 'info'}
        />
      }
      trailing={
        adding ? <LoadingMore className="py-0" label={`Đang thêm ${workspace.name}`} /> : undefined
      }
      value={
        <View className="flex-row flex-wrap justify-end gap-3xs">
          {workspace.alreadyAdded ? <Badge label="Đã thêm" size="sm" variant="success" /> : null}
          {workspace.archived ? <Badge label="Đã lưu trữ" size="sm" variant="neutral" /> : null}
          {workspace.left ? <Badge label="Đã rời nhóm" size="sm" variant="neutral" /> : null}
        </View>
      }
      onPress={workspace.alreadyAdded ? undefined : onAdd}
    />
  );
}
