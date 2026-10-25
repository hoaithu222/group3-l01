import { useCallback, useState } from 'react';

import type { ResourceDto } from '../api';
import { runFileAction, type FileAction } from '../utils/run-file-action';

type Subject = Pick<ResourceDto, 'id' | 'mime' | 'name' | 'size' | 'type' | 'version'>;

/**
 * Tải về / Chia sẻ / Mở bằng ứng dụng khác cho MỘT tệp (app.md p3-01 §3 thanh
 * dưới của Preview). Một thao tác tại một thời điểm (`busy`) — bấm lần hai khi
 * đang chạy bị bỏ qua thay vì tải hai lần. Lỗi → toast tiếng Việt, không ném.
 */
export function useResourceFileActions(resource: Subject | undefined) {
  const [busy, setBusy] = useState<FileAction | null>(null);
  const [progress, setProgress] = useState(0);

  const run = useCallback(
    async (action: FileAction) => {
      if (!resource || busy) return;
      setBusy(action);
      setProgress(0);
      try {
        await runFileAction(resource, action, setProgress);
      } finally {
        setBusy(null);
      }
    },
    [busy, resource],
  );

  return { busy, progress, run };
}
