import { AxiosError, type AxiosResponse } from 'axios';

import { isWorkspaceGone } from '../utils/workspace-errors';

function axiosError(status: number | undefined): AxiosError {
  const error = new AxiosError('lỗi');
  if (status !== undefined) error.response = { status } as AxiosResponse;
  return error;
}

describe('isWorkspaceGone', () => {
  it('404 (không phải thành viên / vừa bị loại — BE trả trung tính) ⇒ nhóm đã mất', () => {
    expect(isWorkspaceGone(axiosError(404))).toBe(true);
  });

  it('403 ⇒ nhóm đã mất', () => {
    expect(isWorkspaceGone(axiosError(403))).toBe(true);
  });

  it('mất sóng / 5xx ⇒ KHÔNG mất nhóm (⛔ không đá người dùng ra chỉ vì một nhịp mất mạng)', () => {
    expect(isWorkspaceGone(axiosError(undefined))).toBe(false);
    expect(isWorkspaceGone(axiosError(500))).toBe(false);
  });

  it('lỗi không phải axios / không có lỗi ⇒ false', () => {
    expect(isWorkspaceGone(new Error('x'))).toBe(false);
    expect(isWorkspaceGone(null)).toBe(false);
  });
});
