/**
 * `createUserSchema` — khớp chính sách của BE (`be/src/modules/users/dtos/create-user.dto.ts`):
 * mật khẩu 8–128 ký tự KHÔNG bắt buộc chữ hoa/số, tên 1–80 ký tự. Form chặt hơn BE thì quản trị viên bị
 * từ chối oan; lỏng hơn thì chỉ biết lỗi sau một vòng gọi API.
 */
import { describe, expect, it } from 'vitest';

import { createUserSchema } from '@/features/user/schemas/user.schema';

const valid = {
  email: 'an@congty.vn',
  name: 'Nguyễn Văn An',
  password: 'abcdefgh',
  role: 'user' as const,
};

const messageOf = (input: Record<string, unknown>, field: string): string | undefined => {
  const result = createUserSchema.safeParse({ ...valid, ...input });
  return result.success
    ? undefined
    : result.error.issues.find((i) => i.path[0] === field)?.message;
};

describe('createUserSchema — mật khẩu 8–128 (không bắt buộc chữ hoa/số)', () => {
  it('8 ký tự toàn chữ thường được nhận (BE nhận; trước đây form đòi chữ hoa + số)', () => {
    expect(createUserSchema.safeParse(valid).success).toBe(true);
  });

  it('7 ký tự bị từ chối, 8 ký tự qua', () => {
    expect(messageOf({ password: 'abcdefg' }, 'password')).toBe('Mật khẩu tối thiểu 8 ký tự');
    expect(messageOf({ password: 'abcdefgh' }, 'password')).toBeUndefined();
  });

  it('128 ký tự qua, 129 ký tự bị từ chối (trước đây trần 64)', () => {
    expect(messageOf({ password: 'a'.repeat(128) }, 'password')).toBeUndefined();
    expect(messageOf({ password: 'a'.repeat(129) }, 'password')).toBe('Mật khẩu tối đa 128 ký tự');
  });

  it('không trim mật khẩu: khoảng trắng là ký tự hợp lệ', () => {
    const result = createUserSchema.safeParse({ ...valid, password: '  abcd  ' });
    expect(result.success && result.data.password).toBe('  abcd  ');
  });
});

describe('createUserSchema — tên ≤ 80 ký tự', () => {
  it('80 ký tự qua, 81 ký tự bị từ chối', () => {
    expect(messageOf({ name: 'a'.repeat(80) }, 'name')).toBeUndefined();
    expect(messageOf({ name: 'a'.repeat(81) }, 'name')).toBe('Tên tối đa 80 ký tự');
  });

  it('chỉ toàn khoảng trắng bị coi là rỗng (`form-validation.md`)', () => {
    expect(messageOf({ name: '     ' }, 'name')).toBe('Họ tên là bắt buộc');
  });
});
