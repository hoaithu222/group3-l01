#!/usr/bin/env ts-node
/**
 * ============================================================================
 * SERVICE GENERATOR — Tạo standalone service (không gắn module)
 * ============================================================================
 *
 * Dùng cho infrastructure services (notification, payment, upload, ...)
 *
 * Sử dụng:
 *   npm run gen:service -- <name>
 *
 * Ví dụ:
 *   npm run gen:service -- notification
 *   npm run gen:service -- payment
 *   npm run gen:service -- sms
 * ============================================================================
 */

import * as fs from "fs";
import * as path from "path";

function toPascalCase(s: string): string {
  return s
    .replace(/[-_](\w)/g, (_, c) => c.toUpperCase())
    .replace(/^(\w)/, (_, c) => c.toUpperCase());
}

function toKebabCase(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();
}

function toCamelCase(s: string): string {
  const pascal = toPascalCase(s);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function main() {
  const name = process.argv[2];
  if (!name) {
    console.error("❌ Sử dụng: npm run gen:service -- <name>");
    console.error("   Ví dụ: npm run gen:service -- notification");
    process.exit(1);
  }

  const Pascal = toPascalCase(name);
  const camel = toCamelCase(name);
  const kebab = toKebabCase(name);
  const baseDir = path.resolve(__dirname, "..", "src", "infrastructure", kebab);

  if (fs.existsSync(baseDir)) {
    console.error(`❌ Service "${kebab}" đã tồn tại: ${baseDir}`);
    process.exit(1);
  }

  fs.mkdirSync(baseDir, { recursive: true });

  // Interface
  const interfaceContent = `/**
 * I${Pascal}Service — interface cho ${camel} service.
 * Dùng để dễ swap implementation (mock, real, third-party).
 */
export interface I${Pascal}Service {
  // TODO: Define methods
}
`;

  // Implementation
  const implContent = `import type { I${Pascal}Service } from "./${kebab}.interface";
import { logger } from "../logger";

/**
 * ${Pascal}Service — implementation mặc định.
 */
export class ${Pascal}Service implements I${Pascal}Service {
  constructor() {
    logger.info("${Pascal}Service initialized");
  }

  // TODO: Implement methods
}
`;

  // Index
  const indexContent = `export type { I${Pascal}Service } from "./${kebab}.interface";
export { ${Pascal}Service } from "./${kebab}.service";
`;

  fs.writeFileSync(path.join(baseDir, `${kebab}.interface.ts`), interfaceContent, "utf-8");
  fs.writeFileSync(path.join(baseDir, `${kebab}.service.ts`), implContent, "utf-8");
  fs.writeFileSync(path.join(baseDir, "index.ts"), indexContent, "utf-8");

  console.log(`
✅ Service "${Pascal}" đã tạo tại: src/infrastructure/${kebab}/
   ├── ${kebab}.interface.ts
   ├── ${kebab}.service.ts
   └── index.ts

📌 Import: import { ${Pascal}Service } from "@infrastructure/${kebab}";
`);
}

main();
