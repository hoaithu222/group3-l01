import { useCallback, useEffect, useState } from 'react';

import { resourcesService, type ResourceDto, type ResourceUrlVariant } from '../api';
import {
  cachePathFor,
  findCachedFile,
  startDownload,
  type FileDownload,
} from '../utils/resource-files';

export type DownloadedFileState =
  | { status: 'downloading'; progress: number }
  | { status: 'error'; error: unknown }
  | { status: 'idle' }
  | { status: 'ready'; uri: string };

type Subject = Pick<ResourceDto, 'id' | 'name' | 'size' | 'version'>;

/**
 * Tải tệp về cache tạm (`FileSystem.cacheDirectory/resources/…`) kèm tiến độ —
 * PDF cần tệp CỤC BỘ (app.md p3-01 §3): `react-native-pdf` đọc `file://`, và tải
 * về trước cho tiến độ "tải xong mới vẽ" mà ST-02 đo (≤ 3 s sau khi tải xong).
 *
 * `enabled = false` ⇒ `idle` (vd đang chờ biết module PDF dùng được, hoặc chặn vì
 * dữ liệu di động — app.md §7). ⚠️ URL ký xin NGAY trước khi tải (hết hạn sau
 * 60 s nên không giữ từ trước). Rời màn giữa chừng ⇒ dừng + xoá bản dở; tải xong
 * thì file ở lại tới khi rời màn xem trước (`removeResourceCache`) hoặc đăng xuất.
 *
 * ⚠️ Kết quả gắn với KHOÁ của lượt tải (`id:version:variant:attempt`) và trạng
 * thái ban đầu được SUY RA từ đầu vào thay vì `setState` trong effect — effect chỉ
 * `setState` trong callback bất đồng bộ (`react-hooks/set-state-in-effect`), và
 * khi tệp/biến thể đổi thì kết quả của lượt cũ tự bị bỏ qua. Phụ thuộc theo TỪNG
 * trường nguyên thuỷ: `resource` là object mới ở mỗi lần refetch.
 */
export function useDownloadedFile(
  resource: Subject | undefined,
  variant: ResourceUrlVariant,
  enabled = true,
): DownloadedFileState & { retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; value: DownloadedFileState } | null>(null);
  const id = resource?.id;
  const name = resource?.name;
  const size = resource?.size;
  const version = resource?.version;
  const active = enabled && id !== undefined;
  const key = `${id}:${version}:${variant}:${attempt}`;

  useEffect(() => {
    if (id === undefined || name === undefined || size === undefined || version === undefined)
      return;
    if (!enabled) return;
    const subject: Subject = { id, name, size, version };
    let cancelled = false;
    let finished = false;
    let download: FileDownload | undefined;
    const publish = (value: DownloadedFileState) => {
      if (!cancelled) setResult({ key, value });
    };

    void (async () => {
      const cached = await findCachedFile(subject, variant);
      if (cached) return { uri: cached };
      const { url } = await resourcesService.url(id, variant);
      if (cancelled) return null;
      download = startDownload(url, cachePathFor(subject, variant), (ratio) =>
        publish({ status: 'downloading', progress: ratio }),
      );
      return { uri: await download.promise };
    })()
      .then((outcome) => {
        finished = true;
        if (outcome) publish({ status: 'ready', uri: outcome.uri });
      })
      .catch((error: unknown) => {
        finished = true;
        publish({ status: 'error', error });
      });

    return () => {
      cancelled = true;
      if (!finished) void download?.cancel();
    };
  }, [id, name, size, version, variant, enabled, key]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const value: DownloadedFileState =
    result?.key === key
      ? result.value
      : active
        ? { status: 'downloading', progress: 0 }
        : { status: 'idle' };
  return { ...value, retry };
}
