import { memo } from 'react';

import { Badge, ImagePreview } from '@/shared/ui';

import type { AdminStudyItem } from '../../types/study-set-moderation.types';
import { studyItemImages, studyItemMedia } from '../../utils/study-items';

const dash = <span className="text-fg-5">—</span>;

/** Vỏ chờ khi thumbnail chưa có / không tải được (URL ký hết hạn) — quay về nhãn chữ như trước khi có ảnh. */
const IMAGE_FALLBACK = (
  <Badge color="info" size="sm" variant="tinted">
    Có ảnh
  </Badge>
);

export interface StudyItemMediaCellProps {
  item: AdminStudyItem;
}

/**
 * Ô "Đính kèm" của bảng mục học: thumbnail ảnh mặt trước/sau và ảnh từng lựa chọn (BE ký thumbnail ≤ 60 s, chỉ bộ PUBLIC), bấm để phóng to.
 * Ảnh chưa xử lý xong hoặc không tải được (URL đã hết hạn) → nhãn "Có ảnh" thay vì ô vỡ. Âm thanh chỉ có id nên chỉ hiện nhãn "Có âm thanh".
 */
const StudyItemMediaCell = memo(function StudyItemMediaCell({ item }: StudyItemMediaCellProps) {
  const { image, audio } = studyItemMedia(item);
  if (!image && !audio) return dash;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {studyItemImages(item).map((img) => (
        <ImagePreview
          key={img.key}
          alt={img.alt}
          fallback={IMAGE_FALLBACK}
          preview
          rounded="md"
          size="lg"
          src={img.url ?? undefined}
        />
      ))}
      {audio && (
        <Badge color="info" size="sm" variant="tinted">
          Có âm thanh
        </Badge>
      )}
    </div>
  );
});

export default StudyItemMediaCell;
