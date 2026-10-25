import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { Icon } from '@/shared/ui/icon';

import type { Collaborator } from '../api/whiteboard.types';
import { COLLABORATOR_ROLE_LABEL } from '../constants/whiteboard.constants';

export interface CollaboratorRowProps {
  collaborator: Collaborator;
  /** Có quyền `manage` → chạm để đổi vai/gỡ; không thì chỉ đọc. */
  onPress?: (collaborator: Collaborator) => void;
}

/** Một người được mời vào bảng: avatar + tên + vai BẰNG CHỮ ("Được vẽ"/"Chỉ xem"). Chạm (khi có quyền quản lý) mở menu đổi vai/gỡ. */
export function CollaboratorRow({ collaborator, onPress }: CollaboratorRowProps) {
  const role = COLLABORATOR_ROLE_LABEL[collaborator.role];
  const content = (
    <>
      <Avatar name={collaborator.name} size="md" />
      <Text className="flex-1 text-label-lg font-semibold text-fg-1" numberOfLines={1}>
        {collaborator.name}
      </Text>
      <Badge label={role} size="sm" variant={collaborator.role === 'EDITOR' ? 'brand' : 'neutral'} />
      {onPress ? <Icon color="fg-2" name="more" size="sm" /> : null}
    </>
  );

  if (!onPress) {
    return (
      <View
        accessibilityLabel={`${collaborator.name}. ${role}`}
        accessible
        className="min-h-[56px] flex-row items-center gap-sm border-b border-b-divider-1 py-sm"
      >
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityHint="Đổi vai hoặc gỡ khỏi bảng"
      accessibilityLabel={`${collaborator.name}. ${role}`}
      accessibilityRole="button"
      className="min-h-[56px] flex-row items-center gap-sm border-b border-b-divider-1 py-sm active:opacity-70"
      onPress={() => onPress(collaborator)}
    >
      {content}
    </Pressable>
  );
}
