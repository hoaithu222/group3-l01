import type { ChannelGrant, ChannelGrantsSnapshot, GrantLevel, GrantSource, RoleGrant, RoleRef } from './channels.types';

/**
 * Dạng CŨ (p1-03 be.md §4): mỗi dòng là một NGƯỜI — `{ userId, name, level, source, roleRef, … }`.
 * Dạng MỚI (p3-04 be.md §4): `{ subject: { type: 'USER'|'ROLE', user?, roleRef? }, level, source, … }`
 * — role grant không có `userId` nên phải đổi sang `subject`.
 *
 * Nhận CẢ HAI: p3-04 đổi hình dạng response của cùng endpoint, mà BE và app không ra cùng
 * lúc (BE có thể còn trả dạng cũ trong lúc app đã cập nhật, và ngược lại). Chuẩn hoá ở
 * đây thì phía trên (hook, màn) chỉ thấy MỘT hình dạng.
 */
interface RawSubjectRow {
  subject: {
    type: 'USER' | 'ROLE';
    user?: { id: string; name: string; avatarUrl?: string | null };
    roleRef?: string | null;
  };
  level: GrantLevel;
  source: GrantSource;
  grantedBy: string;
  createdAt: string;
}

export type RawGrantRow = ChannelGrant | RawSubjectRow;

function isRoleRef(value: unknown): value is RoleRef {
  return value === 'ADMIN' || value === 'MEMBER';
}

function isSubjectRow(row: RawGrantRow): row is RawSubjectRow {
  return 'subject' in row && typeof row.subject === 'object' && row.subject !== null;
}

export function normalizeGrants(rows: readonly RawGrantRow[]): ChannelGrantsSnapshot {
  const users: ChannelGrant[] = [];
  const roles: RoleGrant[] = [];

  for (const row of rows) {
    if (!isSubjectRow(row)) {
      users.push(row);
      continue;
    }

    const { subject } = row;
    if (subject.type === 'ROLE') {
      if (isRoleRef(subject.roleRef)) {
        roles.push({ roleRef: subject.roleRef, level: row.level, grantedBy: row.grantedBy, createdAt: row.createdAt });
      }
      continue;
    }

    if (subject.user) {
      users.push({
        userId: subject.user.id,
        name: subject.user.name,
        level: row.level,
        source: row.source,
        roleRef: null,
        grantedBy: row.grantedBy,
        createdAt: row.createdAt,
      });
    }
  }

  return { users, roles };
}
