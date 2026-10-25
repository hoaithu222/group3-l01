# collab — hướng dẫn cho AI Agents

Áp dụng cho toàn bộ `collab/` (package thứ tư của repo), cùng với `../AGENTS.md`. Trả lời người dùng bằng tiếng Việt.
Đọc `README.md` (giao thức WebSocket + hợp đồng nội bộ với BE) trước khi sửa.

## Phạm vi

- Service Node 20 + TypeScript strict (CommonJS): Hocuspocus 3.4.4 + Yjs, Express nhỏ cho `/health`, `/metrics`, `/internal/*`.
- **Không** có DB, **không** đọc/ghi Mongo, **không** import mã từ `be/`, `app/`, `admin/` (và ngược lại). Hai phía chỉ gặp nhau qua hợp đồng ở README §3–§4;
  đổi hợp đồng (URL, claim token, mã đóng, header, JSON) phải sửa README + `be/` + client (`collab/editor-web`, `app/`) trong cùng đợt.
- `editor-web/` (bundle Vite/Tiptap 3 cho WebView, README §10) là package riêng của phần app: có `package.json`/lockfile riêng (npm), bị loại khỏi tsconfig/eslint/Docker của server. Đừng thêm dependency
  editor vào `package.json` của server. Giữ `@hocuspocus/provider` (editor-web) **cùng phiên bản chính xác** với server; các gói `@tiptap/*` cùng một phiên bản (peer dependency đòi đúng). Kiểu bridge ở `editor-web/src/bridge-protocol.ts`
  là hợp đồng với `app/`: đổi một tin ⇒ tăng `BRIDGE_VERSION` + sửa `app/` trong cùng đợt.
- Thêm loại tài nguyên (vd bảng trắng): thêm một dòng vào `src/resource-kinds.ts` + bật trong `COLLAB_KINDS`; không hard-code `doc` ở nơi khác.

## Lệnh kiểm tra (chạy trong `collab/`)

| Thay đổi | Lệnh |
| --- | --- |
| Mã nguồn/cấu hình/test | `npm run check` (= `tsc --noEmit` + `eslint .` + `vitest run`) |
| Chạm Redis/nhiều instance | thêm `REDIS_URL=redis://127.0.0.1:6379 npx vitest run tests/redis.test.ts` (bỏ qua nếu không có Redis; ghi rõ bước bị chặn) |
| Chạm `editor-web/**` | trong `collab/editor-web/`: `npm run check` (tsc + eslint + vitest, có e2e với server collab thật khi `collab/node_modules` đã cài); đổi bundle/CSP/schema thêm `npm run build`; `npm run copy:app` chỉ khi được giao ghi vào `app/` |
| Chỉ Markdown | kiểm đường dẫn/tên script/bảng biến môi trường khớp `.env.example` + `git diff --check` |

Không tắt rule lint/`tsc`, không `any` (dùng `unknown`), không `console.*` (dùng `src/logger.ts`), không sửa test cho khớp lỗi.
Cài thư viện: `npm install <pkg>` trong `collab/`, dùng `package-lock.json` hiện có; giữ Hocuspocus server/provider/redis **cùng phiên bản chính xác**.

## Điểm dễ sai (đã trả giá)

- Hook của Hocuspocus chạy nền (`onStoreDocument`) mà ném lỗi → unhandled rejection làm sập tiến trình và MẤT state trong RAM. `PersistenceExtension.onStoreDocument` không được ném;
  lỗi BE → giữ state + thử lại + chặn dỡ document (`beforeUnloadDocument` ném `UnloadBlocked`).
- `Connection.close()` của Hocuspocus 3.x chỉ gửi tin CLOSE trong luồng, **không** đóng socket thô → dùng `closeLiveConnection()`.
- Provider 3.4.4 phản hồi lại cả awareness của người khác → validate danh tính chỉ với state thuộc kết nối gửi (`message-guard.ts`).
- `onAuthenticate` ném **`AuthDenied`** (không kế thừa `Error`, không có `message`) để Hocuspocus không `console.error` mỗi lần từ chối bình thường.
- Provider tự nối lại ~1 s sau mọi lần đóng → server phải đóng socket có mã/`reason` rõ ràng; client phải tự `disconnect()` với `forbidden`/`not-found`.
- Test dùng WebSocket + BE giả bằng HTTP thật (cổng ngẫu nhiên). Bí mật giả chỉ đặt trong `tests/fixtures/` (gitleaks cho phép thư mục này).
- editor-web: `y-tiptap` tự XOÁ khỏi Y.Doc chung node mà schema máy đó không dựng được ⇒ đổi tập node/mark = thay đổi phá vỡ tương thích với app cũ (test "KHOÁ SCHEMA" ở `editor-web/tests/editor-collab.test.ts` nhắc việc này); ảnh chỉ lưu `assetId` (không `src`), nội dung Yjs không được chứa URL.
- editor-web: sự kiện đóng có thể tới HAI lần (CLOSE trong luồng code 1000 rồi đóng thô 44xx) và provider nối lại sau ~1 s ⇒ xử lý phải idempotent + `disconnect()` ngay khi dừng (`connection.ts`); `socket.connect()` không có tác dụng khi socket chưa đóng hẳn.
- editor-web: test e2e dùng `ws` (từ `collab/node_modules`) làm `WebSocketPolyfill` — WebSocket global của Node lệch lớp `Event` với jsdom; vitest cảnh báo "Yjs was already imported" (hai bản yjs: editor-web và collab) là vô hại vì hai bên chỉ trao đổi byte.
- Giới hạn Hz awareness của bảng trắng BỎ tin bằng cách ghi 0 vào "số client" của bộ đệm (Hocuspocus không cho hook bỏ qua tin) ⇒ phụ thuộc Hocuspocus 3.4.4, test `whiteboard.test.ts` khoá hành vi; extension `awareness-rate-limit` phải đứng SAU `message-guard`.
- Provider phản hồi awareness của người khác ⇒ O(N²) tin; client bảng trắng phải lọc `origin !== provider` (README §3.3), nếu không 20–30 client đã bị đóng `rate-limited`.
