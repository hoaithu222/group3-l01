/**
 * Mẫu nền bìa nhóm khi chưa có ảnh bìa (`features/workspace/utils/workspace-cover.ts`) — phải khớp app mobile:
 * cùng khoá, cùng THỨ TỰ (BE `WORKSPACE_COVER_PRESETS`), cùng hàm chọn ổn định theo id. Vector cố định dưới đây tính
 * bằng đúng thuật toán app dùng (băm ×31, không dấu 32-bit) — đổi hàm là test đỏ trước khi hai bên vẽ lệch màu.
 */
/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  coverPresetFor,
  WORKSPACE_COVER_GRADIENT,
  WORKSPACE_COVER_PRESETS,
} from '@/features/workspace/utils/workspace-cover';
import { DARK_COLORS, LIGHT_COLORS, THEME_COLOR_KEYS } from '@/shared/theme/colors.generated';

const here = path.dirname(fileURLToPath(import.meta.url));
const beEntity = path.resolve(
  here,
  '../../../../be/src/modules/workspaces/entities/workspace.interface.ts',
);

describe('coverPresetFor', () => {
  it('BE đã trả `coverPreset` ⇒ dùng đúng mẫu đó, không băm id', () => {
    for (const preset of WORKSPACE_COVER_PRESETS) expect(coverPresetFor('ws-1', preset)).toBe(preset);
  });

  it('`coverPreset` null ⇒ chọn ổn định theo id (vector cố định, cả id vượt 2^31 khi băm)', () => {
    expect(coverPresetFor('ws-1', null)).toBe('amber');
    expect(coverPresetFor('', null)).toBe('violet');
    // ObjectId thật: giá trị băm > 2^31 — thiếu `>>> 0` thì phép chia dư ra số âm, chỉ số lệch.
    expect(coverPresetFor('665f1c2e8a1b2c3d4e5f6aaa', null)).toBe('ocean');
    expect(coverPresetFor('64a1b2c3d4e5f60718293a4b', null)).toBe('violet');
  });
});

describe('WORKSPACE_COVER_PRESETS / WORKSPACE_COVER_GRADIENT', () => {
  it.skipIf(!fs.existsSync(beEntity))('thứ tự khoá trùng `WORKSPACE_COVER_PRESETS` phía BE', () => {
    const match = fs
      .readFileSync(beEntity, 'utf8')
      .match(/WORKSPACE_COVER_PRESETS\s*=\s*\[([^\]]*)\]/);
    expect(match, 'không đọc được WORKSPACE_COVER_PRESETS ở BE').not.toBeNull();
    const beKeys = [...(match?.[1] ?? '').matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
    expect(beKeys).toEqual([...WORKSPACE_COVER_PRESETS]);
  });

  it('mỗi mẫu là gradient CHỈ gồm token màu có thật, cùng giá trị ở hai theme (không hex, không giá trị tuỳ ý)', () => {
    const known = new Set<string>(THEME_COLOR_KEYS);
    for (const preset of WORKSPACE_COVER_PRESETS) {
      const classes = WORKSPACE_COVER_GRADIENT[preset].split(' ');
      expect(classes.length, preset).toBeGreaterThanOrEqual(2);
      for (const cls of classes) {
        const token = cls.match(/^(?:from|via|to)-([a-z]+-\d+)$/)?.[1] ?? '';
        expect(known.has(token), `${preset}: "${cls}" không phải token trong colors-theme.json`).toBe(
          true,
        );
        const key = token as keyof typeof LIGHT_COLORS;
        expect(LIGHT_COLORS[key], `${preset}: ${token} đổi màu theo theme`).toBe(DARK_COLORS[key]);
      }
    }
  });
});
