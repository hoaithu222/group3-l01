import { useCallback, useMemo, useState } from 'react';

import { createAssetUploader } from '@/core/uploads/asset-upload.adapter';
import type { UploadHandler } from '@/shared/ui';

/**
 * Handler tải tệp cho `FileField` (`onUpload`) của doanh nghiệp: `POST /assets { scope: 'COMPANY' }` → tải nội dung → chờ `READY`, trả **id asset** (giá trị của ô là id đó).
 * `IMAGE` = logo (JPEG/PNG/WebP ≤ 2 MiB); `FILE` = JD đính kèm lời mời (PDF ≤ 5 MiB) — BE siết MIME/dung lượng theo scope `COMPANY` và kiểm lại chủ tệp khi gắn.
 * `uploading` để form khoá nút Gửi trong lúc tải: giá trị của ô chỉ cập nhật khi tải XONG, bấm Gửi giữa chừng sẽ gửi mà lặng lẽ thiếu tệp.
 */
export function useCompanyAssetUpload(kind: 'IMAGE' | 'FILE'): {
  onUpload: UploadHandler;
  uploading: boolean;
} {
  const [pending, setPending] = useState(0);
  const upload = useMemo(() => createAssetUploader({ scope: 'COMPANY', kind }), [kind]);

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
