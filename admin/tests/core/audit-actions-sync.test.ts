/**
 * Bảng nhãn `action` của nhật ký (`shared/constants/audit-actions.ts`) đối chiếu với các
 * `action` mà BE THẬT ghi vào audit log — hai gói không chia mã nguồn, thêm action ở BE mà
 * quên nhãn thì UI rơi về mã thô (`member.ban`) chứ không vỡ, nên lệch âm thầm nếu không có
 * bài kiểm này.
 *
 * Quét `../be/src` bằng regex, CHỈ trong các file có gọi `record(` và nhắc tới `audit` — để
 * không nhặt nhầm `action: "channel.read"` của kiểm quyền. `it.skipIf` bỏ qua khi máy không
 * có `../be` (cùng cách `error-codes-sync.test.ts`).
 */
/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  AUDIT_ACTION_LABELS,
  AUDIT_ACTION_OPTIONS,
  AUDIT_TARGET_TYPE_LABELS,
  auditActionLabel,
  auditTargetTypeLabel,
} from '@/shared/constants/audit-actions';

const here = path.dirname(fileURLToPath(import.meta.url));
const beModules = path.resolve(here, '../../../be/src/modules');

/** Mọi file `.ts` không phải test dưới `dir`. */
function listSources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'tests' ? [] : listSources(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

/** `action: "a.b"` / `auditAction: cond ? "a.b" : "c.d"` / `afterWrite(..., "system-config.x")`. */
function extractAuditActions(source: string): string[] {
  if (!/\brecord\(/.test(source) || !/audit/i.test(source)) return [];
  const found = new Set<string>();
  for (const m of source.matchAll(/\b(?:action|auditAction):([^\n,}]*)/g)) {
    for (const lit of m[1].matchAll(/"([a-z][a-z-]*\.[a-z][a-z-]*)"/g)) found.add(lit[1]);
  }
  for (const m of source.matchAll(/"(system-config\.[a-z-]+)"/g)) found.add(m[1]);
  return [...found];
}

describe('nhãn action của nhật ký', () => {
  it.skipIf(!fs.existsSync(beModules))('mọi action BE ghi đều có nhãn tiếng Việt', () => {
    const actions = new Set(
      listSources(beModules).flatMap((f) => extractAuditActions(fs.readFileSync(f, 'utf8'))),
    );

    expect(actions.size, 'không đọc được action nào từ BE — kiểm lại regex').toBeGreaterThan(10);
    // Những action đã biết chắc phải quét ra (bảo vệ chính regex khỏi hỏng âm thầm).
    for (const known of [
      'user.lock',
      'system-config.update',
      'member.ban',
      'user.biometric-revoke',
    ]) {
      expect(actions, `regex không nhặt được ${known}`).toContain(known);
    }

    const missing = [...actions].filter((a) => !(a in AUDIT_ACTION_LABELS));
    expect(missing, `BE ghi action chưa có nhãn: ${missing.join(', ')}`).toEqual([]);
  });

  it('có nhãn cho các hành động Phase 0 bắt buộc', () => {
    expect(auditActionLabel('user.lock')).toBe('Khoá tài khoản');
    expect(auditActionLabel('user.biometric-revoke')).toBe('Thu hồi đăng nhập sinh trắc học');
    expect(auditActionLabel('system-config.update')).toBe('Sửa cấu hình');
    for (const a of [
      'user.unlock',
      'user.change-role',
      'user.update',
      'user.anonymize',
      'system-config.reset',
      'system.job-retry',
      'system.job-remove',
      'system.job-outbox-requeue',
      'system.storage-cleanup',
      'push.test',
    ]) {
      expect(AUDIT_ACTION_LABELS, a).toHaveProperty(a);
    }
  });

  it('nhãn nói đúng nghĩa của action BE ghi (không nhầm "khoá đăng nhập tạm thời" với "khoá tài khoản")', () => {
    // `auth.login-locked` ghi khi chạm ngưỡng nhập sai mật khẩu — tài khoản KHÔNG bị khoá.
    expect(auditActionLabel('auth.login-locked')).toBe(
      'Khoá đăng nhập tạm thời (nhập sai mật khẩu nhiều lần)',
    );
    // `user.update` chỉ được ghi khi đổi email/mật khẩu/vai trò (thu hồi mọi phiên).
    expect(auditActionLabel('user.update')).toBe(
      'Cập nhật thông tin đăng nhập người dùng (email, mật khẩu, vai trò)',
    );
    expect(auditActionLabel('user.update')).not.toBe('user.update');
  });

  it('action chưa có nhãn → rơi về chính mã (không rỗng, không ném lỗi)', () => {
    expect(auditActionLabel('future.new-action')).toBe('future.new-action');
    expect(auditActionLabel('')).toBe('');
  });

  it('tên theo kế hoạch nhưng BE ghi tên khác → vẫn ra nhãn, nhưng KHÔNG vào danh sách lọc', () => {
    expect(auditActionLabel('system.outbox-requeue')).toBe(
      auditActionLabel('system.job-outbox-requeue'),
    );
    expect(auditActionLabel('system.push-test')).toBe(auditActionLabel('push.test'));
    const values = AUDIT_ACTION_OPTIONS.map((o) => o.value);
    expect(values).not.toContain('system.outbox-requeue');
    expect(values).not.toContain('system.push-test');
    expect(values).toContain('system.job-outbox-requeue');
  });

  it('danh sách lọc: mỗi action đúng một lần, có nhãn', () => {
    const values = AUDIT_ACTION_OPTIONS.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values.length).toBe(Object.keys(AUDIT_ACTION_LABELS).length);
    expect(AUDIT_ACTION_OPTIONS.every((o) => o.label.length > 0)).toBe(true);
  });

  it('targetType: so khớp không phân biệt hoa/thường (BE có chỗ ghi "user" thay vì "User")', () => {
    expect(auditTargetTypeLabel('User')).toBe(AUDIT_TARGET_TYPE_LABELS.User);
    expect(auditTargetTypeLabel('user')).toBe(AUDIT_TARGET_TYPE_LABELS.User);
    expect(auditTargetTypeLabel('systemconfig')).toBe(AUDIT_TARGET_TYPE_LABELS.SystemConfig);
    expect(auditTargetTypeLabel('Lạ')).toBe('Lạ');
  });
});
