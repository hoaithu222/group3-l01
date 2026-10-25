import { Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { PressableScale } from '@/shared/ui/motion';
import { cn } from '@/shared/utils/style/cn';

import type { WorkspaceListItem } from '../api';
import { workspaceCardFacts } from '../utils/workspace-card';
import { WORKSPACE_CARD_COVER_RATIO } from '../utils/workspace-cover';
import { WorkspaceAvatar } from './WorkspaceAvatar';
import { WorkspaceCardBadges } from './WorkspaceCardBadges';
import { WorkspaceCover } from './WorkspaceCover';

export interface WorkspaceCardProps {
  workspace: WorkspaceListItem;
  onPress: (workspace: WorkspaceListItem) => void;
  onLongPress?: (workspace: WorkspaceListItem) => void;
}

/**
 * Thẻ một nhóm trong `WorkspaceListScreen` (app.md p1-01 §3) — khuôn "thẻ lớp học" của Google Classroom: dải bìa tỉ lệ 3:1
 * (`WORKSPACE_CARD_COVER_RATIO`: ảnh bìa BẢN GỐC, hoặc mảng màu suy từ `coverPreset`/id nhóm) · avatar đè NỬA lên mép dải bìa ·
 * tên tối đa 2 dòng (app.md §7 "Tên nhóm dài: 2 dòng ở thẻ") · mô tả ngắn · huy hiệu vai trò/trạng thái · dòng chưa đọc +
 * "Hoạt động … trước". Chưa đọc theo kiểu Slack/Teams: nhắc tên = số ĐỎ, kênh có tin mới = số màu thương hiệu + tên ĐẬM —
 * và luôn kèm CHỮ ("2 lượt nhắc tên"), màu không bao giờ là dấu hiệu duy nhất.
 *
 * Thẻ ĐỘC LẬP (không phải hàng danh sách) ⇒ `PressableScale` co nhẹ khi nhấn. `grow` + `fill`: trong lưới nhiều cột
 * (`WorkspaceGrid`) các thẻ cùng hàng cao bằng nhau dù tên/mô tả dài ngắn khác nhau.
 * ⛔ `grow` chứ không `flex-1`: ô lưới cao theo nội dung ở 1 cột, con `flex-1` (basis 0) sẽ sập về 0dp.
 */
export function WorkspaceCard({ workspace, onPress, onLongPress }: WorkspaceCardProps) {
  const facts = workspaceCardFacts(workspace);
  const countBadge =
    facts.unreadTone === 'mention' ? (
      <Badge count={workspace.mentionCount} variant="error" />
    ) : facts.unreadTone === 'unread' ? (
      <Badge count={workspace.unreadCount} variant="brand" />
    ) : null;

  return (
    <PressableScale
      accessibilityLabel={facts.a11yLabel}
      accessibilityRole="button"
      className="grow"
      contentClassName="overflow-hidden rounded-md bg-bg-1"
      fill
      onLongPress={onLongPress ? () => onLongPress(workspace) : undefined}
      onPress={() => onPress(workspace)}
    >
      {/* Dải bìa — mỗi nhóm một sắc nên danh sách đọc ra "nhiều nhóm khác nhau" trước cả khi đọc tên. Trang trí thuần: tự ẩn
          khỏi trình đọc màn hình.
          ⛔ Nguồn chính là BẢN GỐC `coverUrl` (cạnh dài ≤ 2048 px, `prepare-image.ts`); `coverThumbUrl` (webp ≤ 320 px) chỉ là ảnh
          TẠM lúc bản gốc đang tải — 320 px kéo ra ~1000 px thật (thẻ rộng hết màn × mật độ 3) là ảnh vỡ hạt. Tỉ lệ khung và lý do:
          `WORKSPACE_CARD_COVER_RATIO`. */}
      <WorkspaceCover
        aspectRatio={WORKSPACE_CARD_COVER_RATIO}
        className="rounded-none"
        coverPreset={workspace.coverPreset}
        coverUrl={workspace.coverUrl ?? workspace.coverThumbUrl}
        placeholderUrl={workspace.coverThumbUrl}
        workspaceId={workspace.id}
      />

      <View className="flex-row gap-sm px-md pb-md">
        {/* `-mt-6`: avatar 48 đè NỬA lên dải bìa — vành trắng sẵn có của `Avatar` tách nó khỏi ảnh bìa bên dưới. */}
        <WorkspaceAvatar
          avatarUrl={workspace.avatarUrl}
          className="-mt-6"
          name={workspace.name}
          size="lg"
        />

        <View className="flex-1 gap-2xs pt-xs">
          <View className="flex-row items-start gap-xs">
            {/* ⚠️ Tên 2 dòng rồi "…" (tên nhóm tiếng Việt dài ~30% so với tiếng Anh); tên ĐẦY ĐỦ ở nhãn trợ năng của thẻ và ở
                Cài đặt nhóm. Có tin mới ⇒ chữ ĐẬM hơn — tín hiệu thứ hai bên cạnh con số, cùng cách Slack/Teams. */}
            <Text
              className={cn(
                'flex-1 text-body-lg text-fg-1',
                facts.unreadTone ? 'font-bold' : 'font-semibold',
              )}
              numberOfLines={2}
            >
              {workspace.name}
            </Text>
            {countBadge ? <View className="pt-3xs">{countBadge}</View> : null}
          </View>

          {workspace.descriptionShort ? (
            <Text className="text-caption-lg text-fg-2" numberOfLines={2}>
              {workspace.descriptionShort}
            </Text>
          ) : null}

          <WorkspaceCardBadges facts={facts} isFavorite={workspace.isFavorite} />

          {facts.unreadText || facts.activityText ? (
            <Text className="text-caption-lg text-fg-2" numberOfLines={2}>
              {facts.unreadText ? (
                <Text
                  className={cn(
                    'font-semibold',
                    facts.unreadTone === 'mention' ? 'text-error' : 'text-fg-brand',
                  )}
                >
                  {facts.unreadText}
                </Text>
              ) : null}
              {facts.unreadText && facts.activityText ? ' · ' : null}
              {facts.activityText}
            </Text>
          ) : null}
        </View>
      </View>
    </PressableScale>
  );
}
