import { Text, View } from 'react-native';

import { AvatarWithFrame, parseAvatarFrameToken } from '@/shared/ui/avatar';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { EmptyState } from '@/shared/ui/empty-state';
import { Skeleton } from '@/shared/ui/skeleton';

import { useAvatarSource } from '../hooks/useAvatarSource';
import { usePublicGamification } from '../queries/gamification-public.queries';
import { BadgeTile } from './BadgeTile';

/** Khung avatar đang trang bị (nếu có) — `equippedItems` có thể chứa cả theme/emoji, chỉ `AVATAR_FRAME` vẽ lên `Avatar`. */
function frameOf(profile: {
  equippedItems: { kind: string; data: Record<string, unknown> | null }[];
}) {
  const frame = profile.equippedItems.find((item) => item.kind === 'AVATAR_FRAME');
  return frame ? parseAvatarFrameToken(frame.data) : null;
}

export interface PublicProfileSheetProps {
  /** Tên hiện trên bảng xếp hạng — dùng làm tiêu đề trong lúc tải và khi 404. */
  name?: string;
  /** `null` ⇒ ẩn. */
  userId: string | null;
  onClose: () => void;
}

/**
 * Hồ sơ công khai (app.md p4-03 §9, P1): cấp, chuỗi ngày, huy hiệu trưng bày — mở khi bấm một dòng bảng xếp hạng. BE trả
 * 404 TRUNG TÍNH khi không chung nhóm hoặc người đó tắt "cho xem cấp độ và huy hiệu" nên màn không phân biệt hai ca.
 */
export function PublicProfileSheet({ name, onClose, userId }: PublicProfileSheetProps) {
  const query = usePublicGamification(userId);
  const profile = query.data;
  const avatar = useAvatarSource(profile?.avatarAssetId);
  const title = profile?.name ?? name ?? 'Hồ sơ thành tích';

  return (
    <BottomSheet scrollable title={title} visible={userId !== null} onClose={onClose}>
      {query.isLoading ? (
        <Skeleton className="h-32 rounded-md" />
      ) : query.isError || !profile ? (
        // 404 TRUNG TÍNH (không chung nhóm / người đó tắt chia sẻ) = ca "không có quyền xem" ⇒ ổ khoá tông `warning`, cỡ gọn
        // vì nằm trong tấm trượt. ⚠️ Không `title`: tấm đã có tiêu đề `header` (tên người) — hai header lồng nhau đọc lặp.
        <EmptyState
          description="Người này không chia sẻ hồ sơ thành tích với bạn."
          icon="lock"
          size="compact"
          tone="warning"
        />
      ) : (
        <View className="gap-md py-xs">
          <View className="flex-row items-center gap-sm">
            <AvatarWithFrame
              frame={frameOf(profile)}
              name={profile.name}
              size="md"
              source={avatar}
            />
            <View className="flex-1 gap-2xs">
              <Text className="text-body-lg font-semibold text-fg-1" numberOfLines={1}>
                {profile.name}
              </Text>
              <Text className="text-body-md text-fg-2">
                {`Cấp ${profile.level} · Chuỗi ${profile.streak} ngày`}
              </Text>
            </View>
          </View>
          {profile.showcase.length === 0 ? (
            <Text className="text-body-md text-fg-2">Chưa trưng bày huy hiệu nào.</Text>
          ) : (
            <View className="gap-sm">
              <Text className="text-label-md text-fg-1">Huy hiệu trưng bày</Text>
              {profile.showcase.map((badge) => (
                <BadgeTile key={badge.id} badge={badge} />
              ))}
            </View>
          )}
        </View>
      )}
    </BottomSheet>
  );
}
