import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';

import { editorHtmlModule } from './editor-asset';

let cached: string | null = null;

/**
 * Nội dung HTML của bundle soạn thảo, đọc MỘT lần rồi giữ trong bộ nhớ (≈ 0,6 MB) — mở tài liệu thứ hai là tức thì.
 *
 * Đường đi: `Asset.fromModule` → `downloadAsync()` (dev: tải từ Metro về cache; release: chép từ tài nguyên APK ra file cache) →
 * `localUri` là file thật → đọc thành chuỗi → đưa cho WebView bằng `source={{ html }}`. ✅ Lý do KHÔNG dùng `source={{ uri: 'file://…' }}`:
 * nạp từ `file://` buộc bật `allowFileAccess` (Android) / `allowingReadAccessToURL` (iOS) — cho trang chạm hệ thống tệp của app. Với
 * `html` tại chỗ WebView không có quyền đọc tệp nào (`allowFileAccess={false}`), và gốc trang là `about:blank` khớp `originWhitelist`.
 *
 * ⚠️ Chưa kiểm trên máy thật (Android/iOS release): nếu `downloadAsync` trả `localUri` rỗng ở bản build lạ thì hàm ném lỗi và màn
 * hiện "Không mở được trình soạn thảo" thay vì trắng trang.
 */
export async function loadEditorHtml(): Promise<string> {
  if (cached) return cached;
  const asset = await Asset.fromModule(editorHtmlModule()).downloadAsync();
  if (!asset.localUri) throw new Error('editor.html: không có localUri sau khi tải asset');
  const html = await FileSystem.readAsStringAsync(asset.localUri);
  if (!html.includes('editor-root'))
    throw new Error('editor.html: nội dung không đúng bundle soạn thảo');
  cached = html;
  return html;
}
