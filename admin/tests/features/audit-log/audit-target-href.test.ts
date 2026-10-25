/**
 * `auditTargetHref` / `extractBeforeAfter` — hàm thuần dựng đích điều hướng của "đối tượng"
 * trong dòng nhật ký và tách khối Trước/Sau khỏi `metadata`.
 */
import { describe, expect, it } from 'vitest';

import {
  auditTargetHref,
  auditWorkspaceHref,
  extractBeforeAfter,
} from '@/features/audit-log/utils/audit-target-href';

const row = (targetType: string, targetId: string, workspaceId: string | null = null) => ({
  targetType,
  targetId,
  workspaceId,
});

describe('auditTargetHref', () => {
  it('User → /user/:id; Workspace → /workspace/:id', () => {
    expect(auditTargetHref(row('User', 'u1'))).toBe('/user/u1');
    expect(auditTargetHref(row('Workspace', 'w1'))).toBe('/workspace/w1');
  });

  it('so khớp targetType không phân biệt hoa/thường (BE ghi lệch "user")', () => {
    expect(auditTargetHref(row('user', 'u1'))).toBe('/user/u1');
  });

  it('WorkspaceMembership `<ws>:<user>` → tab thành viên của workspace', () => {
    expect(auditTargetHref(row('WorkspaceMembership', 'w1:u1'))).toBe('/workspace/w1?tab=members');
  });

  it('Channel → tab kênh của workspace chứa nó; thiếu workspaceId → không link', () => {
    expect(auditTargetHref(row('Channel', 'c1', 'w1'))).toBe('/workspace/w1?tab=channels');
    expect(auditTargetHref(row('Channel', 'c1'))).toBeNull();
  });

  it('SystemConfig `limits.message` → /system-config?tab=limits; `features` → tab features', () => {
    expect(auditTargetHref(row('SystemConfig', 'limits.message'))).toBe(
      '/system-config?tab=limits',
    );
    expect(auditTargetHref(row('SystemConfig', 'features'))).toBe('/system-config?tab=features');
  });

  it('SystemConfig có tab KHÁC phần đầu khoá → dẫn đúng tab của registry BE', () => {
    expect(auditTargetHref(row('SystemConfig', 'notification.defaults'))).toBe(
      '/system-config?tab=notifications',
    );
    expect(auditTargetHref(row('SystemConfig', 'limits.resource'))).toBe(
      '/system-config?tab=storage',
    );
    expect(auditTargetHref(row('SystemConfig', 'resource'))).toBe('/system-config?tab=storage');
    expect(auditTargetHref(row('SystemConfig', 'limits.board'))).toBe('/system-config?tab=pm');
    expect(auditTargetHref(row('SystemConfig', 'limits.task'))).toBe('/system-config?tab=pm');
    expect(auditTargetHref(row('SystemConfig', 'pm'))).toBe('/system-config?tab=pm');
  });

  it('WorkspaceInvitation → tab thành viên của workspace (qua workspaceId); thiếu workspaceId → không link', () => {
    expect(auditTargetHref(row('WorkspaceInvitation', 'inv1', 'w1'))).toBe(
      '/workspace/w1?tab=members',
    );
    expect(auditTargetHref(row('WorkspaceInvitation', 'inv1'))).toBeNull();
  });

  it('SystemConfig `auth` → tab Xác thực (tab đã có component, p0-07)', () => {
    expect(auditTargetHref(row('SystemConfig', 'auth'))).toBe('/system-config?tab=auth');
  });

  it('Report (kiểm duyệt, p1-08) → /moderation/:id; so khớp không phân biệt hoa/thường', () => {
    expect(auditTargetHref(row('Report', 'r1', 'w1'))).toBe('/moderation/r1');
    expect(auditTargetHref(row('report', 'r1'))).toBe('/moderation/r1');
    expect(auditTargetHref(row('Report', '../x?y=1#z'))).toBe('/moderation/..%2Fx%3Fy%3D1%23z');
  });

  it('phân hệ chưa có trang (job, outbox, loại lạ) → null', () => {
    expect(auditTargetHref(row('QueueJob', 'notifications:1'))).toBeNull();
    expect(auditTargetHref(row('OutboxEvent', 'e1'))).toBeNull();
    expect(auditTargetHref(row('Whatever', 'x'))).toBeNull();
  });

  it('id từ BE được mã hoá — không chèn được `/`, `?`, `#` vào URL nội bộ', () => {
    expect(auditTargetHref(row('User', '../admin?x=1#h'))).toBe('/user/..%2Fadmin%3Fx%3D1%23h');
    expect(auditTargetHref(row('SystemConfig', 'a&tab=evil.x'))).toBe(
      '/system-config?tab=a%26tab%3Devil',
    );
    expect(auditWorkspaceHref('w/1')).toBe('/workspace/w%2F1');
  });
});

describe('extractBeforeAfter', () => {
  it('nhận cặp before/after', () => {
    expect(extractBeforeAfter({ before: { a: 1 }, after: { a: 2 }, mode: 'NOW' })).toEqual({
      before: { a: 1 },
      after: { a: 2 },
    });
  });

  it('nhận cặp from/to (vd đổi vai trò thành viên)', () => {
    expect(extractBeforeAfter({ from: 'member', to: 'admin' })).toEqual({
      before: 'member',
      after: 'admin',
    });
  });

  it('giá trị falsy (null/0) vẫn là một vế hợp lệ', () => {
    expect(extractBeforeAfter({ before: null, after: 0 })).toEqual({ before: null, after: 0 });
  });

  it('thiếu một vế / không phải object / mảng / null → null', () => {
    expect(extractBeforeAfter({ before: 1 })).toBeNull();
    expect(extractBeforeAfter({ to: 1 })).toBeNull();
    expect(extractBeforeAfter('x')).toBeNull();
    expect(extractBeforeAfter([1, 2])).toBeNull();
    expect(extractBeforeAfter(null)).toBeNull();
    expect(extractBeforeAfter(undefined)).toBeNull();
  });
});
