/**
 * `sanitizeRedirectPath` — cổng DUY NHẤT cho đích quay lại sau đăng nhập: chỉ đường dẫn NỘI BỘ
 * của app, mọi thứ khác về trang chủ (chống open redirect).
 */
import { describe, expect, it } from 'vitest';

import { sanitizeRedirectPath } from '@/features/auth/utils/redirect';

describe('sanitizeRedirectPath', () => {
  it.each([
    ['/user', '/user'],
    ['/user/665f1c2e', '/user/665f1c2e'],
    ['/audit-log?focus=actor', '/audit-log?focus=actor'],
    ['/user?page=2&search=an#top', '/user?page=2&search=an#top'],
    ['/system-config?tab=storage', '/system-config?tab=storage'],
    // Có khoảng trắng hai đầu → cắt bỏ.
    ['  /profile  ', '/profile'],
    // Dấu chấm được chuẩn hoá, không thoát khỏi app.
    ['/a/../b', '/b'],
  ])('nhận đường dẫn nội bộ %j ⇒ %j', (input, expected) => {
    expect(sanitizeRedirectPath(input)).toBe(expected);
  });

  it.each([
    ['https://evil.example/phish', 'URL tuyệt đối'],
    ['http://evil.example', 'URL tuyệt đối (http)'],
    ['//evil.example/phish', 'protocol-relative'],
    ['///evil.example', 'nhiều gạch chéo'],
    ['/\\evil.example', 'gạch ngược (trình duyệt coi như /)'],
    ['\\\\evil.example', 'UNC'],
    ['/\t/evil.example', 'tab bị trình duyệt bỏ → //evil.example'],
    ['/\n/evil.example', 'xuống dòng bị trình duyệt bỏ'],
    ['/\r/evil.example', 'CR bị trình duyệt bỏ'],
    ['javascript:alert(1)', 'scheme javascript'],
    ['data:text/html,<script>alert(1)</script>', 'scheme data'],
    ['user', 'không bắt đầu bằng /'],
    ['', 'rỗng'],
    ['   ', 'toàn khoảng trắng'],
    ['/' + 'a'.repeat(2100), 'quá dài'],
  ])('⛔ từ chối %j (%s) ⇒ về trang chủ', (input) => {
    expect(sanitizeRedirectPath(input)).toBe('/');
  });

  it.each([null, undefined, 42, {}, [], true])('giá trị không phải chuỗi (%j) ⇒ trang chủ', (input) => {
    expect(sanitizeRedirectPath(input)).toBe('/');
  });

  it.each([
    '/login',
    '/login?x=1',
    '/register',
    '/forgot-password',
    '/reset-password?token=bi-mat',
    '/403',
    '/404',
  ])('không quay lại trang khách/trang lỗi %s (vòng lặp, hoặc mang token) ⇒ trang chủ', (input) => {
    expect(sanitizeRedirectPath(input)).toBe('/');
  });

  it('dùng `fallback` do nơi gọi chỉ định', () => {
    expect(sanitizeRedirectPath('https://evil.example', '/profile')).toBe('/profile');
  });
});
