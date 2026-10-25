/**
 * Đối chiếu mã lỗi admin với mã lỗi BE thật (`../be/src/core/utils/error.codes.ts`)
 * — hai gói KHÔNG chia schema (Zod v4 vs v3), nên đồng bộ tay dễ lệch âm thầm.
 *
 * `it.skipIf` bỏ qua khi máy không có `../be` (monorepo có thể chỉ checkout
 * `admin/`) — bài kiểm không được đỏ vì thiếu một thư mục ngoài phạm vi mình.
 *
 * Đọc bằng `node:fs`/`node:path` (không phải `import.meta.glob`): file cần đọc
 * nằm NGOÀI cả `src/` lẫn `tests/` (glob của Vite chỉ soi trong root dự án).
 * `tsconfig.app.json` cố ý không khai `"types": ["node"]` toàn cục (xem
 * `tests/file-size.test.ts`) nên phải tự khai ambient Node cho riêng file này.
 */
/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ERROR_CODE_MESSAGES } from '@/shared/constants/error-codes';

const here = path.dirname(fileURLToPath(import.meta.url));
const bePath = path.resolve(here, '../../../be/src/core/utils/error.codes.ts');

describe('mã lỗi admin đối chiếu BE', () => {
  it.skipIf(!fs.existsSync(bePath))('mã lỗi admin ⊇ mã lỗi BE', () => {
    const src = fs.readFileSync(bePath, 'utf8');
    const beCodes = [...src.matchAll(/^\s+([A-Z]+_\d{3}):\s*"/gm)].map((m) => m[1]);

    expect(beCodes.length, 'không đọc được mã lỗi nào từ file BE — kiểm lại regex').toBeGreaterThan(
      0,
    );

    for (const code of beCodes) {
      expect(ERROR_CODE_MESSAGES, `thiếu mã lỗi ${code}`).toHaveProperty(code);
    }
  });
});
