# Hướng dẫn và Quy tắc cho Antigravity (Gemini) — Super App Backend (Express/MongoDB)

Tài liệu này áp dụng cho toàn bộ thư mục `be/` trong Super App.
Đường dẫn bên dưới tính từ thư mục `be/`. Tham khảo thêm `../GEMINI.md` cho quy tắc toàn repository.
Ngữ cảnh sản phẩm chi tiết nằm tại `../docs/notes.md`; lộ trình phát triển tại `docs/development-roadmap.md`.

---

## 1. Tech Stack

| Tầng | Công nghệ | Lưu ý quan trọng |
| :--- | :--- | :--- |
| **Framework** | Express 4.18 | TypeScript strict mode |
| **Database** | Prisma 5.8 + **MongoDB Atlas** (`provider = "mongodb"`) | Chỉ dùng `npm run db:push`, **KHÔNG dùng `prisma migrate`** |
| **Cache** | Redis 4.6 | Key prefix, TTL tập trung |
| **Auth** | JWT | Access token ngắn hạn + Refresh token dài hạn |
| **Validation** | Zod **3.22** | Lưu ý Zod ở BE là **v3** (khác admin/app là v4) |
| **Logging** | Winston 3.11 | Thay thế hoàn toàn `console.log` |
| **Storage** | Cloudinary / AWS S3 / Local | Chọn qua env `STORAGE_TYPE` (`src/infrastructure/storage`) |
| **Real-time** | Socket.IO | Server singleton |
| **Testing** | Jest + Supertest | Chạy in-band |

> ⚠️ **CẢNH BÁO QUAN TRỌNG VỀ PRISMA:**
> Prisma ORM từ **v7 đã loại bỏ hỗ trợ MongoDB**. Tuyệt đối **KHÔNG nâng cấp lên Prisma v7** nếu hệ thống còn sử dụng MongoDB. Chỉ duy trì các bản v5.x hoặc v6.x ổn định.

---

## 2. Kiến trúc 3 tầng & Dependency Flow (BẮT BUỘC)

```
src/
├── core/                  # Tiện ích tái sử dụng (KHÔNG chứa business logic)
│   ├── config/            # Schema biến môi trường (Zod), cấu hình app
│   ├── constants/         # HTTP status codes, roles, enums
│   ├── exceptions/        # Phân cấp AppError (ValidationError, NotFoundError...)
│   ├── middlewares/       # Global middlewares (auth, validate, errorHandler, rateLimiter, sanitize, upload)
│   ├── types/             # Express type augmentations
│   └── utils/             # catchAsync, ResponseUtils, JwtUtils, error.codes
│
├── infrastructure/        # Tích hợp dịch vụ bên ngoài & Database
│   ├── database/          # Prisma client singleton (MongoDB Atlas)
│   ├── redis/             # Redis client singleton
│   ├── logger/            # Winston logger + createContextLogger
│   ├── mail/              # Nodemailer service
│   ├── storage/           # Abstraction: Local, S3, Cloudinary
│   └── socket/            # Socket.IO server
│
└── modules/               # Nghiệp vụ tự đóng gói (1 module = 1 business domain)
    └── {module-name}/
        ├── {module}.routes.ts                # Khai báo route + Nối Dependency Injection (DI)
        ├── controllers/{module}.controller.ts # Controller factory
        ├── services/{module}.service.ts       # Business logic thuần tuý
        ├── repositories/
        │   ├── {module}.repository.interface.ts  # Repository contract
        │   ├── {module}.repository.prisma.ts     # Triển khai Prisma DB
        │   └── {module}.repository.inmemory.ts   # Triển khai mock cho Unit Test
        ├── entities/{module}.interface.ts        # Domain entity
        ├── dtos/
        │   ├── create-{module}.dto.ts            # Zod create schema
        │   ├── update-{module}.dto.ts            # Zod update schema
        │   └── index.ts
        └── tests/                                # Unit + Integration tests
```

### Luồng phụ thuộc (Dependency Direction)
```
Routes → Controller → Service → Repository → Database
                                    ↓
                       Infrastructure (Redis, Mail, Storage...)
```

- **BẮT BUỘC**:
  - `modules/` được phép import từ `core/` và `infrastructure/`.
  - `infrastructure/` được phép import từ `core/`.
  - `core/` **KHÔNG ĐƯỢC** import từ `modules/` hay `infrastructure/`.
  - `modules/` **KHÔNG ĐƯỢC** import chéo từ module khác. Mọi giao tiếp liên module phải qua barrel công khai `@modules/{name}/public` (như `audit-log`, `assets`, `devices`, `notifications`, `messages`, `users`).

---

## 3. Quy tắc cốt lõi khi lập trình Backend

### 1. Controller Factory Pattern
- Controller được xuất dưới dạng factory nhận Service qua Dependency Injection.
- Controller **CHỈ LÀM 3 VIỆC**: nhận request data → gọi service → trả response qua `ResponseUtils`.
- **CẤM** đưa business logic vào controller.

```typescript
// modules/{feature}/controllers/{feature}.controller.ts
import { catchAsync } from '@core/utils/catchAsync';
import { ResponseUtils } from '@core/utils/response';
import type { Request, Response } from 'express';
import type { FeatureService } from '../services/{feature}.service';

export function createFeatureController(featureService: FeatureService) {
  const getList = catchAsync(async (req: Request, res: Response) => {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 10, 100);
    const { data, total } = await featureService.getMany(page, limit);
    const meta = {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    };
    ResponseUtils.paginated(res, { data, meta });
  });

  const getById = catchAsync(async (req: Request, res: Response) => {
    const item = await featureService.getById(req.params.id);
    ResponseUtils.success(res, item);
  });

  return { getList, getById };
}
```

### 2. Service Layer & Repository Pattern
- Business logic nằm trọn vẹn trong Service.
- Service nhận Repository Interface qua constructor injection; **CẤM** import Prisma client trực tiếp vào Service.

```typescript
// modules/{feature}/services/{feature}.service.ts
import { NotFoundError } from '@core/exceptions/AppError';
import type { IFeatureRepository } from '../repositories/{feature}.repository.interface';

export class FeatureService {
  constructor(private readonly repo: IFeatureRepository) {}

  async getById(id: string) {
    const item = await this.repo.findById(id);
    if (!item) {
      throw new NotFoundError('Không tìm thấy tài nguyên');
    }
    return item;
  }
}
```

### 3. Xử lý lỗi (AppError Hierarchy) & catchAsync
- Mọi async controller handler **BẮT BUỘC** bọc bởi `catchAsync`. Không tự try/catch trong controller để lỗi tự propagate về middleware `errorHandler`.
- Ném lỗi thông qua các subclass của `AppError` tại `src/core/exceptions/AppError.ts`:
  - `ValidationError` (400, `VAL_001`)
  - `UnauthorizedError` (401, `AUTH_002/003/004`)
  - `ForbiddenError` (403, `AUTH_005`)
  - `NotFoundError` (404, `RES_001`)
  - `ConflictError` (409, `RES_002`)
  - `TooManyRequestsError` (429, `RATE_001`)
  - `BadGatewayError` (502, `SYS_502`)
- Mã lỗi **BẮT BUỘC** khai báo tại `src/core/utils/error.codes.ts`, không dùng chuỗi tự do.

### 4. Chuẩn hoá Response Envelope (ResponseUtils)
- Thành công: `ResponseUtils.success(res, data, message, statusCode)`.
- Phân trang: `ResponseUtils.paginated(res, { data, meta })`. Cấu trúc meta gồm: `{ page, limit, total, totalPages, hasNext, hasPrev }`.

### 5. Validation & Bảo mật
- Mọi dữ liệu vào (body, query, params) **BẮT BUỘC** được validate qua middleware Zod trước khi tới controller.
- Sanitize dữ liệu input qua middleware `sanitize.ts` và tiện ích `html-sanitizer.ts`.
- **CẤM** dùng `any` trong TypeScript; dùng `unknown` hoặc kiểu dữ liệu tường minh.
- **CẤM** trả về `password`, password hash hay internal refresh tokens trong response.
- **CẤM** hardcode hoặc log credentials, token, secret keys.

---

## 4. Các điểm thực tế cần đối chiếu với mã nguồn

1. **Định danh ID**:
   - ID của User, RefreshToken, Session là **MongoDB ObjectId** (`@db.ObjectId`), **KHÔNG PHẢI UUID**.
   - Tuyệt đối không sao chép `z.string().uuid()` cho các trường ID MongoDB; dùng schema ObjectId dùng chung trong `@shared/`.
2. **Đồng bộ cơ sở dữ liệu**:
   - Chạy `npm run db:push` (`prisma db push`), không dùng `prisma migrate`.
3. **Cấu hình Path Aliases**:
   - `@/*` → `src/*`
   - `@core/*` → `src/core/*`
   - `@infrastructure/*` → `src/infrastructure/*`
   - `@modules/*` → `src/modules/*`
   - `@shared/*` → `src/shared/*`
4. **Giới hạn kích thước file**:
   - Giữ code ngắn gọn, hướng tới dưới 200 dòng/file. Nếu quá dài, hãy tách sub-services hoặc helper files.

---

## 5. Lệnh kiểm tra bắt buộc trước khi hoàn tất

Sau khi sửa mã nguồn hoặc cấu hình trong `be/`:
```bash
npm run build
npm run lint
npm test -- --runInBand
```
Cả 3 lệnh build TypeScript, kiểm tra lint và chạy test suite phải thành công trọn vẹn trước khi kết thúc tác vụ.
