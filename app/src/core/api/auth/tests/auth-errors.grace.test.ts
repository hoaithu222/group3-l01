import { AxiosError, type AxiosResponse } from 'axios';

import { getDeletionGraceUntil } from '../auth-errors';

describe('getDeletionGraceUntil (details của AUTH_012)', () => {
  const withDetails = (details: unknown) =>
    new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, {
      data: { error: { code: 'AUTH_012', details } },
      status: 403,
    } as unknown as AxiosResponse);

  it('đọc mốc hết ân hạn BE kèm theo', () => {
    expect(
      getDeletionGraceUntil(withDetails({ deletionGraceUntil: '2026-10-20T00:00:00.000Z' })),
    ).toBe('2026-10-20T00:00:00.000Z');
  });

  it('thiếu / sai kiểu / không phải lỗi HTTP ⇒ undefined (màn khôi phục hiện câu không nêu ngày)', () => {
    expect(getDeletionGraceUntil(withDetails(undefined))).toBeUndefined();
    expect(getDeletionGraceUntil(withDetails({ deletionGraceUntil: 123 }))).toBeUndefined();
    expect(getDeletionGraceUntil(withDetails({ deletionGraceUntil: '' }))).toBeUndefined();
    expect(getDeletionGraceUntil(withDetails(null))).toBeUndefined();
    expect(getDeletionGraceUntil(new Error('boom'))).toBeUndefined();
  });
});
