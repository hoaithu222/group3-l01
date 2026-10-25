import fs from "node:fs";
import path from "node:path";

/**
 * Mã nguồn chạy thật (`node dist/server.js`) KHÔNG được import theo alias `@core/…`, `@infrastructure/…`, `@modules/…`, `@shared/…`.
 *
 * ⛔ `tsc` không viết lại đường dẫn alias (repo không dùng `tsc-alias`); alias chỉ chạy được ở nơi có `tsconfig-paths`
 * (`ts-node-dev`) hoặc `moduleNameMapper` của Jest. Một file dùng alias vẫn xanh ở `npm run build`, `npm test` và `npm run dev` —
 * rồi `node dist/server.js` chết lúc khởi động với "Cannot find module '@core/…'" (đã xảy ra với `admin-notifications.service.ts`).
 * Quy ước thật của module là đường dẫn TƯƠNG ĐỐI; test khoá nó lại.
 */
const SRC = path.join(__dirname, "..");
const ALIAS_IMPORT =
  /^\s*(?:import|export)\b[^;]*\bfrom\s+["']@(?:core|infrastructure|modules|shared)\//;
const DYNAMIC_ALIAS = /\b(?:import|require)\(\s*["']@(?:core|infrastructure|modules|shared)\//;

function collect(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "tests" || entry.name === "__tests__" || entry.name === "node_modules")
        continue;
      collect(full, out);
    } else if (
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".d.ts")
    ) {
      out.push(full);
    }
  }
  return out;
}

describe("import alias trong mã nguồn chạy thật", () => {
  it("không file nguồn (ngoài test) nào import theo @core/@infrastructure/@modules/@shared — dist sẽ không nạp được", () => {
    const offenders: string[] = [];
    for (const file of collect(SRC)) {
      const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) return; // ví dụ trong chú thích
        if (ALIAS_IMPORT.test(line) || DYNAMIC_ALIAS.test(line)) {
          offenders.push(`${path.relative(SRC, file)}:${String(index + 1)}: ${trimmed}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});
