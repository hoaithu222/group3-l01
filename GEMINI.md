# Super App — Hướng dẫn và Quy tắc cho Antigravity (Gemini)

Tài liệu này áp dụng cho toàn bộ repository `super-app`.
Mọi phiên làm việc với Antigravity đều **BẮT BUỘC** tuân thủ các quy tắc dưới đây.

---

## 1. Ngôn ngữ & Phạm vi

- **Ngôn ngữ phản hồi**: Luôn trả lời người dùng bằng **tiếng Việt**, trừ khi người dùng có yêu cầu rõ ràng dùng ngôn ngữ khác.
- **Phạm vi monorepo**: Repository gồm 3 package độc lập hoàn toàn, không có `package.json` ở thư mục gốc:
  - `admin/`: Trang web quản trị hệ thống (React 19, Vite, Tailwind CSS v4 CSS-first `@theme`, Radix UI, kit2, TanStack Query v5, Zustand v5, Zod v4).
  - `app/`: Ứng dụng di động (React Native 0.86, Expo SDK 57, Expo Router, NativeWind 4 / Tailwind 3.4, Zod v4).
  - `be/`: Backend API (Express.js, TypeScript strict, Prisma 5.8 + MongoDB Atlas, Redis, Socket.IO, Zod v3).
- **Phân tách ranh giới**:
  - Không nhập nhằng rules hay dependencies giữa các package.
  - Zod ở `admin/` và `app/` là **v4**; ở `be/` là **v3** — không copy schema trực tiếp qua lại giữa client và server.
  - Mỗi package có `package-lock.json`, cấu hình TypeScript và bộ script kiểm tra riêng.

---

## 2. Bảng điều hướng Rules chi tiết

Trước khi chỉnh sửa bất kỳ phần mã nguồn nào, phải đọc file rules tương ứng của thư mục đó:

| Phạm vi công việc | File hướng dẫn bắt buộc phải đọc |
| :--- | :--- |
| **Toàn bộ repository** | `GEMINI.md` và `AGENTS.md` ở gốc repo |
| **Trang web Admin (`admin/`)** | `admin/GEMINI.md`, `admin/AGENTS.md`, `admin/.claude/CLAUDE.md` và danh mục `admin/docs/rules/*.md` |
| **Ứng dụng Mobile (`app/`)** | `app/GEMINI.md`, `app/AGENTS.md`, `app/src/shared/ui/AGENTS.md` và danh mục `app/docs/rules/*.md` |
| **Component UI Mobile (`app/src/shared/ui/`)** | Bắt buộc đọc thêm `app/src/shared/ui/AGENTS.md` |
| **Backend API (`be/`)** | `be/GEMINI.md`, `be/AGENTS.md`, `be/CLAUDE.md`, `be/.claude/CLAUDE.md` và danh mục `be/.claude/rules/*.md` |
| **Tính năng liên quan nhiều package (App/Admin ↔ BE)** | Đối chiếu kỹ API contract ở cả client và server; không tự ý đổi contract một phía |
| **Yêu cầu sản phẩm, lộ trình** | `docs/notes.md`, `docs/modules/`, `docs/development-plan.md` và `be/docs/development-roadmap.md` |

---

## 3. Tóm tắt các quy tắc cốt lõi & Cấm kỵ theo từng package

Ngay cả khi bắt đầu phiên làm việc tại thư mục gốc, Antigravity phải ghi nhớ các cấm kỵ sau:

### Web Admin (`admin/`)
1. **`@/shared/ui` ("kit2") là nguồn DUY NHẤT cho mọi UI**. Tuân thủ 3R: REUSE (dùng lại) → EXTEND (mở rộng `tv()`) → CREATE (chỉ khi không trùng concept).
2. **CẤM TUYỆT ĐỐI**:
   - Viết raw `<button>`, `<input>`, `<select>`, `<table>` (phải dùng kit2).
   - Inline `<svg>` (dùng `<SystemIcon name="..." />`).
   - Hex màu trong `className`/`style` (phải dùng token từ `colors-theme.json`).
   - Raw Tailwind font `text-sm font-medium` (phải dùng `text-{scale}-{weight}`).
   - Import sâu `@/shared/ui/actions/Button` (luôn import qua barrel `@/shared/ui`).
   - Tự viết `useToggle`/`useModal` (dùng `useDisclosure`).
3. **CẤM persist access token vào `localStorage`**; refresh token lưu trong HttpOnly cookie do backend cấp.
4. **CẤM dùng `npx tsc --noEmit`** (kiểm tra 0 file do solution-style tsconfig; bắt buộc dùng `npm run typecheck` tức `tsc -b --noEmit`).

### Mobile App (`app/`)
1. **CẤM TẠO `src/app/`**: Expo Router ưu tiên thư mục này hơn `app/` ở gốc khiến toàn bộ cây route bị vô hiệu hoá. Vỏ ứng dụng nằm ở `src/shell/`.
2. **CẤM sửa file `*.generated.*`**: Phải sửa JSON nguồn trong `src/styles/` rồi chạy `npm run generate:styles`; sửa icon SVG trong `assets/icons/` rồi chạy `npm run generate:icons`.
3. **CẤM viết màu/cỡ chữ thô**: Cấm `bg-white`, `text-[17px]`, `style={{ color: '#fff' }}`. Phải dùng token ngữ nghĩa.
4. **CẤM đọc biến môi trường động `process.env[key]`**: Metro thay thế tĩnh lúc build nên sẽ ra `undefined`. Luôn viết đủ tên `process.env.EXPO_PUBLIC_*`.
5. **CẤM lưu refresh token ngoài kho khoá**: Bắt buộc dùng `expo-secure-store`, không dùng `AsyncStorage`.
6. **Mọi chữ PHẢI nằm trong `<Text>`**: Không dùng thẻ HTML (`<div>`, `<span>`).
7. **Quy tắc React Native / NativeWind**:
   - Không có `:hover`. Trạng thái bấm dùng `<Pressable>` với render prop `({ pressed }) => <View className={styles.root({ pressed })}>` (`className` không nhận hàm).
   - Thẻ mang `useAnimatedStyle` thì KHÔNG mang `className` (Reanimated sẽ xoá sạch style class).

### Backend (`be/`)
1. **Kiến trúc 3 tầng nghiêm ngặt**: `core/` (tiện ích) → `infrastructure/` (tích hợp/db) → `modules/` (nghiệp vụ).
   - `modules/` KHÔNG import chéo module khác (ngoại trừ các public services đã duyệt qua `@modules/{name}/public`).
   - Luồng bắt buộc: `Routes → Controller → Service → Repository → Database`.
2. **CẤM dùng `any` trong TypeScript**: Dùng `unknown` hoặc định nghĩa interface/type chuẩn xác.
3. **Controller Factory & Service DI**: Controller được tạo qua factory nhận Service qua DI; Service nhận Repository interface, không gọi trực tiếp Prisma.
4. **LUÔN dùng `catchAsync` & `ResponseUtils`**: Không tự try/catch trong controller; ném subclass của `AppError`; lấy mã lỗi từ `src/core/utils/error.codes.ts`.
5. **LUÔN validate input bằng middleware Zod** trước khi vào controller.
6. **Database & Prisma**:
   - Sử dụng Prisma 5.8 với MongoDB Atlas (`@db.ObjectId`).
   - ID là MongoDB ObjectId, **KHÔNG PHẢI UUID** (không dùng `z.string().uuid()` cho ID người dùng).
   - Đồng bộ database bằng `npm run db:push` (`prisma db push`), **KHÔNG dùng `prisma migrate`**.
   - **KHÔNG nâng cấp lên Prisma v7** vì Prisma v7 đã bỏ hỗ trợ MongoDB.

---

## 4. Hợp đồng Auth & API liên phân hệ

Ba package phải đồng bộ nghiêm ngặt theo hợp đồng:

| Thành phần | Chuẩn quy định | Ghi chú |
| :--- | :--- | :--- |
| **Refresh Token** | Web gửi cookie HttpOnly; Mobile gửi qua header/body | Endpoint: `POST /auth/refresh` |
| **User Profile** | `GET /auth/me` | Trả về `{ user: { id, email, role, roles[], permissions[] } }` |
| **Phân quyền** | Dạng `resource:action` (vd: `users:view`) | Role `admin` là super-role |
| **Response Envelope** | `{ success: true, data: T, message?: string, meta?: PaginationMeta }` | Sử dụng `ResponseUtils` ở BE |
| **Error Envelope** | `{ success: false, error: { code, message, details }, requestId }` | Chuẩn hoá qua `errorHandler` |
| **Phân trang** | `meta: { page, limit, total, totalPages, hasNext, hasPrev }` | Khớp `PaginationMeta` ở client |

---

## 5. Quy trình làm việc bắt buộc (Workflow)

Mỗi khi nhận yêu cầu sửa đổi hoặc bổ sung code:

1. **Kiểm tra trạng thái git**: Chạy `git status --short`; tuyệt đối giữ nguyên các thay đổi sẵn có của người dùng.
2. **Reuse First (Ưu tiên tái sử dụng)**:
   - Luôn đọc các file liên quan trước khi sửa.
   - Tìm kiếm component (`@/shared/ui`), middleware, service, repository, utility có sẵn trước khi tạo mới.
   - Giữ thay đổi gọn gàng, đúng phạm vi yêu cầu.
3. **Đối chiếu API Contract**:
   - Khi chỉnh sửa endpoint hoặc DTO, phải đối chiếu cả BE và client (App/Admin).
   - Không tự ý thay đổi contract chỉ ở một phía.
4. **Chạy các lệnh kiểm tra tương ứng**:
   - Sau khi code xong, bắt buộc chạy kiểm tra ở package liên quan (xem mục 6).
   - Tự sửa toàn bộ lỗi do thay đổi của mình gây ra.
   - Tuyệt đối không tắt rule linter, không dùng `@ts-ignore`/`@ts-expect-error` vô căn cứ, không sửa test gian lận chỉ để xanh kết quả.
5. **Báo cáo kết quả**:
   - Trình bày rõ ràng những gì đã hoàn thành.
   - Nêu cụ thể những phần chưa kiểm chứng được (nếu có lý do thiếu dependency, thiết bị hay dịch vụ ngoài).

---

## 6. Lệnh kiểm tra cho từng Package

Chạy npm trong đúng thư mục của package:

| Thư mục | Lệnh kiểm tra bắt buộc |
| :--- | :--- |
| `app/` | `npm run check`<br>*(Gồm: typecheck → lint → check:imports → check:classes → check:contrast → check:touch-targets → check:file-size → test)* |
| `be/` | `npm run build`<br>`npm run lint`<br>`npm test -- --runInBand` |
| `admin/` | `npm run check`<br>*(Gồm: typecheck → lint → import check → circular check → orphans check → test)* |
| Gốc repo | Nếu chỉ sửa Markdown/rules: kiểm tra liên kết, tên script, và chạy `git diff --check`. |

---

## 7. Nguyên tắc An toàn & Bảo mật

- **Không bao giờ ghi secrets** (API key, database URL, credentials, password...) vào commit, tài liệu hay log.
- **Không chạy `db:reset`, seed hay database push có rủi ro làm mất dữ liệu** trừ khi có yêu cầu cụ thể từ người dùng.
- **Không tự động triển khai hoặc thao tác môi trường production**.
