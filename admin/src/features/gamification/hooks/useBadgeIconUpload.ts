import { useCallback, useMemo, useState } from 'react';

import { createAssetUploader } from '@/core/uploads/asset-upload.adapter';
import type { UploadHandler } from '@/shared/ui';

/**
 * Handler tải ảnh huy hiệu cho `FileField` (`onUpload`): `POST /assets { scope: 'BADGE', kind: 'IMAGE' }` → tải nội dung → chờ `READY`,
 * trả **id asset** (giá trị của ô là id đó — `BadgeFormValues.icon.url`). `uploading` để form khoá nút Lưu trong lúc tải: giá trị của ô
 * chỉ cập nhật khi tải XONG, bấm Lưu giữa chừng sẽ lưu huy hiệu mà lặng lẽ không có ảnh mới.
 */
export function useBadgeIconUpload(): { onUpload: UploadHandler; uploading: boolean } {
  const [pending, setPending] = useState(0);
  const upload = useMemo(() => createAssetUploader({ scope: 'BADGE', kind: 'IMAGE' }), []);

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
