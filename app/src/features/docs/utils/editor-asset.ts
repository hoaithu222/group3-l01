/**
 * Module id của bundle soạn thảo `app/assets/collab/editor.html` (chép từ `collab/editor-web` bằng `npm run copy:app` — ⛔ đừng sửa tay
 * file HTML, nó là kết quả build một-file, CSP ghim hash sha256 của chính script bên trong).
 *
 * `html` đã có sẵn trong `assetExts` mặc định của Metro (`metro-config/defaults`), nên KHÔNG cần đổi `metro.config.js`. Tách `require` ra
 * file riêng để test mock được (Jest vẫn `require` được asset qua `jest-expo`, nhưng test không cần nạp 600 KB HTML).
 */
export function editorHtmlModule(): number {
  return require('../../../../assets/collab/editor.html') as number;
}
