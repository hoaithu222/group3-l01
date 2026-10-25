import { useCallback, useMemo, useState } from 'react';

import { createAssetUploader } from '@/core/uploads/asset-upload.adapter';
import type { UploadHandler } from '@/shared/ui';

/**
 * Handler tải ảnh địa điểm cho `FileField` (`onUpload`, `multiple`): `POST /assets { scope: 'LOCATION', kind: 'IMAGE' }`
 * → tải nội dung → chờ `READY`, trả **id asset** (giá trị mỗi ảnh là id đó — `LocationFormValues.photos[].url`, xem
 * `location.schema.ts`). `uploading` khoá nút Lưu trong lúc còn ảnh đang tải (cùng mẫu `useBadgeIconUpload`).
 */
export function useLocationPhotoUpload(): { onUpload: UploadHandler; uploading: boolean } {
  const [pending, setPending] = useState(0);
  const upload = useMemo(() => createAssetUploader({ scope: 'LOCATION', kind: 'IMAGE' }), []);

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
