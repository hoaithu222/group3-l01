#!/usr/bin/env ts-node
/**
 * ============================================================================
 * MIDDLEWARE GENERATOR
 * ============================================================================
 *
 * Sử dụng:
 *   npm run gen:middleware -- <name>
 *
 * Ví dụ:
 *   npm run gen:middleware -- uploadFile
 *   npm run gen:middleware -- checkOwnership
 *   npm run gen:middleware -- logRequest
 * ============================================================================
 */

import * as fs from "fs";
import * as path from "path";

function toKebabCase(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();
}

function toCamelCase(s: string): string {
  return s.replace(/[-_](\w)/g, (_, c) => c.toUpperCase());
}

function main() {
  const name = process.argv[2];
  if (!name) {
    console.error("❌ Sử dụng: npm run gen:middleware -- <name>");
    console.error("   Ví dụ: npm run gen:middleware -- uploadFile");
    process.exit(1);
  }

  const camel = toCamelCase(name);
  const kebab = toKebabCase(name);
  const filePath = path.resolve(__dirname, "..", "src", "core", "middlewares", `${kebab}.ts`);

  if (fs.existsSync(filePath)) {
    console.error(`❌ Middleware "${kebab}" đã tồn tại: ${filePath}`);
    process.exit(1);
  }

  const content = `import type { Request, Response, NextFunction } from "express";

/**
 * ${camel} middleware
 * TODO: Implement logic
 */
export function ${camel}(req: Request, _res: Response, next: NextFunction): void {
  // TODO: Implement middleware logic
  next();
}
`;

  fs.writeFileSync(filePath, content, "utf-8");

  console.log(`✅ Middleware "${camel}" đã tạo: src/core/middlewares/${kebab}.ts`);
  console.log(`📌 Đăng ký trong src/core/middlewares/index.ts:`);
  console.log(`   export { ${camel} } from "./${kebab}";`);
}

main();
