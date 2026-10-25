#!/usr/bin/env ts-node
/**
 * ============================================================================
 * MODULE GENERATOR — Tự động tạo module CRUD hoàn chỉnh
 * ============================================================================
 *
 * Sử dụng:
 *   npm run gen:module -- <moduleName> [field1:type field2:type ...]
 *
 * Ví dụ:
 *   npm run gen:module -- product name:string price:number description:string?
 *   npm run gen:module -- category name:string slug:string
 *   npm run gen:module -- order totalAmount:number status:string userId:string
 *
 * Kiểu dữ liệu hỗ trợ:
 *   string, number, boolean, Date
 *   Thêm ? để đánh dấu optional: description:string?
 *
 * Kết quả tạo ra:
 *   src/modules/<name>/
 *   ├── <name>.routes.ts
 *   ├── controllers/
 *   │   └── <name>.controller.ts
 *   ├── services/
 *   │   └── <name>.service.ts
 *   ├── repositories/
 *   │   ├── <name>.repository.interface.ts
 *   │   ├── <name>.repository.prisma.ts
 *   │   ├── <name>.repository.inmemory.ts
 *   │   └── index.ts
 *   ├── entities/
 *   │   └── <name>.interface.ts
 *   ├── dtos/
 *   │   ├── create-<name>.dto.ts
 *   │   ├── update-<name>.dto.ts
 *   │   └── index.ts
 *   └── tests/
 *       └── <name>.service.test.ts
 * ============================================================================
 */

import * as fs from "fs";
import * as path from "path";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function toPascalCase(s: string): string {
  return s
    .replace(/[-_](\w)/g, (_, c) => c.toUpperCase())
    .replace(/^(\w)/, (_, c) => c.toUpperCase());
}

function toCamelCase(s: string): string {
  const pascal = toPascalCase(s);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function toKebabCase(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();
}

function toSnakeCase(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
}

function plural(s: string): string {
  if (s.endsWith("y") && !/[aeiou]y$/i.test(s)) return s.slice(0, -1) + "ies";
  if (s.endsWith("s") || s.endsWith("x") || s.endsWith("sh") || s.endsWith("ch"))
    return s + "es";
  return s + "s";
}

// ─── Field parsing ────────────────────────────────────────────────────────────

interface Field {
  name: string;
  type: string; // string | number | boolean | Date
  optional: boolean;
  tsType: string;
  zodType: string;
  prismaType: string;
  defaultValue?: string;
}

function parseField(raw: string): Field {
  const [namePart, typePart] = raw.split(":");
  if (!typePart) {
    console.error(`❌ Field "${raw}" thiếu kiểu dữ liệu. Dùng format: name:type`);
    process.exit(1);
  }
  const optional = typePart.endsWith("?");
  const baseType = typePart.replace("?", "").toLowerCase();

  const typeMap: Record<string, { tsType: string; zodType: string; prismaType: string }> = {
    string: {
      tsType: "string",
      zodType: 'z.string().min(1, "Không được để trống")',
      prismaType: "String",
    },
    number: {
      tsType: "number",
      zodType: "z.number()",
      prismaType: "Float",
    },
    int: {
      tsType: "number",
      zodType: "z.number().int()",
      prismaType: "Int",
    },
    boolean: {
      tsType: "boolean",
      zodType: "z.boolean()",
      prismaType: "Boolean",
    },
    bool: {
      tsType: "boolean",
      zodType: "z.boolean()",
      prismaType: "Boolean",
    },
    date: {
      tsType: "Date",
      zodType: "z.coerce.date()",
      prismaType: "DateTime",
    },
    text: {
      tsType: "string",
      zodType: "z.string()",
      prismaType: "String @db.Text",
    },
    json: {
      tsType: "unknown",
      zodType: "z.any()",
      prismaType: "Json",
    },
  };

  const mapped = typeMap[baseType];
  if (!mapped) {
    console.error(
      `❌ Kiểu "${baseType}" không hỗ trợ. Các kiểu hợp lệ: ${Object.keys(typeMap).join(", ")}`
    );
    process.exit(1);
  }

  return {
    name: toCamelCase(namePart),
    type: baseType,
    optional,
    tsType: mapped.tsType,
    zodType: optional ? `${mapped.zodType}.optional()` : mapped.zodType,
    prismaType: mapped.prismaType + (optional ? "?" : ""),
  };
}

// ─── Template generators ─────────────────────────────────────────────────────

function genEntity(Pascal: string, fields: Field[]): string {
  const fieldLines = fields
    .map((f) => `  ${f.name}${f.optional ? "?" : ""}: ${f.tsType};`)
    .join("\n");

  const createFieldLines = fields
    .map((f) => `  ${f.name}${f.optional ? "?" : ""}: ${f.tsType};`)
    .join("\n");

  const updateFieldLines = fields.map((f) => `  ${f.name}?: ${f.tsType};`).join("\n");

  return `export interface ${Pascal} {
  id: string;
${fieldLines}
  createdAt: Date;
  updatedAt: Date;
}

export interface ${Pascal}CreateInput {
${createFieldLines}
}

export interface ${Pascal}UpdateInput {
${updateFieldLines}
}
`;
}

function genRepoInterface(Pascal: string, camel: string): string {
  return `import type { ${Pascal}, ${Pascal}CreateInput, ${Pascal}UpdateInput } from "../entities/${toKebabCase(camel)}.interface";

/**
 * I${Pascal}Repository — interface cho ${camel} repository.
 * Impl: InMemory${Pascal}Repository (test), Prisma${Pascal}Repository (production).
 */
export interface I${Pascal}Repository {
  findById(id: string): Promise<${Pascal} | null>;
  findMany(limit: number, offset: number): Promise<{ data: ${Pascal}[]; total: number }>;
  create(input: ${Pascal}CreateInput): Promise<${Pascal}>;
  update(id: string, input: ${Pascal}UpdateInput): Promise<${Pascal} | null>;
  delete(id: string): Promise<boolean>;
}
`;
}

function genRepoPrisma(Pascal: string, camel: string, fields: Field[]): string {
  const kebab = toKebabCase(camel);

  const mapFields = fields
    .map((f) => `      ${f.name}: record.${f.name}${f.optional ? " ?? undefined" : ""},`)
    .join("\n");

  const mapRecordTypeFields = fields
    .map(
      (f) =>
        `    ${f.name}: ${f.tsType}${f.optional ? " | null" : ""};`
    )
    .join("\n");

  const createDataFields = fields
    .map((f) => {
      if (f.optional) return `        ...(input.${f.name} !== undefined && { ${f.name}: input.${f.name} }),`;
      return `        ${f.name}: input.${f.name},`;
    })
    .join("\n");

  const updateDataFields = fields
    .map((f) => `        ...(input.${f.name} !== undefined && { ${f.name}: input.${f.name} }),`)
    .join("\n");

  return `import type { I${Pascal}Repository } from "./${kebab}.repository.interface";
import type { ${Pascal}, ${Pascal}CreateInput, ${Pascal}UpdateInput } from "../entities/${kebab}.interface";
import { prisma } from "../../../infrastructure/database";

export class Prisma${Pascal}Repository implements I${Pascal}Repository {
  private static mapRecord(record: {
    id: string;
${mapRecordTypeFields}
    createdAt: Date;
    updatedAt: Date;
  }): ${Pascal} {
    return {
      id: record.id,
${mapFields}
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  async findById(id: string): Promise<${Pascal} | null> {
    const record = await prisma.${camel}.findUnique({ where: { id } });
    return record ? Prisma${Pascal}Repository.mapRecord(record) : null;
  }

  async findMany(limit = 10, offset = 0): Promise<{ data: ${Pascal}[]; total: number }> {
    const [records, total] = await prisma.$transaction([
      prisma.${camel}.findMany({ skip: offset, take: limit, orderBy: { createdAt: "desc" } }),
      prisma.${camel}.count(),
    ]);
    return { data: records.map(Prisma${Pascal}Repository.mapRecord), total };
  }

  async create(input: ${Pascal}CreateInput): Promise<${Pascal}> {
    const record = await prisma.${camel}.create({
      data: {
${createDataFields}
      },
    });
    return Prisma${Pascal}Repository.mapRecord(record);
  }

  async update(id: string, input: ${Pascal}UpdateInput): Promise<${Pascal} | null> {
    try {
      const record = await prisma.${camel}.update({
        where: { id },
        data: {
${updateDataFields}
        },
      });
      return Prisma${Pascal}Repository.mapRecord(record);
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await prisma.${camel}.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }
}
`;
}

function genRepoInMemory(Pascal: string, camel: string, fields: Field[]): string {
  const kebab = toKebabCase(camel);

  const createFields = fields
    .map((f) => `      ${f.name}: input.${f.name}${f.optional ? "" : ""},`)
    .join("\n");

  const updateFields = fields
    .map(
      (f) => `      ...(input.${f.name} !== undefined && { ${f.name}: input.${f.name} }),`
    )
    .join("\n");

  return `import type { I${Pascal}Repository } from "./${kebab}.repository.interface";
import type { ${Pascal}, ${Pascal}CreateInput, ${Pascal}UpdateInput } from "../entities/${kebab}.interface";

const store = new Map<string, ${Pascal}>();

function nextId(): string {
  return \`\${Date.now()}-\${Math.random().toString(36).slice(2, 9)}\`;
}

export class InMemory${Pascal}Repository implements I${Pascal}Repository {
  static clearStore(): void {
    store.clear();
  }

  async findById(id: string): Promise<${Pascal} | null> {
    return store.get(id) ?? null;
  }

  async findMany(limit = 10, offset = 0): Promise<{ data: ${Pascal}[]; total: number }> {
    const arr = Array.from(store.values());
    return { data: arr.slice(offset, offset + limit), total: arr.length };
  }

  async create(input: ${Pascal}CreateInput): Promise<${Pascal}> {
    const now = new Date();
    const item: ${Pascal} = {
      id: nextId(),
${createFields}
      createdAt: now,
      updatedAt: now,
    };
    store.set(item.id, item);
    return item;
  }

  async update(id: string, input: ${Pascal}UpdateInput): Promise<${Pascal} | null> {
    const existing = store.get(id);
    if (!existing) return null;
    const updated: ${Pascal} = {
      ...existing,
${updateFields}
      updatedAt: new Date(),
    };
    store.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return store.delete(id);
  }
}
`;
}

function genRepoIndex(Pascal: string, kebab: string): string {
  return `export type { I${Pascal}Repository } from "./${kebab}.repository.interface";
export { Prisma${Pascal}Repository } from "./${kebab}.repository.prisma";
export { InMemory${Pascal}Repository } from "./${kebab}.repository.inmemory";
`;
}

function genService(Pascal: string, camel: string): string {
  const kebab = toKebabCase(camel);
  return `import type { I${Pascal}Repository } from "../repositories/${kebab}.repository.interface";
import type { ${Pascal}, ${Pascal}CreateInput, ${Pascal}UpdateInput } from "../entities/${kebab}.interface";
import { NotFoundError } from "../../../core/exceptions";

export class ${Pascal}Service {
  constructor(private readonly repo: I${Pascal}Repository) {}

  async getById(id: string): Promise<${Pascal}> {
    const item = await this.repo.findById(id);
    if (!item) throw new NotFoundError("Không tìm thấy ${camel}");
    return item;
  }

  async getMany(page = 1, limit = 10): Promise<{ data: ${Pascal}[]; total: number }> {
    const offset = (page - 1) * limit;
    return this.repo.findMany(limit, offset);
  }

  async create(input: ${Pascal}CreateInput): Promise<${Pascal}> {
    return this.repo.create(input);
  }

  async update(id: string, input: ${Pascal}UpdateInput): Promise<${Pascal}> {
    const item = await this.repo.update(id, input);
    if (!item) throw new NotFoundError("Không tìm thấy ${camel}");
    return item;
  }

  async delete(id: string): Promise<void> {
    const ok = await this.repo.delete(id);
    if (!ok) throw new NotFoundError("Không tìm thấy ${camel}");
  }
}
`;
}

function genController(Pascal: string, camel: string): string {
  const kebab = toKebabCase(camel);
  const pluralName = plural(camel);
  const PluralPascal = capitalize(pluralName);

  return `import type { Request, Response } from "express";
import { ${Pascal}Service } from "../services/${kebab}.service";
import { ResponseUtils } from "../../../core/utils";
import { catchAsync } from "../../../core/utils/catchAsync";
import type { PaginatedResponse } from "../../../core/utils/response";

export function create${Pascal}Controller(${camel}Service: ${Pascal}Service) {
  const get${PluralPascal} = catchAsync(async (req: Request, res: Response) => {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 10, 100);
    const { data, total } = await ${camel}Service.getMany(page, limit);
    const payload: PaginatedResponse<(typeof data)[0]> = {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
    ResponseUtils.paginated(res, payload, "Lấy danh sách ${camel} thành công");
  });

  const get${Pascal}ById = catchAsync(async (req: Request, res: Response) => {
    const item = await ${camel}Service.getById(req.params.id);
    ResponseUtils.success(res, item, "Lấy thông tin ${camel} thành công");
  });

  const create${Pascal} = catchAsync(async (req: Request, res: Response) => {
    const item = await ${camel}Service.create(req.body);
    ResponseUtils.success(res, item, "Tạo ${camel} thành công", 201);
  });

  const update${Pascal} = catchAsync(async (req: Request, res: Response) => {
    const item = await ${camel}Service.update(req.params.id, req.body);
    ResponseUtils.success(res, item, "Cập nhật ${camel} thành công");
  });

  const delete${Pascal} = catchAsync(async (req: Request, res: Response) => {
    await ${camel}Service.delete(req.params.id);
    ResponseUtils.success(res, null, "Xóa ${camel} thành công");
  });

  return {
    get${PluralPascal},
    get${Pascal}ById,
    create${Pascal},
    update${Pascal},
    delete${Pascal},
  };
}
`;
}

function genCreateDto(Pascal: string, fields: Field[]): string {
  const zodFields = fields
    .map((f) => `  ${f.name}: ${f.zodType},`)
    .join("\n");

  return `import { z } from "zod";

export const create${Pascal}Schema = z.object({
${zodFields}
});

export type Create${Pascal}Dto = z.infer<typeof create${Pascal}Schema>;
`;
}

function genUpdateDto(Pascal: string, fields: Field[]): string {
  const zodFields = fields
    .map((f) => {
      // Trong update, tất cả field đều optional
      const base = f.zodType.replace(".optional()", "");
      return `  ${f.name}: ${base}.optional(),`;
    })
    .join("\n");

  return `import { z } from "zod";

export const update${Pascal}Schema = z.object({
${zodFields}
});

export type Update${Pascal}Dto = z.infer<typeof update${Pascal}Schema>;
`;
}

function genDtoIndex(Pascal: string, kebab: string): string {
  return `export { create${Pascal}Schema, type Create${Pascal}Dto } from "./create-${kebab}.dto";
export { update${Pascal}Schema, type Update${Pascal}Dto } from "./update-${kebab}.dto";
`;
}

function genRoutes(Pascal: string, camel: string, kebab: string): string {
  const pluralName = plural(camel);
  const PluralPascal = capitalize(pluralName);

  return `import { Router } from "express";
import { z } from "zod";
import { create${Pascal}Controller } from "./controllers/${kebab}.controller";
import { validateBody, validateParams, authenticateToken } from "../../core/middlewares";
import { create${Pascal}Schema, update${Pascal}Schema } from "./dtos";
import { ${Pascal}Service } from "./services/${kebab}.service";
import { Prisma${Pascal}Repository } from "./repositories";

const router = Router();
const ${camel}Repo = new Prisma${Pascal}Repository();
const ${camel}Service = new ${Pascal}Service(${camel}Repo);
const ${camel}Controller = create${Pascal}Controller(${camel}Service);

router.use(authenticateToken);

const idParamSchema = z.object({ id: z.string().min(1, "ID không hợp lệ") });

router.get("/", ${camel}Controller.get${PluralPascal});
router.get("/:id", validateParams(idParamSchema), ${camel}Controller.get${Pascal}ById);
router.post("/", validateBody(create${Pascal}Schema), ${camel}Controller.create${Pascal});
router.patch(
  "/:id",
  validateParams(idParamSchema),
  validateBody(update${Pascal}Schema),
  ${camel}Controller.update${Pascal}
);
router.delete(
  "/:id",
  validateParams(idParamSchema),
  ${camel}Controller.delete${Pascal}
);

export default router;
`;
}

function genTest(Pascal: string, camel: string, kebab: string, fields: Field[]): string {
  const requiredFields = fields.filter((f) => !f.optional);
  const createInput = requiredFields
    .map((f) => {
      if (f.tsType === "string") return `      ${f.name}: "test-${f.name}",`;
      if (f.tsType === "number") return `      ${f.name}: 100,`;
      if (f.tsType === "boolean") return `      ${f.name}: true,`;
      if (f.tsType === "Date") return `      ${f.name}: new Date(),`;
      return `      ${f.name}: null,`;
    })
    .join("\n");

  const firstField = requiredFields[0];
  const updateValue =
    firstField?.tsType === "string"
      ? `"updated-${firstField.name}"`
      : firstField?.tsType === "number"
      ? "999"
      : firstField?.tsType === "boolean"
      ? "false"
      : `"updated"`;

  return `import { ${Pascal}Service } from "../services/${kebab}.service";
import { InMemory${Pascal}Repository } from "../repositories/${kebab}.repository.inmemory";
import { NotFoundError } from "../../../core/exceptions";

describe("${Pascal}Service", () => {
  let service: ${Pascal}Service;
  let repo: InMemory${Pascal}Repository;

  beforeEach(() => {
    InMemory${Pascal}Repository.clearStore();
    repo = new InMemory${Pascal}Repository();
    service = new ${Pascal}Service(repo);
  });

  describe("create()", () => {
    it("tạo ${camel} mới thành công", async () => {
      const item = await service.create({
${createInput}
      });
      expect(item.id).toBeDefined();${
        firstField
          ? `\n      expect(item.${firstField.name}).toBe(${
              firstField.tsType === "string"
                ? `"test-${firstField.name}"`
                : firstField.tsType === "number"
                ? "100"
                : "true"
            });`
          : ""
      }
    });
  });

  describe("getById()", () => {
    it("trả về ${camel} khi tìm thấy", async () => {
      const created = await service.create({
${createInput}
      });
      const found = await service.getById(created.id);
      expect(found.id).toBe(created.id);
    });

    it("ném NotFoundError khi id không tồn tại", async () => {
      await expect(service.getById("non-existent")).rejects.toThrow(NotFoundError);
    });
  });

  describe("update()", () => {
    it("cập nhật ${camel} thành công", async () => {
      const created = await service.create({
${createInput}
      });${
        firstField
          ? `
      const updated = await service.update(created.id, { ${firstField.name}: ${updateValue} });
      expect(updated.${firstField.name}).toBe(${updateValue});`
          : `
      const updated = await service.update(created.id, {});
      expect(updated.id).toBe(created.id);`
      }
    });

    it("ném NotFoundError khi update ${camel} không tồn tại", async () => {
      await expect(service.update("nobody", {})).rejects.toThrow(NotFoundError);
    });
  });

  describe("delete()", () => {
    it("xóa ${camel} thành công", async () => {
      const created = await service.create({
${createInput}
      });
      await expect(service.delete(created.id)).resolves.not.toThrow();
      await expect(service.getById(created.id)).rejects.toThrow(NotFoundError);
    });

    it("ném NotFoundError khi xóa ${camel} không tồn tại", async () => {
      await expect(service.delete("fake-id")).rejects.toThrow(NotFoundError);
    });
  });

  describe("getMany()", () => {
    it("trả về danh sách phân trang", async () => {
      await service.create({
${createInput}
      });
      await service.create({
${createInput}
      });
      const { data, total } = await service.getMany(1, 10);
      expect(total).toBe(2);
      expect(data).toHaveLength(2);
    });
  });
});
`;
}

function genPrismaModel(Pascal: string, camel: string, fields: Field[]): string {
  const tableName = toSnakeCase(plural(camel));
  const prismaFields = fields
    .map((f) => {
      const colName = toSnakeCase(f.name);
      const needsMap = colName !== f.name;
      return `  ${f.name.padEnd(16)} ${f.prismaType}${needsMap ? `    @map("${colName}")` : ""}`;
    })
    .join("\n");

  return `
model ${Pascal} {
  id               String   @id @default(uuid())
${prismaFields}
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt      @map("updated_at")

  @@map("${tableName}")
}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║              MODULE GENERATOR - Base Express                 ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Sử dụng:                                                    ║
║    npm run gen:module -- <name> [field:type ...]              ║
║                                                              ║
║  Ví dụ:                                                      ║
║    npm run gen:module -- product name:string price:number     ║
║    npm run gen:module -- category name:string slug:string     ║
║    npm run gen:module -- post title:string content:text       ║
║                                                              ║
║  Kiểu dữ liệu:                                              ║
║    string  - chuỗi văn bản                                   ║
║    number  - số thực (Float)                                  ║
║    int     - số nguyên (Int)                                  ║
║    boolean - true/false                                       ║
║    date    - ngày tháng (DateTime)                            ║
║    text    - văn bản dài (Text)                               ║
║    json    - dữ liệu JSON                                    ║
║                                                              ║
║  Thêm ? để đánh dấu optional:                                ║
║    description:string?  image:string?                         ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);
    process.exit(0);
  }

  const moduleName = args[0];
  const rawFields = args.slice(1);

  if (rawFields.length === 0) {
    console.error("❌ Cần ít nhất 1 field. Ví dụ: npm run gen:module -- product name:string price:number");
    process.exit(1);
  }

  const Pascal = toPascalCase(moduleName);
  const camel = toCamelCase(moduleName);
  const kebab = toKebabCase(moduleName);
  const pluralKebab = toKebabCase(plural(camel));
  const fields = rawFields.map(parseField);

  const baseDir = path.resolve(__dirname, "..", "src", "modules", plural(kebab));

  // Kiểm tra module đã tồn tại chưa
  if (fs.existsSync(baseDir)) {
    console.error(`❌ Module "${plural(kebab)}" đã tồn tại tại: ${baseDir}`);
    console.error("   Xóa thư mục cũ hoặc đổi tên module.");
    process.exit(1);
  }

  // Tạo thư mục
  const dirs = [
    baseDir,
    path.join(baseDir, "controllers"),
    path.join(baseDir, "services"),
    path.join(baseDir, "repositories"),
    path.join(baseDir, "entities"),
    path.join(baseDir, "dtos"),
    path.join(baseDir, "tests"),
  ];
  dirs.forEach((d) => fs.mkdirSync(d, { recursive: true }));

  // Ghi các file
  const files: [string, string][] = [
    // Entity
    [path.join(baseDir, "entities", `${kebab}.interface.ts`), genEntity(Pascal, fields)],
    // Repository
    [
      path.join(baseDir, "repositories", `${kebab}.repository.interface.ts`),
      genRepoInterface(Pascal, camel),
    ],
    [
      path.join(baseDir, "repositories", `${kebab}.repository.prisma.ts`),
      genRepoPrisma(Pascal, camel, fields),
    ],
    [
      path.join(baseDir, "repositories", `${kebab}.repository.inmemory.ts`),
      genRepoInMemory(Pascal, camel, fields),
    ],
    [path.join(baseDir, "repositories", "index.ts"), genRepoIndex(Pascal, kebab)],
    // Service
    [path.join(baseDir, "services", `${kebab}.service.ts`), genService(Pascal, camel)],
    // Controller
    [
      path.join(baseDir, "controllers", `${kebab}.controller.ts`),
      genController(Pascal, camel),
    ],
    // DTOs
    [path.join(baseDir, "dtos", `create-${kebab}.dto.ts`), genCreateDto(Pascal, fields)],
    [path.join(baseDir, "dtos", `update-${kebab}.dto.ts`), genUpdateDto(Pascal, fields)],
    [path.join(baseDir, "dtos", "index.ts"), genDtoIndex(Pascal, kebab)],
    // Routes
    [path.join(baseDir, `${kebab}.routes.ts`), genRoutes(Pascal, camel, kebab)],
    // Tests
    [
      path.join(baseDir, "tests", `${kebab}.service.test.ts`),
      genTest(Pascal, camel, kebab, fields),
    ],
  ];

  files.forEach(([filePath, content]) => {
    fs.writeFileSync(filePath, content, "utf-8");
  });

  // ─── Auto-register Prisma model ───────────────────────────────────────────
  const prismaSnippet = genPrismaModel(Pascal, camel, fields);
  const schemaPath = path.resolve(__dirname, "..", "prisma", "schema.prisma");
  let prismaAutoRegistered = false;

  if (fs.existsSync(schemaPath)) {
    const schemaContent = fs.readFileSync(schemaPath, "utf-8");
    if (!schemaContent.includes(`model ${Pascal} {`)) {
      fs.appendFileSync(schemaPath, "\n" + prismaSnippet + "\n", "utf-8");
      prismaAutoRegistered = true;
    }
  }

  // ─── Auto-register route trong router.ts ─────────────────────────────────
  const routerPath = path.resolve(__dirname, "..", "src", "router.ts");
  const routeImport = `import ${camel}Routes from "./modules/${plural(kebab)}/${kebab}.routes";`;
  const routeUse = `router.use("/${pluralKebab}", ${camel}Routes);`;
  let routeAutoRegistered = false;

  if (fs.existsSync(routerPath)) {
    let routerContent = fs.readFileSync(routerPath, "utf-8");
    if (!routerContent.includes(routeImport)) {
      // Thêm import ở cuối danh sách import
      const lastImportIndex = routerContent.lastIndexOf("\nimport ");
      if (lastImportIndex !== -1) {
        const endOfLastImport = routerContent.indexOf("\n", lastImportIndex + 1);
        routerContent =
          routerContent.slice(0, endOfLastImport + 1) +
          routeImport +
          "\n" +
          routerContent.slice(endOfLastImport + 1);
      }

      // Thêm router.use trước export default
      const exportIndex = routerContent.lastIndexOf("export default router");
      if (exportIndex !== -1) {
        routerContent =
          routerContent.slice(0, exportIndex) +
          routeUse +
          "\n\n" +
          routerContent.slice(exportIndex);
      }

      fs.writeFileSync(routerPath, routerContent, "utf-8");
      routeAutoRegistered = true;
    }
  }

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  ✅ Module "${Pascal}" đã được tạo thành công!               ║
╚══════════════════════════════════════════════════════════════╝

📁 Thư mục: src/modules/${plural(kebab)}/

📄 Files đã tạo:
   ├── ${kebab}.routes.ts
   ├── controllers/${kebab}.controller.ts
   ├── services/${kebab}.service.ts
   ├── repositories/
   │   ├── ${kebab}.repository.interface.ts
   │   ├── ${kebab}.repository.prisma.ts
   │   ├── ${kebab}.repository.inmemory.ts
   │   └── index.ts
   ├── entities/${kebab}.interface.ts
   ├── dtos/
   │   ├── create-${kebab}.dto.ts
   │   ├── update-${kebab}.dto.ts
   │   └── index.ts
   └── tests/${kebab}.service.test.ts

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 AUTO-CONFIGURED:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${prismaAutoRegistered ? "  ✅ Prisma model đã thêm vào prisma/schema.prisma" : "  ⚠️  Prisma model chưa thêm (đã tồn tại hoặc file không tìm thấy)"}
${routeAutoRegistered ? "  ✅ Route đã đăng ký trong src/router.ts" : "  ⚠️  Route chưa đăng ký (đã tồn tại hoặc file không tìm thấy)"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 CÒN LẠI (thủ công):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${prismaAutoRegistered ? `  1. Chạy migration:\n     npx prisma migrate dev --name add-${kebab}` : `  1. Thêm Prisma model:\n${prismaSnippet}\n\n  2. Chạy migration:\n     npx prisma migrate dev --name add-${kebab}`}

  ${prismaAutoRegistered ? "2" : "3"}. Chạy test:
     npm test -- --testPathPattern=${kebab}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

main();
