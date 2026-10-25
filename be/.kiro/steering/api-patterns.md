---
inclusion: always
---

# API Patterns (BẮT BUỘC)

## 1. Controller Factory Pattern

```typescript
// modules/{feature}/controllers/{feature}.controller.ts
import { catchAsync } from '@core/utils/catchAsync';
import { ResponseUtils } from '@core/utils/response';
import type { Request, Response } from 'express';

export function createFeatureController(featureService: FeatureService) {

  const getList = catchAsync(async (req: Request, res: Response) => {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 10, 100);
    const { data, total } = await featureService.getMany(page, limit);
    const meta = {
      page, limit, total,
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

  const create = catchAsync(async (req: Request, res: Response) => {
    const item = await featureService.create(req.body);
    ResponseUtils.success(res, item, "Tạo thành công", 201);
  });

  const update = catchAsync(async (req: Request, res: Response) => {
    const item = await featureService.update(req.params.id, req.body);
    ResponseUtils.success(res, item, "Cập nhật thành công");
  });

  const remove = catchAsync(async (req: Request, res: Response) => {
    await featureService.delete(req.params.id);
    ResponseUtils.success(res, null, "Xóa thành công");
  });

  return { getList, getById, create, update, remove };
}
```

---

## 2. Service Layer Pattern

```typescript
// modules/{feature}/services/{feature}.service.ts
import { NotFoundError, ConflictError } from '@core/exceptions/AppError';
import type { IFeatureRepository } from '../repositories/{feature}.repository.interface';

export class FeatureService {
  constructor(private readonly repo: IFeatureRepository) {}

  async getById(id: string): Promise<Feature> {
    const item = await this.repo.findById(id);
    if (!item) throw new NotFoundError("Không tìm thấy");
    return this.sanitize(item);
  }

  async getMany(page: number, limit: number) {
    const offset = (page - 1) * limit;
    return this.repo.findMany(limit, offset);
  }

  async create(data: CreateFeatureDto): Promise<Feature> {
    // Business logic, validation, transformation
    const existing = await this.repo.findByUniqueField(data.code);
    if (existing) throw new ConflictError("Mã đã tồn tại");
    return this.repo.create(data);
  }

  async update(id: string, data: UpdateFeatureDto): Promise<Feature> {
    const item = await this.repo.update(id, data);
    if (!item) throw new NotFoundError("Không tìm thấy");
    return this.sanitize(item);
  }

  async delete(id: string): Promise<void> {
    const success = await this.repo.delete(id);
    if (!success) throw new NotFoundError("Không tìm thấy");
  }

  private sanitize(item: Feature): Feature {
    // Remove sensitive fields
    const { internalField, ...rest } = item;
    return rest as Feature;
  }
}
```

---

## 3. Repository Interface Pattern

```typescript
// modules/{feature}/repositories/{feature}.repository.interface.ts
export interface IFeatureRepository {
  findById(id: string): Promise<Feature | null>;
  findMany(limit: number, offset: number): Promise<{ data: Feature[]; total: number }>;
  create(input: CreateFeatureInput): Promise<Feature>;
  update(id: string, input: UpdateFeatureInput): Promise<Feature | null>;
  delete(id: string): Promise<boolean>;
}
```

```typescript
// modules/{feature}/repositories/{feature}.repository.prisma.ts
import { prisma } from '@infrastructure/database';

export class PrismaFeatureRepository implements IFeatureRepository {
  async findById(id: string): Promise<Feature | null> {
    const record = await prisma.feature.findUnique({ where: { id } });
    return record ? this.mapToEntity(record) : null;
  }

  async findMany(limit: number, offset: number) {
    const [data, total] = await Promise.all([
      prisma.feature.findMany({ take: limit, skip: offset, orderBy: { createdAt: 'desc' } }),
      prisma.feature.count(),
    ]);
    return { data: data.map(this.mapToEntity), total };
  }

  async update(id: string, input: UpdateFeatureInput): Promise<Feature | null> {
    try {
      const record = await prisma.feature.update({
        where: { id },
        data: { ...(input.name !== undefined && { name: input.name }) },
      });
      return this.mapToEntity(record);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return null;
      }
      throw err;
    }
  }

  private mapToEntity(record: PrismaFeature): Feature {
    return { id: record.id, name: record.name, /* ... */ };
  }
}
```

---

## 4. Routes — DI Wiring

```typescript
// modules/{feature}/{feature}.routes.ts
import { Router } from 'express';
import { authenticateToken, requireRoles } from '@core/middlewares/auth';
import { validateBody, validateParams } from '@core/middlewares/validate';
import { PrismaFeatureRepository } from './repositories/{feature}.repository.prisma';
import { FeatureService } from './services/{feature}.service';
import { createFeatureController } from './controllers/{feature}.controller';
import { createFeatureSchema, updateFeatureSchema } from './dtos';

const router = Router();

// DI wiring
const repo = new PrismaFeatureRepository();
const service = new FeatureService(repo);
const controller = createFeatureController(service);

// Routes
router.use(authenticateToken);

router.get('/', controller.getList);
router.get('/:id', validateParams(idParamSchema), controller.getById);
router.post('/', validateBody(createFeatureSchema), controller.create);
router.patch('/:id', validateParams(idParamSchema), validateBody(updateFeatureSchema), controller.update);
router.delete('/:id', requireRoles([ROLES.ADMIN]), validateParams(idParamSchema), controller.remove);

export default router;
```

---

## 5. Entity & DTO Patterns

### Entity Interface (domain model)

```typescript
// modules/{feature}/entities/{feature}.interface.ts
export interface Feature {
  id: string;
  name: string;
  code: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FeatureCreateInput {
  name: string;
  code: string;
  status?: string;
}

export interface FeatureUpdateInput {
  name?: string;
  code?: string;
  status?: string;
}
```

### DTO — Zod Schema (request validation)

```typescript
// modules/{feature}/dtos/create-{feature}.dto.ts
import { z } from 'zod';

export const createFeatureSchema = z.object({
  name: z.string().min(1, "Tên bắt buộc"),
  code: z.string().min(1, "Mã bắt buộc").max(50),
  status: z.enum(["active", "inactive"]).optional().default("active"),
});

export type CreateFeatureDto = z.infer<typeof createFeatureSchema>;
```

---

## Quy tắc

1. **Controller KHÔNG chứa business logic** — chỉ parse request, gọi service, trả response
2. **Service nhận repository interface** — KHÔNG import Prisma trực tiếp
3. **Repository handle Prisma errors** — Map P2025 → null, các error khác propagate
4. **Routes file wires DI** — Instantiate repo → service → controller
5. **Pagination cap limit** — `Math.min(limit, 100)` tránh query quá lớn
6. **Conditional updates** — Chỉ update fields được cung cấp: `...(input.name !== undefined && { name: input.name })`
