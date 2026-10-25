import { Text, View } from 'react-native';

import type { WorkspaceListItem } from '../api';
import { WORKSPACE_CARD_COVER_RATIO } from '../utils/workspace-cover';
import { WorkspaceAvatar } from './WorkspaceAvatar';
import { WorkspaceCover } from './WorkspaceCover';

export interface JoinPendingGroupCardProps {
  workspace: WorkspaceListItem;
}

/**
 * Danh thiếp của nhóm đang xin vào, ở đầu màn chờ duyệt — CÙNG khuôn thẻ danh sách (bìa 3:1 · avatar đè mép bìa · tên 2 dòng)
 * để người dùng nhận ra ngay "đúng nhóm mình vừa bấm", thay vì một hình đồng hồ chung chung.
 *
 * Không bấm được (chưa là thành viên thì chưa mở được nhóm) ⇒ một phần tử trợ năng có nhãn, không phải nút.
 */
export function JoinPendingGroupCard({ workspace }: JoinPendingGroupCardProps) {
  return (
    <View
      accessibilityLabel={`Nhóm ${workspace.name}`}
      accessible
      className="overflow-hidden rounded-md bg-bg-1"
    >
      <WorkspaceCover
        aspectRatio={WORKSPACE_CARD_COVER_RATIO}
        className="rounded-none"
        coverPreset={workspace.coverPreset}
        coverUrl={workspace.coverUrl ?? workspace.coverThumbUrl}
        placeholderUrl={workspace.coverThumbUrl}
        workspaceId={workspace.id}
      />
      <View className="flex-row gap-sm px-md pb-md">
        <WorkspaceAvatar
          avatarUrl={workspace.avatarUrl}
          className="-mt-6"
          name={workspace.name}
          size="lg"
        />
        <View className="flex-1 gap-2xs pt-xs">
          <Text className="text-body-lg font-semibold text-fg-1" numberOfLines={2}>
            {workspace.name}
          </Text>
          {workspace.descriptionShort ? (
            <Text className="text-caption-lg text-fg-2" numberOfLines={2}>
              {workspace.descriptionShort}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}
