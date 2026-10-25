/** Vai hệ thống của người thực hiện → nhãn (khớp `features/user`, không import chéo feature). */
export const AUDIT_ACTOR_ROLE_LABEL: Readonly<Record<string, string>> = {
  admin: 'Quản trị viên',
  manager: 'Quản lý',
  user: 'Người dùng',
};

/** BE ghi `"unknown"` khi nơi gọi `record()` không truyền `actorRole` — coi như KHÔNG biết. */
export const AUDIT_UNKNOWN_ROLE = 'unknown';

/** Cắt cột "Lý do" ở bảng — đầy đủ nằm ở tooltip và drawer. */
export const AUDIT_REASON_PREVIEW_LENGTH = 80;

/** Khoá query param của bộ lọc (URL là nguồn sự thật — xem `api-patterns.md`). */
export const AUDIT_FILTER_KEYS = [
  'actorId',
  'action',
  'targetType',
  'targetId',
  'workspaceId',
  'from',
  'to',
] as const;

/** Định dạng ngày trong URL (`?from=2026-09-01`). */
export const AUDIT_URL_DATE_FORMAT = 'YYYY-MM-DD';

/** ObjectId MongoDB — `actorId`/`workspaceId` ở BE là `@db.ObjectId`, sai định dạng bị trả 400. */
export const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;
