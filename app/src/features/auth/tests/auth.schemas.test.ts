import { PASSWORD_RULE_HINT } from '@/core/api/auth/password-policy';

import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '../schemas/auth.schemas';

/**
 * Luật kiểm dữ liệu của form xác thực — mỗi ca dưới đây là một lỗi ĐÃ CÓ THẬT hoặc một hợp đồng với
 * BE (`auth.dto.ts`): trần ký tự, mã DÁN kèm dấu cách, tên toàn dấu cách…
 */

const VALID = {
  confirmPassword: 'Mat-khau-1',
  email: 'a@b.com',
  name: 'Nguyễn Văn A',
  password: 'Mat-khau-1',
};

describe('email', () => {
  it('cắt khoảng trắng + chữ thường (bàn phím tự chèn dấu cách sau gợi ý)', () => {
    expect(forgotPasswordSchema.parse({ email: '  A@B.Com ' })).toEqual({ email: 'a@b.com' });
  });

  it('không đúng định dạng ⇒ báo tiếng Việt', () => {
    const result = loginSchema.safeParse({ email: 'khong-phai-email', password: 'x' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Email không đúng định dạng');
  });
});

describe('đăng nhập KHÔNG áp luật độ mạnh (người dùng cũ có mật khẩu ngắn)', () => {
  it('mật khẩu 1 ký tự vẫn hợp lệ', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true);
  });
});

describe('đăng ký', () => {
  it('hợp lệ', () => {
    expect(registerSchema.safeParse(VALID).success).toBe(true);
  });

  it('⛔ tên toàn dấu cách ⇒ bị chặn (cắt TRƯỚC khi kiểm rỗng, không để BE từ chối)', () => {
    expect(registerSchema.safeParse({ ...VALID, name: '     ' }).success).toBe(false);
  });

  it('tên được cắt khoảng trắng; tối đa 80 ký tự như BE', () => {
    expect(registerSchema.parse({ ...VALID, name: '  An  ' }).name).toBe('An');
    const tooLong = registerSchema.safeParse({ ...VALID, name: 'a'.repeat(81) });
    expect(tooLong.error?.issues[0]?.message).toBe('Tên tối đa 80 ký tự');
  });

  it.each([
    ['ngắn', 'Aa1', /ít nhất 8 ký tự/],
    ['thiếu chữ hoa', 'mat-khau-1', /chữ hoa/],
    ['thiếu chữ thường', 'MAT-KHAU-1', /chữ thường/],
    ['thiếu chữ số', 'Mat-khau-x', /chữ số/],
    ['quá 128 ký tự (BE từ chối)', `Aa1${'x'.repeat(126)}`, /tối đa 128/],
  ])('mật khẩu %s ⇒ báo lỗi ngay ở ô mật khẩu', (_name, password, message) => {
    const result = registerSchema.safeParse({ ...VALID, confirmPassword: password, password });
    expect(result.success).toBe(false);
    const issue = result.error?.issues.find((item) => item.path[0] === 'password');
    expect(issue?.message).toMatch(message);
  });

  it('nhập lại không khớp ⇒ lỗi gắn vào ĐÚNG ô nhập lại', () => {
    const result = registerSchema.safeParse({ ...VALID, confirmPassword: 'Khac-mat-khau-2' });
    expect(result.error?.issues[0]?.path).toEqual(['confirmPassword']);
    expect(result.error?.issues[0]?.message).toBe('Mật khẩu nhập lại không khớp');
  });

  it('gợi ý luật mật khẩu (hiện TRƯỚC khi gõ) nói đúng các luật của schema', () => {
    expect(PASSWORD_RULE_HINT).toMatch(/8 ký tự/);
    expect(PASSWORD_RULE_HINT).toMatch(/chữ hoa/);
    expect(PASSWORD_RULE_HINT).toMatch(/chữ thường/);
    expect(PASSWORD_RULE_HINT).toMatch(/chữ số/);
  });
});

describe('đặt lại mật khẩu', () => {
  const RESET = { confirmPassword: 'Mat-khau-1', password: 'Mat-khau-1', token: 'abc123' };

  it('⛔ mã DÁN từ e-mail kèm dấu cách/xuống dòng ⇒ được cắt (BE so khớp nguyên văn)', () => {
    expect(resetPasswordSchema.parse({ ...RESET, token: '  abc123\n' }).token).toBe('abc123');
  });

  it('mã rỗng hoặc dài quá 256 ký tự (BE từ chối) ⇒ bị chặn', () => {
    expect(resetPasswordSchema.safeParse({ ...RESET, token: '   ' }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ ...RESET, token: 'x'.repeat(257) }).success).toBe(false);
  });

  it('cùng luật mật khẩu mới với đăng ký', () => {
    const weak = resetPasswordSchema.safeParse({
      ...RESET,
      confirmPassword: 'yeu',
      password: 'yeu',
    });
    expect(weak.success).toBe(false);
  });
});
