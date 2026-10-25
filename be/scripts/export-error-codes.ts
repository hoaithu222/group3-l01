#!/usr/bin/env ts-node
/**
 * ============================================================================
 * EXPORT mã lỗi → contracts/error-codes.json — p0-09
 * ============================================================================
 *
 * Đọc TRỰC TIẾP `ErrorCode`/`ErrorMessages` từ `src/core/utils/error.codes.ts`
 * (nguồn thật, KHÔNG chép tay — file này KHÔNG import gì khác nên an toàn nạp
 * độc lập, không side effect DB/env/router).
 *
 * `http` (tuỳ chọn — `{ code, message, http? }`): repo CHƯA có bảng ánh xạ mã
 * lỗi → HTTP status tập trung (status hiện quyết định tại nơi gọi
 * `throw new AppError(message, status, code)`, rải rác từng module — thêm
 * `ERROR_CODE_META` tập trung ở `error.codes.ts` là việc lớn hơn phạm vi đợt
 * này). Thay vào đó, script dò SỐ HTTP (`4xx`/`5xx`) xuất hiện trong đoạn JSDoc
 * `/** ... *​/` NGAY TRƯỚC dòng khai báo mỗi mã trong chính SOURCE TEXT — nhiều
 * comment có ghi sẵn (vd "AUTH_016: ... (403)"), một số không có → bỏ trường
 * `http` cho mã đó (KHÔNG suy đoán khi không chắc).
 *
 * Sử dụng:
 *   npm run gen:error-codes      (be/package.json)
 *   npm run contracts:export     (gen:openapi + gen:error-codes)
 * ============================================================================
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { ErrorCode, ErrorMessages, type ErrorCodeType } from "../src/core/utils/error.codes";
import { stableStringify } from "./lib/stable-json";

const SOURCE_FILE = path.resolve(__dirname, "../src/core/utils/error.codes.ts");
const OUT_FILE = path.resolve(__dirname, "../../contracts/error-codes.json");

/**
 * Với mỗi dòng khai báo `<CODE>: "<CODE>",`, gom các dòng comment
 * (`/** ... *​/`, `* ...`, `// ...`) NGAY PHÍA TRÊN liền kề (không dòng trống)
 * rồi dò số `4xx`/`5xx` đầu tiên trong đó.
 */
function extractHttpByCode(source: string): Record<string, number> {
  const lines = source.split("\n");
  const declRe = /^\s*([A-Z][A-Z0-9_]*):\s*"[A-Z][A-Z0-9_]*",?\s*$/;
  const httpRe = /\b([45]\d{2})\b/;
  const result: Record<string, number> = {};
  let commentBuf: string[] = [];

  for (const line of lines) {
    const decl = declRe.exec(line);
    if (decl) {
      const code = decl[1];
      const commentText = commentBuf.join(" ");
      const match = httpRe.exec(commentText);
      if (match) result[code] = Number(match[1]);
      commentBuf = [];
      continue;
    }
    const trimmed = line.trim();
    if (trimmed.startsWith("/**") || trimmed.startsWith("*") || trimmed.startsWith("//")) {
      commentBuf.push(trimmed);
    } else if (trimmed === "") {
      // Dòng trống hiếm gặp giữa comment và khai báo — vẫn giữ buffer.
      continue;
    } else {
      // Dòng code khác (không phải khai báo mã, không phải comment) → comment
      // phía trên KHÔNG thuộc về khai báo mã tiếp theo, xoá buffer.
      commentBuf = [];
    }
  }
  return result;
}

function main(): void {
  const source = fs.readFileSync(SOURCE_FILE, "utf8");
  const httpByCode = extractHttpByCode(source);

  const codes = (Object.keys(ErrorCode) as ErrorCodeType[])
    .map((code): { code: string; message: string; http?: number } => {
      const http = httpByCode[code];
      return http === undefined ? { code, message: ErrorMessages[code] } : { code, message: ErrorMessages[code], http };
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  const duplicates = codes.map((c) => c.code).filter((code, i, arr) => arr.indexOf(code) !== i);
  if (duplicates.length > 0) {
    throw new Error(`[export-error-codes] Mã lỗi trùng tên: ${duplicates.join(", ")}`);
  }

  // `version` = sha256 nội dung (KHÔNG phải ngày/giờ — README p0-09 §5.2: hai lần
  // sinh giống hệt khi nội dung không đổi, CTR-08).
  const version = createHash("sha256").update(stableStringify(codes)).digest("hex").slice(0, 16);
  const doc = { version, source: "be/src/core/utils/error.codes.ts", codes };

  fs.writeFileSync(OUT_FILE, stableStringify(doc) + "\n", "utf8");

  const withHttp = codes.filter((c) => c.http !== undefined).length;
  // eslint-disable-next-line no-console
  console.log(`[export-error-codes] Đã ghi ${OUT_FILE} — ${codes.length} mã lỗi (${withHttp} có "http" dò được từ comment).`);
}

main();
