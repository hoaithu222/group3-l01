import { memo } from 'react';
import { useWatch } from 'react-hook-form';

import { FileField, type UploadHandler } from '@/shared/ui';

import { BADGE_ICON_ACCEPT, BADGE_ICON_MAX_MB } from '../constants/badge-icon.constants';
import type { BadgeFormValues } from '../schemas/badge.schema';
import BadgeIcon from './BadgeIcon';

export interface BadgeIconFieldProps {
  /** Từ `useBadgeIconUpload` — tải lên `/assets` scope `BADGE`, trả id asset. */
  onUpload: UploadHandler;
}

/**
 * Ô ảnh huy hiệu của `BadgeFormModal` (admin.md p4-03 §2.2 "`UploadField` ảnh, asset scope `BADGE`"): kit2 `FileField` (chọn tệp, tiến
 * độ, huỷ/thử lại/gỡ) + xem trước bằng đúng `BadgeIcon` đang hiển thị ở bảng — ảnh thay cho emoji khi có, gỡ ảnh thì về emoji. Chỉ PNG/WebP
 * ≤ 512 KiB (BE kiểm lại). Ảnh đã tải mà chưa Lưu là asset chưa gắn — BE `assets.cleanup` dọn sau thời gian ân hạn.
 */
const BadgeIconField = memo(function BadgeIconField({ onUpload }: BadgeIconFieldProps) {
  const [name, emoji, icon] = useWatch<BadgeFormValues, ['name', 'emoji', 'icon']>({
    name: ['name', 'emoji', 'icon'],
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <BadgeIcon emoji={emoji ? emoji : null} iconAssetId={icon?.url ?? null} name={name || 'Huy hiệu'} size="lg" />
        <span className="text-caption-12 text-fg-3">Xem trước — ảnh hiển thị thay cho emoji khi có.</span>
      </div>
      <FileField
        accept={BADGE_ICON_ACCEPT}
        description="PNG hoặc WebP, tối đa 512 KiB (không hỗ trợ SVG, JPEG, GIF). Bỏ trống để dùng emoji."
        fileCardVariant="simple"
        label="Ảnh huy hiệu"
        maxSize={BADGE_ICON_MAX_MB}
        name="icon"
        variant="button"
        onUpload={onUpload}
      />
    </div>
  );
});

export default BadgeIconField;
