/**
 * FileBadge — 40px icon "tag" hiển thị loại file (PDF, DOCX, XLSX, …).
 *
 * Tự suy ra icon + màu từ tên file qua `getFileTypeStyle`. Có thể override
 * `skin` hoặc `iconName` để force render. Hỗ trợ render image thumbnail
 * (truyền `previewUrl` cho ảnh) thay icon nếu file là ảnh.
 */
import { memo } from 'react';
import { SystemIcon, type SystemIconName } from '@/shared/ui/icons/Icons';
import { cn } from '@/shared/utils/style/cn';
import { fileBadgeStyles, type FileBadgeSize, type FileBadgeSkin } from './upload.theme';
import { getFileTypeStyle } from './upload.utils';

export interface FileBadgeProps {
  /** Tên file (để auto-detect icon + skin). Nếu truyền `iconName`/`skin` thì override. */
  name: string;
  /** Override skin (màu badge) */
  skin?: FileBadgeSkin;
  /** Override icon name (SystemIcon) */
  iconName?: SystemIconName;
  /** Override label hiển thị (PDF, DOCX, …) — pass empty "" để ẩn */
  label?: string;
  size?: FileBadgeSize;
  /** URL ảnh preview — nếu có sẽ render <img> thay icon */
  previewUrl?: string;
  className?: string;
}

const FileBadge = memo(function FileBadge({
  name,
  skin,
  iconName,
  label,
  size = 'md',
  previewUrl,
  className,
}: FileBadgeProps) {
  const auto = getFileTypeStyle(name);
  const finalSkin = skin ?? auto.skin;
  const finalIcon = (iconName ?? auto.iconName) as SystemIconName;
  const finalLabel = label ?? auto.label;

  const slots = fileBadgeStyles({ skin: finalSkin, size });

  if (previewUrl) {
    return (
      <span className={cn(slots.root({ class: className }), 'p-0')}>
        <img alt={name} className="absolute inset-0 size-full object-cover" src={previewUrl} />
      </span>
    );
  }

  return (
    <span className={slots.root({ class: className })}>
      <SystemIcon className={slots.icon()} name={finalIcon} />
      {finalLabel ? <span className={slots.label()}>{finalLabel}</span> : null}
    </span>
  );
});

export default FileBadge;
