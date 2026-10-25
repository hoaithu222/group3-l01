import { Text, View } from 'react-native';

import { useIsScreenFocused } from '@/shared/hooks/useIsScreenFocused';
import { Sparkles } from '@/shared/ui';
import { Badge, type BadgeVariant } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';

import type { WorkspaceDetail } from '../api';
import { useHeroCoverRatio } from '../hooks/useHeroCoverRatio';
import { WorkspaceAvatar } from './WorkspaceAvatar';
import { WorkspaceCover } from './WorkspaceCover';
import { WorkspaceCoverScrim } from './WorkspaceCoverScrim';
import { WorkspaceHeroDescription } from './WorkspaceHeroDescription';

/**
 * ⚠️ Khoá `string` (không phải `WorkspaceRole`) CÓ CHỦ Ý: BE thêm vai mới trước khi app cập nhật thì tra bảng ra `undefined`
 * ⇒ nơi dùng rơi về chính mã vai / tông `neutral`, thay vì một huy hiệu rỗng.
 */
const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Chủ nhóm',
  ADMIN: 'Quản trị viên',
  MEMBER: 'Thành viên',
  GUEST: 'Khách',
};

/** Tông huy hiệu vai trò — cùng tông với thẻ nhóm ở danh sách (`WorkspaceCard`: chủ nhóm `info`, quản trị `neutral`). */
const ROLE_VARIANT: Record<string, BadgeVariant> = {
  OWNER: 'info',
  GUEST: 'warning',
};

export interface WorkspaceOverviewHeroProps {
  /** Số thành viên của nhóm — `undefined` ⇒ không vẽ (KHÁCH: BE không gửi, khách không có danh bạ). */
  memberCount?: number;
  /** Có ⇒ nút "Mời thành viên" dưới mô tả. Màn quyết ai thấy (OWNER/ADMIN của nhóm còn hoạt động) — hero chỉ vẽ. */
  onInvite?: () => void;
  workspace: Pick<
    WorkspaceDetail,
    'avatarUrl' | 'coverPreset' | 'coverUrl' | 'description' | 'myRole' | 'name'
  >;
  /** Id nhóm của route — suy màu bìa ổn định khi nhóm chưa có ảnh bìa (`coverPresetFor`). */
  wsId: string;
}

/**
 * Đầu trang tổng quan nhóm, theo khuôn "trang nhóm" quen thuộc (Teams team page · Discord server header · lớp học Classroom):
 * ẢNH BÌA của nhóm (hoặc mảng màu suy từ `coverPreset`/id) + avatar đè lên mép dưới bìa + tên (tối đa 2 dòng, vai `header`)
 * + hàng thông tin "huy hiệu vai trò · N thành viên" + mô tả thu gọn 2 dòng có "Xem thêm" (`WorkspaceHeroDescription`) + nút
 * "Mời thành viên" (chỉ khi màn truyền `onInvite`). Tìm kiếm và Cài đặt nằm ở thanh tiêu đề (`WorkspaceHeaderActions`).
 *
 * ⚠️ Bìa giữ tỉ lệ `banner-slim` như ô xem trước ở Cài đặt (ảnh cắt đúng khung người dùng đã thấy lúc chọn); NẰM NGANG thì
 * mỏng hơn (`useHeroCoverRatio`, khung xương dùng cùng hook). `-mt-8`: avatar 64 đè NỬA lên bìa; vành trắng sẵn có của
 * `Avatar` tách nó khỏi ảnh bìa. Không chữ nào nằm trên ảnh bìa ⇒ tên/mô tả luôn đọc được ở cả hai chế độ.
 *
 * ✅ Điểm nhấn: vài ngôi sao nhỏ lấp lánh quanh avatar (`Sparkles`) — vòng lặp DUY NHẤT của màn (quỹ "một vòng lặp nổi bật"),
 * dừng khi màn bị che (`useIsScreenFocused`), đứng yên khi bật "Giảm chuyển động" — + lớp phủ tan dần ở nửa dưới bìa
 * (`WorkspaceCoverScrim`).
 *
 * Số thành viên nói ở ĐÂY (một lần); ô "Thành viên" của khung lối vào chỉ còn là lối vào, không lặp lại con số.
 */
export function WorkspaceOverviewHero({
  memberCount,
  onInvite,
  workspace,
  wsId,
}: WorkspaceOverviewHeroProps) {
  const focused = useIsScreenFocused();
  const coverRatio = useHeroCoverRatio();

  return (
    <View className="overflow-hidden rounded-md bg-bg-1">
      <View>
        <WorkspaceCover
          aspectRatio={coverRatio}
          className="rounded-none"
          coverPreset={workspace.coverPreset}
          coverUrl={workspace.coverUrl}
          workspaceId={wsId}
        />
        <WorkspaceCoverScrim />
      </View>
      <View className="-mt-8 items-center gap-sm px-md pb-md">
        <View>
          {/* ⚠️ Sao vẽ TRƯỚC avatar ⇒ nằm SAU vành trắng: sao lấn vào thì bị che, không đè lên chữ viết tắt/ảnh nhóm. */}
          <Sparkles active={focused} className="-inset-3" count={3} size={10} />
          <WorkspaceAvatar avatarUrl={workspace.avatarUrl} name={workspace.name} size="xl" />
        </View>
        <View className="w-full items-center gap-xs">
          {/* Tên dài: 2 dòng rồi "…" (thanh tiêu đề đã cắt 1 dòng); trình đọc vẫn đọc đủ tên. */}
          <Text
            accessibilityRole="header"
            className="text-center text-header-sm font-bold text-fg-1"
            numberOfLines={2}
          >
            {workspace.name}
          </Text>
          {/* `flex-wrap`: máy 320dp + cỡ chữ 1.3 thì số thành viên xuống dòng thay vì đẩy huy hiệu tràn mép. */}
          <View className="flex-row flex-wrap items-center justify-center gap-x-sm gap-y-2xs">
            <Badge
              label={ROLE_LABEL[workspace.myRole] ?? workspace.myRole}
              size="sm"
              variant={ROLE_VARIANT[workspace.myRole] ?? 'neutral'}
            />
            {memberCount === undefined ? null : (
              <View className="flex-row items-center gap-2xs">
                <Icon color="fg-2" name="user" size={16} />
                <Text className="text-caption-lg text-fg-2">{`${memberCount} thành viên`}</Text>
              </View>
            )}
          </View>
        </View>
        {workspace.description ? <WorkspaceHeroDescription text={workspace.description} /> : null}
        {onInvite ? (
          <View className="w-full items-center">
            <Button
              iconLeft="user-add"
              label="Mời thành viên"
              pressableClassName="self-center"
              size="sm"
              variant="secondary"
              onPress={onInvite}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}
