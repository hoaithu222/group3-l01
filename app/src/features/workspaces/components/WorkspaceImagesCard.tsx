import { useState } from 'react';
import { Text, View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { useDisplayImageUpload } from '@/core/uploads/use-display-image-upload';
import { imageSourceMenuItems } from '@/shared/media';
import { ActionMenuSheet } from '@/shared/ui/action-menu';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Section } from '@/shared/ui/section';
import { showToast } from '@/shared/utils/toast.utils';

import type { WorkspaceDetail } from '../api';
import { useUpdateWorkspace } from '../queries/workspaces.queries';
import { WorkspaceAvatar } from './WorkspaceAvatar';
import { WorkspaceCover } from './WorkspaceCover';

export interface WorkspaceImagesCardProps {
  wsId: string;
  workspace: WorkspaceDetail;
  /** Nhóm đã lưu trữ (`status === 'ARCHIVED'`) — cùng điều kiện khoá của `WorkspaceDetailsCard`. */
  disabled: boolean;
}

/**
 * Thẻ "Ảnh nhóm" trong `WorkspaceSettingsScreen` — đổi ảnh đại diện + ảnh bìa. Nơi gọi chỉ dựng
 * component này khi `myPermissions.canEdit` (cùng điều kiện `WorkspaceDetailsCard`) — sửa ảnh nhóm
 * là một quyền "sửa cài đặt nhóm", không tách quyền riêng. `disabled` (nhóm đã lưu trữ) khoá cả hai
 * nút đổi ảnh, cùng cách `WorkspaceDetailsCard` khoá ô tên/mô tả.
 *
 * Mỗi ô ảnh một `slot` riêng của `useDisplayImageUpload` (`workspace-avatar:<wsId>` /
 * `workspace-cover:<wsId>`) để hai hàng đợi tải không giẫm lên nhau, và hai mutation
 * `useUpdateWorkspace` RIÊNG để nút nào đang gửi thì CHỈ nút đó quay (`isPending` không dùng
 * chung). `onReady` PATCH THẲNG `avatarAssetId`/`coverAssetId` — ảnh không có nút "Lưu" riêng như
 * ô tên/mô tả, vì người dùng đã CHỌN XONG ảnh (khác lúc gõ dở tên).
 *
 * ⚠️ `reset()` gọi ngay sau khi mutation xong (thành công lẫn thất bại) — đúng hợp đồng của
 * `useDisplayImageUpload` ("gọi sau khi PATCH xong… hoặc khi PATCH lỗi"): asset đã tải xong rồi thì
 * hàng đợi cục bộ hết việc, `workspace.avatarUrl/coverUrl` từ cache mới (hoặc giữ nguyên nếu lỗi)
 * là nguồn hiển thị tiếp theo.
 */
export function WorkspaceImagesCard({ wsId, workspace, disabled }: WorkspaceImagesCardProps) {
  const updateAvatar = useUpdateWorkspace(wsId);
  const updateCover = useUpdateWorkspace(wsId);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [coverMenuOpen, setCoverMenuOpen] = useState(false);

  const reportError = (mutationError: unknown) => showToast('error', toErrorMessage(mutationError));

  const avatar = useDisplayImageUpload({
    slot: `workspace-avatar:${wsId}`,
    onReady: (assetId) =>
      updateAvatar.mutate(
        { avatarAssetId: assetId, expectedVersion: workspace.version },
        { onError: reportError, onSettled: () => avatar.reset() },
      ),
  });
  const cover = useDisplayImageUpload({
    slot: `workspace-cover:${wsId}`,
    onReady: (assetId) =>
      updateCover.mutate(
        { coverAssetId: assetId, expectedVersion: workspace.version },
        { onError: reportError, onSettled: () => cover.reset() },
      ),
  });

  const removeCover = () =>
    updateCover.mutate(
      { coverAssetId: null, expectedVersion: workspace.version },
      { onError: reportError },
    );

  return (
    <Section icon="image" title="Ảnh nhóm">
      <Card>
        <View className="gap-lg">
          <View className="items-center gap-sm">
            <WorkspaceAvatar avatarUrl={avatar.previewUri ?? workspace.avatarUrl} name={workspace.name} size="xl" />
            {/* ⛔ `items-center` của `View` cha KHÔNG căn được nút: lớp nhận chạm của `Button` mặc định `self-start` và `alignSelf` của
                chính nó luôn thắng — nút dạt trái dưới ảnh đại diện đang nằm giữa. Chỉ `pressableClassName` tới được lớp đó. */}
            <Button
              disabled={disabled || updateAvatar.isPending}
              label="Đổi ảnh đại diện"
              loading={avatar.busy || updateAvatar.isPending}
              pressableClassName="self-center"
              size="sm"
              variant="secondary"
              onPress={() => setAvatarMenuOpen(true)}
            />
            {avatar.failed ? (
              <Alert
                actions={<Button label="Thử lại" size="xs" variant="secondary" onPress={avatar.retry} />}
                description="Tải ảnh đại diện chưa thành công."
                tone="error"
              />
            ) : null}
          </View>

          <View className="gap-sm">
            <Text className="text-label-lg font-semibold text-fg-1">Ảnh bìa</Text>
            <WorkspaceCover
              coverPreset={workspace.coverPreset}
              coverUrl={cover.previewUri ?? workspace.coverUrl}
              workspaceId={wsId}
            />
            <Button
              disabled={disabled || updateCover.isPending}
              label="Đổi ảnh bìa"
              loading={cover.busy || updateCover.isPending}
              pressableClassName="self-center"
              size="sm"
              variant="secondary"
              onPress={() => setCoverMenuOpen(true)}
            />
            {cover.failed ? (
              <Alert
                actions={<Button label="Thử lại" size="xs" variant="secondary" onPress={cover.retry} />}
                description="Tải ảnh bìa chưa thành công."
                tone="error"
              />
            ) : null}
          </View>
        </View>
      </Card>

      <ActionMenuSheet
        items={imageSourceMenuItems({ onPick: (source) => void avatar.pick(source) })}
        title="Đổi ảnh đại diện"
        visible={avatarMenuOpen}
        onClose={() => setAvatarMenuOpen(false)}
      />
      <ActionMenuSheet
        items={imageSourceMenuItems({
          onPick: (source) => void cover.pick(source),
          onRemove: workspace.coverUrl ? removeCover : undefined,
          removeLabel: 'Gỡ ảnh bìa',
        })}
        title="Đổi ảnh bìa"
        visible={coverMenuOpen}
        onClose={() => setCoverMenuOpen(false)}
      />
    </Section>
  );
}
