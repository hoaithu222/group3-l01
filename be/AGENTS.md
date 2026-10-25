# Super App Backend — hướng dẫn cho AI Agents (Antigravity & Codex)

Áp dụng cho toàn bộ `be/`, cùng với `../GEMINI.md` hoặc `../AGENTS.md`. Các đường dẫn bên dưới
tính từ `be/`. Đọc `README.md`, `FOLDER_TREE.md` và các file liên quan trước
khi sửa. Ngữ cảnh sản phẩm nằm ở `../docs/notes.md`; trạng thái triển khai
nằm ở `docs/development-roadmap.md` và mã nguồn.

Antigravity (Gemini) đọc trực tiếp `GEMINI.md` (hoặc file này).

## Nguồn rules dùng chung

Trước khi sửa mã backend, đọc `GEMINI.md` hoặc sáu file quy tắc kỹ thuật sau.
Đây là bộ quy tắc kỹ thuật dùng chung cho cả Antigravity, Codex và Claude:

| File | Nội dung |
| --- | --- |
| `.claude/rules/architecture.md` | Phân tầng, cấu trúc module, dependency flow |
| `.claude/rules/api-patterns.md` | Controller factory, service DI, repository, pagination |
| `.claude/rules/error-handling.md` | AppError, catchAsync, ResponseUtils, error codes |
| `.claude/rules/validation-security.md` | Zod, auth/authz, sanitize, secrets |
| `.claude/rules/reuse-first.md` | Tra cứu các thành phần có sẵn trước khi tạo mới |
| `.claude/rules/code-style.md` | TypeScript strict, tên file, import, logging |

Khi cần quy trình hoặc tài liệu chi tiết, đọc thêm
`.claude/rules/development-rules.md`, `.claude/rules/primary-workflow.md` và
`.claude/rules/documentation-management.md`, với cách áp dụng cho Codex ở
mục cuối file này. Không cần nạp `CLAUDE.md` hoặc `.claude/CLAUDE.md` để tìm
lại các rules đã liệt kê ở đây.

## Kiến trúc và các điểm bắt buộc

- Stack hiện có: Express 4, TypeScript strict, Prisma với MongoDB, Redis,
  JWT, Socket.IO, Zod 3, Jest/Supertest. Kiểm tra `package.json` và lockfile
  khi cần biết phiên bản chính xác; không lấy phiên bản từ package app.
- Luồng: routes → controller → service → repository → database.
  `modules/` dùng `core/` và `infrastructure/`; `infrastructure/` dùng
  `core/`; `core/` không phụ thuộc tầng trên. Không import chéo module.
- Routes nối DI; controller factory dùng `catchAsync` và `ResponseUtils`.
  Business logic ở service; service nhận repository interface, không import
  Prisma trực tiếp. Giữ ngoại lệ module phẳng đã nêu trong `architecture.md`
  cho module đơn giản; `auth` và `users` dùng cấu trúc Full.
- Validate body/query/params bằng middleware Zod trước controller. Dùng
  middleware auth, phân quyền và rate limiting hiện có khi phù hợp endpoint.
- Throw AppError subclass; lấy mã từ `src/core/utils/error.codes.ts`;
  giữ `errorHandler` ở cuối chuỗi middleware.
- Không dùng `any`, không hardcode hoặc log secrets, không trả password hash
  và token nội bộ trong response. Dùng logger có sẵn thay `console.log`.
- Database hiện dùng `provider = "mongodb"` trong `prisma/schema.prisma`.
  Theo quy ước repo, đồng bộ schema bằng `npm run db:push`, không dùng
  `prisma migrate`. Giữ tương thích MongoDB khi thay dependency Prisma;
  không tự nâng major trong tác vụ khác.
- Storage đi qua `storage`/`getStorage()` trong `src/infrastructure/storage`;
  chọn Local/S3/Cloudinary bằng `STORAGE_TYPE`, không gọi SDK trực tiếp từ module.
- Tái sử dụng code trước; giữ file gọn, hướng tới dưới 200 dòng, bám naming
  và cấu trúc hiện có. Không đổi tên hàng loạt các utility cũ ngoài yêu cầu.

## Các điểm phải đối chiếu với mã nguồn

Một số ví dụ trong rules cũ chưa theo kịp base hiện tại. Khi đọc chúng:

- ID của User/RefreshToken/Session là MongoDB ObjectId (`@db.ObjectId`),
  không phải UUID. Không sao chép `z.string().uuid()` từ ví dụ validation
  cho các ID này; tra schema dùng chung trong `src/shared/` và DTO thực tế.
- Danh sách “5 middleware / 6 thư mục infrastructure” trong `reuse-first.md`
  không còn đầy đủ. Đã có sanitize, request ID, request logger và
  `src/infrastructure/error-tracker/`; tìm trong mã nguồn trước khi tạo mới.
- Sanitizer hiện dùng allowlist cho rich text và bỏ qua các trường nhạy cảm
  như password/token. Đọc `src/core/middlewares/sanitize.ts` và
  `src/core/utils/html-sanitizer.ts`; không thay bằng đoạn strip script đơn giản.
- Các đường dẫn dạng `core/...` trong ví dụ rules thực tế nằm dưới `src/`.
  Tên lệnh và dependency lấy từ `package.json`, không từ ví dụ ClaudeKit.

Các lưu ý này cập nhật những ví dụ lỗi thời, không cho phép bỏ validation,
auth hoặc sửa hành vi đang có chỉ vì thấy tài liệu khác mã nguồn.

## Quy trình AI Agent (Antigravity & Codex)

1. Đọc rules và code, xác định phạm vi; lập kế hoạch phù hợp độ phức tạp.
2. Triển khai theo pattern hiện có, xử lý lỗi và giữ API contract.
3. Sau thay đổi mã/cấu hình, chạy trong `be/`: `npm run build`,
   `npm run lint`, `npm test -- --runInBand`. Với thay đổi chỉ Markdown,
   áp dụng kiểm tra tài liệu trong `../AGENTS.md`.
4. Review diff, cập nhật tài liệu liên quan và báo cáo kết quả thực tế.

Đây là cách thực hiện workflow ClaudeKit bằng Codex: có thể tự thực hiện
các bước lập kế hoạch, kiểm thử, review và cập nhật docs. Việc rules Claude
nhắc tên `planner`, `tester`, `code-reviewer`, `docs-manager` không bắt buộc
khởi tạo các agent đó trong Codex. Chỉ dùng sub-agent khi phiên cho phép và
có công việc độc lập phù hợp; cung cấp phạm vi file và tiêu chí hoàn thành.

Khi cần kiến thức chuyên sâu, đọc skill liên quan có thật trong
`.claude/skills/` (ví dụ `backend-development`, `databases`, `ck-debug`,
`code-review`). Không giả định các lệnh `/ck:*` trong routing đã được cài.
Các quy tắc `team-coordination-rules.md` chỉ dành cho Claude Agent Teams;
không áp dụng các tool `TaskUpdate`/`SendMessage` như công cụ Codex.

Nếu cần lưu kế hoạch lớn, dùng `plans/<YYYYMMDD-HHmm>-<chu-de>/plan.md`
dưới `be/`; không phụ thuộc biến hoặc tên được hook Claude chèn vào.
Tài liệu như changelog chỉ cập nhật khi có liên quan và tồn tại, hoặc khi
tác vụ yêu cầu tạo; không dựng thêm cả bộ tài liệu mẫu cho chỉnh sửa nhỏ.

Không coi hook privacy của Claude là đang chạy trong Codex. Tuân thủ quyền
thực tế của phiên; nếu một công cụ chặn truy cập thì xử lý bằng cơ chế cấp
quyền có sẵn, không đổi sang shell khác để vượt chặn. Không chạy
`prisma:reset`, seed hoặc thao tác database chỉ để kiểm tra build/rules.
