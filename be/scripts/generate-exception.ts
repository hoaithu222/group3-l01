#!/usr/bin/env ts-node
/**
 * ============================================================================
 * EXCEPTION GENERATOR
 * ============================================================================
 *
 * Sử dụng:
 *   npm run gen:exception -- <Name> <statusCode> <errorCode>
 *
 * Ví dụ:
 *   npm run gen:exception -- PaymentRequired 402 PAY_001
 *   npm run gen:exception -- ServiceUnavailable 503 SVC_001
 * ============================================================================
 */

import * as fs from "fs";
import * as path from "path";

function main() {
  const [name, statusCodeStr, errorCode] = process.argv.slice(2);

  if (!name || !statusCodeStr || !errorCode) {
    console.error("❌ Sử dụng: npm run gen:exception -- <Name> <statusCode> <errorCode>");
    console.error("   Ví dụ: npm run gen:exception -- PaymentRequired 402 PAY_001");
    process.exit(1);
  }

  const statusCode = parseInt(statusCodeStr, 10);
  const className = name.endsWith("Error") ? name : `${name}Error`;

  const appErrorPath = path.resolve(__dirname, "..", "src", "core", "exceptions", "AppError.ts");
  const existing = fs.readFileSync(appErrorPath, "utf-8");

  if (existing.includes(`class ${className}`)) {
    console.error(`❌ Exception "${className}" đã tồn tại trong AppError.ts`);
    process.exit(1);
  }

  const newClass = `
export class ${className} extends AppError {
  constructor(message = "${name}", details?: Record<string, unknown>) {
    super(message, ${statusCode}, "${errorCode}", details);
  }
}
`;

  fs.writeFileSync(appErrorPath, existing.trimEnd() + "\n" + newClass, "utf-8");

  // Update index.ts export
  const indexPath = path.resolve(__dirname, "..", "src", "core", "exceptions", "index.ts");
  const indexContent = fs.readFileSync(indexPath, "utf-8");
  if (!indexContent.includes(className)) {
    // Add to existing export
    const updatedIndex = indexContent.replace(
      /} from "\.\/AppError"/,
      `  ${className},\n} from "./AppError"`
    );
    fs.writeFileSync(indexPath, updatedIndex, "utf-8");
  }

  console.log(`✅ Exception "${className}" đã tạo (status: ${statusCode}, code: ${errorCode})`);
  console.log(`   Import: import { ${className} } from "@core/exceptions";`);
}

main();
