#!/usr/bin/env ts-node
/**
 * ============================================================================
 * EXPORT OpenAPI spec — p0-09
 * ============================================================================
 *
 * Ghi `be/openapi.json` (COMMIT — review diff hợp đồng ngay trong PR, README
 * p0-09 §2) hợp nhất từ HAI nguồn:
 *
 *   1. Registry Zod (`core/openapi/registry.ts` + mọi `modules/**\/*.openapi.ts`
 *      liệt kê ở `core/openapi/index.ts`) qua `OpenApiGeneratorV31` — nguồn
 *      "thật", sinh từ DTO validate thật của route, KHÔNG lệch tay.
 *   2. `swagger-jsdoc` (JSDoc `@openapi` còn lại ở `*.routes.ts`) — route CŨ,
 *      chuyển dần sang (1) (be.md §10 rủi ro #2: viết `*.openapi.ts` tốn công,
 *      ưu tiên route client đang dùng).
 *
 * Merge: path của (1) THẮNG (2) nếu trùng path (chưa xảy ra hiện tại — mỗi
 * route chỉ khai 1 nơi); COMPONENT (`components.schemas`) trùng TÊN ở cả hai
 * nguồn → THROW ngay lúc build (tránh 2 định nghĩa khác nhau cùng tên,
 * README §5.1 bước 4).
 *
 * KHÔNG import `src/router.ts`/`src/app.ts` — script chạy ĐỘC LẬP với server
 * (không listen cổng, không cần DB/Redis kết nối được) để chạy trong CI mà
 * không cần env đầy đủ và không tạo phụ thuộc vòng. Hệ quả: route nào CHƯA có
 * `*.openapi.ts` LẪN JSDoc `@openapi` thì TẠM THỜI không xuất hiện trong
 * `openapi.json` — theo dõi ở CTR-05 (`openapi-coverage.test.ts`, chưa viết ở
 * đợt này, xem báo cáo).
 *
 * Sử dụng:
 *   npm run gen:openapi          (be/package.json)
 *   npm run contracts:export     (gen:openapi + gen:error-codes)
 * ============================================================================
 */
import fs from "node:fs";
import path from "node:path";
import swaggerJsdoc from "swagger-jsdoc";
import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { env } from "../src/core/config";
// Side-effect import: nạp mọi `modules/**/**.openapi.ts` liệt kê tĩnh ở đây,
// mỗi file tự `registry.registerPath(...)` lúc được import.
import { registry } from "../src/core/openapi";
import { stableStringify } from "./lib/stable-json";

interface OpenApiDoc {
  openapi?: string;
  info?: Record<string, unknown>;
  servers?: unknown;
  security?: unknown;
  paths?: Record<string, unknown>;
  components?: {
    schemas?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

const generator = new OpenApiGeneratorV31(registry.definitions);
const zodDoc = generator.generateDocument({
  openapi: "3.1.0",
  info: {
    title: env.APP_NAME,
    version: env.APP_VERSION,
    description: "API documentation — hợp nhất registry Zod (nguồn thật) + swagger-jsdoc (route cũ, xem README p0-09).",
  },
  servers: [{ url: "/api/v1", description: "API v1" }],
}) as unknown as OpenApiDoc;

const jsdocDoc = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: env.APP_NAME,
      version: env.APP_VERSION,
      description: "API documentation (swagger-jsdoc — route chưa chuyển sang registry Zod)",
    },
    servers: [{ url: "/api/v1", description: "API v1" }],
    components: {
      securitySchemes: {
        BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
    },
    security: [{ BearerAuth: [] }],
  },
  apis: ["./src/modules/**/*.ts", "./src/modules/**/*.routes.ts"],
}) as OpenApiDoc;

/** Path của `a` (registry Zod) THẮNG `b` (swagger-jsdoc); component trùng TÊN ở cả hai → lỗi build. */
function mergeSpecs(a: OpenApiDoc, b: OpenApiDoc): OpenApiDoc {
  const aSchemas = a.components?.schemas ?? {};
  const bSchemas = b.components?.schemas ?? {};
  for (const name of Object.keys(bSchemas)) {
    if (name in aSchemas) {
      throw new Error(
        `[export-openapi] Component "${name}" được đăng ký cả ở registry Zod (core/openapi) lẫn swagger-jsdoc — ` +
          `bỏ một trong hai định nghĩa (tránh 2 schema khác nhau cùng tên trong openapi.json).`
      );
    }
  }

  return {
    ...a,
    paths: { ...(b.paths ?? {}), ...(a.paths ?? {}) },
    components: {
      ...(b.components ?? {}),
      ...(a.components ?? {}),
      schemas: { ...bSchemas, ...aSchemas },
      securitySchemes: {
        ...(b.components?.securitySchemes ?? {}),
        ...(a.components?.securitySchemes ?? {}),
      },
    },
  };
}

const merged = mergeSpecs(zodDoc, jsdocDoc);

const outPath = path.resolve(__dirname, "../openapi.json");
fs.writeFileSync(outPath, stableStringify(merged) + "\n", "utf8");

const pathCount = Object.keys(merged.paths ?? {}).length;
const schemaCount = Object.keys(merged.components?.schemas ?? {}).length;
// eslint-disable-next-line no-console
console.log(`[export-openapi] Đã ghi ${outPath} — ${pathCount} path, ${schemaCount} schema component.`);
