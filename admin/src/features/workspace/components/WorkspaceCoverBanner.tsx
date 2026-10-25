import { ImagePreview } from '@/shared/ui';
import { cn } from '@/shared/utils/style/cn';

import type { AdminWorkspaceRow } from '../types/workspace.types';
import { coverPresetFor, WORKSPACE_COVER_GRADIENT } from '../utils/workspace-cover';

export interface WorkspaceCoverBannerProps {
  workspace: Pick<AdminWorkspaceRow, 'id' | 'name' | 'coverUrl' | 'coverPreset'>;
}

/**
 * Dải ảnh bìa đầu khối "Thông tin nhóm". Có `coverUrl` ⇒ ảnh gốc (object-cover, bấm để xem cỡ lớn khi soát ảnh vi
 * phạm); chưa có ảnh, hoặc ảnh tải lỗi (URL ký đã hết hạn, ảnh vừa bị gỡ) ⇒ nền gradient theo mẫu bìa, cùng màu với app.
 */
export default function WorkspaceCoverBanner({ workspace }: WorkspaceCoverBannerProps) {
  const preset = coverPresetFor(workspace.id, workspace.coverPreset);

  return (
    // Khung giữ chiều cao; `size="full"` cho ảnh lấp khung (`size-*` của ImagePreview không bị `h-*` ghi đè).
    <div className="h-28 w-full">
      <ImagePreview
        // URL mới (response sau luôn ký lại) ⇒ dựng lại, không kẹt ở nền dự phòng của lần tải lỗi trước.
        key={workspace.coverUrl ?? 'preset'}
        alt={`Ảnh bìa nhóm ${workspace.name}`}
        fallback={
          <div
            className={cn('size-full bg-gradient-to-br', WORKSPACE_COVER_GRADIENT[preset])}
            data-cover-preset={preset}
          />
        }
        preview
        rounded="md"
        size="full"
        src={workspace.coverUrl ?? undefined}
      />
    </div>
  );
}
