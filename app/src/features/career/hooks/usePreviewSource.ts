import { useEffect, useState } from 'react';

import { getAccessToken } from '@/core/api/session';
import { ensureFreshAccessToken } from '@/core/api/session.fresh';

export interface PreviewSource {
  uri: string;
  headers: { Authorization: string };
}

export type PreviewSourceState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; source: PreviewSource };

/**
 * Nguồn nạp cho WebView xem trước: `{ uri, headers: { Authorization } }` (app.md p6-07 §3). Xem trước là `GET /me/portfolio/preview` CÓ ĐĂNG NHẬP — WebView không đi qua interceptor của axios nên tự
 * gắn token, và ⚠️ chỉ gửi header cho yêu cầu ĐẦU (ảnh con không có — BE cố ý nhúng ảnh dạng data URI, `PREVIEW_PAGE_CSP`). Vì vậy phải làm mới token TRƯỚC khi nạp: token hết hạn giữa chừng là
 * 401 trắng trang mà WebView không tự làm mới được.
 *
 * `attempt` đổi (nút "Thử lại"), `uri` đổi (thử mẫu khác) hoặc `revision` đổi (hồ sơ/dự án vừa được lưu — khung xem trước cạnh danh sách ở máy tính bảng) ⇒ xin token và nạp lại. Kết quả gắn với khoá
 * `uri#attempt#revision` nên khi khoá đổi, trạng thái quay về `loading` NGAY (không cần setState đồng bộ trong effect) — WebView bị tháo rồi dựng lại, đó là cách chắc chắn buộc nó nạp lại KÈM header mới. ⚠️ Đổi prop `source` cùng uri hoặc gọi `reload()` có thể bị bỏ qua / không gửi lại
 * `Authorization` (theo cách RNC WebView chạy trên Android — chưa kiểm trên máy thật), nên không dùng.
 */
export function usePreviewSource(uri: string, attempt: number, revision = ''): PreviewSourceState {
  const key = `${uri}#${String(attempt)}#${revision}`;
  const [result, setResult] = useState<{ key: string; source: PreviewSource | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const fresh = await ensureFreshAccessToken();
      const token = getAccessToken();
      if (cancelled) return;
      setResult({
        key,
        source: fresh && token ? { headers: { Authorization: `Bearer ${token}` }, uri } : null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [key, uri]);

  if (result?.key !== key) return { status: 'loading' };
  return result.source ? { source: result.source, status: 'ready' } : { status: 'error' };
}
