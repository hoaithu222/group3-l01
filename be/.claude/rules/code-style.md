# Code Style & Conventions

## TypeScript

- **Strict mode**: KHÔNG dùng `any` — dùng `unknown` nếu cần
- **Path aliases**: `@core/`, `@infrastructure/`, `@modules/`, `@shared/`
- **`import type`**: Luôn dùng khi chỉ import types

```typescript
// ✅ ĐÚNG
import { catchAsync } from '@core/utils/catchAsync';
import type { Request, Response } from 'express';
import type { IUserRepository } from '../repositories/user.repository.interface';

// ❌ SAI
import { catchAsync } from '../../../core/utils/catchAsync';
```

## Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Class | PascalCase | `UserService`, `PrismaUserRepository` |
| Interface | PascalCase, prefix `I` cho repos | `IUserRepository`, `User` |
| Function | camelCase | `createUserController`, `catchAsync` |
| Constant | UPPER_SNAKE_CASE | `ROLES`, `ErrorCode` |
| DTO schema | camelCase + Schema | `createUserSchema`, `loginSchema` |
| DTO type | PascalCase + Dto | `CreateUserDto`, `LoginDto` |
| File — module | kebab-case | `user.routes.ts`, `auth.service.ts` |
| File — class | kebab-case | `user.repository.prisma.ts` |
| File — DTO | kebab-case | `create-user.dto.ts` |
| Directory | kebab-case | `error-tracker/`, `rate-limiter/` |

## Method Order trong Class

```typescript
class FeatureService {
  constructor(private readonly repo: IFeatureRepository) {}

  // 1. Public methods (CRUD order)
  async getById(id: string) { ... }
  async getMany(page: number, limit: number) { ... }
  async create(data: CreateDto) { ... }
  async update(id: string, data: UpdateDto) { ... }
  async delete(id: string) { ... }

  // 2. Private helpers
  private sanitize(item: Feature) { ... }
  private validate(data: unknown) { ... }
}
```

## Async/Await

```typescript
// ✅ ĐÚNG — Parallel khi independent
const [users, total] = await Promise.all([
  prisma.user.findMany({ take: limit, skip: offset }),
  prisma.user.count(),
]);

// ❌ SAI — Sequential khi có thể parallel
const users = await prisma.user.findMany({ take: limit, skip: offset });
const total = await prisma.user.count(); // Chờ users xong mới chạy
```

## Logging

```typescript
import { createContextLogger } from '@infrastructure/logger';

// ✅ ĐÚNG — Structured context logging
const log = createContextLogger({ requestId: req.requestId, userId: req.user?.id });
log.info('User created', { userId: newUser.id });
log.error('Failed to send email', { error: err.message, to: email });

// ❌ SAI
console.log('User created');  // KHÔNG dùng console.log
```

## Comments

- Comment khi business logic phức tạp
- KHÔNG comment code hiển nhiên
- JSDoc cho public methods của service
- Tiếng Việt hoặc tiếng Anh đều được
