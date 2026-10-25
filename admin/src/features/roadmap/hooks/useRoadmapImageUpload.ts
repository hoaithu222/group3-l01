import { useCallback, useMemo, useState } from 'react';

import { createAssetUploader } from '@/core/uploads/asset-upload.adapter';
import type { UploadHandler } from '@/shared/ui';

/**
 * Handler tải ảnh scope `ROADMAP` cho `FileField`/`Upload` (`onUpload`): `POST /assets { scope:
 * 'ROADMAP', kind: 'IMAGE' }` → tải nội dung → chờ `READY`, trả **id asset**. Dùng cho ảnh bìa môn
 * (`SubjectFormFields`) và ảnh buổi (`MediaManager`) — cùng cổng tải, chỉ khác nơi asset được gắn
 * (`AssetLink` `ROADMAP_SUBJECT_COVER`/`ROADMAP_LESSON`, BE gắn khi lưu). `uploading` để form/nút Lưu
 * khoá trong lúc tải — như `useBadgeIconUpload`.
 */
export function useRoadmapImageUpload(): { onUpload: UploadHandler; uploading: boolean } {
  const [pending, setPending] = useState(0);
  const upload = useMemo(() => createAssetUploader({ scope: 'ROADMAP', kind: 'IMAGE' }), []);

  const onUpload = useCallback<UploadHandler>(
    async (file, helpers) => {
      setPending((n) => n + 1);
      try {
        return await upload(file, helpers);
      } finally {
        setPending((n) => n - 1);
      }
    },
    [upload],
  );

  return { onUpload, uploading: pending > 0 };
}
