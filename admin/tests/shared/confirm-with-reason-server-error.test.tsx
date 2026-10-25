/**
 * `ConfirmWithReasonModal` — BE từ chối chính lý do (`400 VAL_001`, `details.reason`) phải hiện
 * DƯỚI Ô LÝ DO (p0-12 admin.md §2.3), modal giữ mở để sửa và gửi lại; lỗi khác không bị nuốt.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmWithReasonModal } from '@/shared/ui';
import {
  REASON_SERVER_ERROR_FALLBACK,
  reasonServerError,
} from '@/shared/ui/overlays/reason-server-error';

function apiError(status: number, error: { code: string; message?: string; details?: unknown }) {
  const response = {
    status,
    data: { success: false, error: { message: 'Dữ liệu không hợp lệ', ...error } },
  } as AxiosResponse;
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, response);
}

const val001 = (details: unknown) => apiError(400, { code: 'VAL_001', details });

describe('reasonServerError', () => {
  it('VAL_001 có details.reason → câu lỗi đầu tiên đã trim', () => {
    expect(reasonServerError(val001({ reason: ['  Lý do tối thiểu 10 ký tự ', 'khác'] }))).toBe(
      'Lý do tối thiểu 10 ký tự',
    );
    expect(reasonServerError(val001({ reason: 'Lý do quá dài' }))).toBe('Lý do quá dài');
  });

  it('câu lỗi rỗng/không phải chuỗi → câu dự phòng tiếng Việt (vẫn gắn được vào ô)', () => {
    expect(reasonServerError(val001({ reason: [] }))).toBe(REASON_SERVER_ERROR_FALLBACK);
    expect(reasonServerError(val001({ reason: [''] }))).toBe(REASON_SERVER_ERROR_FALLBACK);
  });

  it('không nói về lý do → null (để nơi gọi/toast chung xử lý)', () => {
    expect(reasonServerError(val001({ value: ['Sai định dạng'] }))).toBeNull();
    expect(reasonServerError(val001(null))).toBeNull();
    expect(reasonServerError(val001(['reason']))).toBeNull();
    expect(reasonServerError(apiError(409, { code: 'RES_003', details: { reason: ['x'] } }))).toBeNull();
    expect(reasonServerError(new Error('mạng lỗi'))).toBeNull();
    expect(reasonServerError(undefined)).toBeNull();
  });
});

describe('ConfirmWithReasonModal — lỗi VAL_001 của lý do', () => {
  const setup = (onConfirm: (reason: string) => Promise<void>) => {
    const onOpenChange = vi.fn();
    // FormModal ghi `console.error` khi onConfirm ném lỗi (giữ modal mở) — chủ đích, tắt cho gọn.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ConfirmWithReasonModal
        impact="Tác động."
        minReasonLength={5}
        open
        title="Khoá tài khoản"
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
      />,
    );
    return { onOpenChange, errorSpy };
  };

  it('BE trả details.reason → hiện dưới ô lý do, modal GIỮ MỞ; sửa lý do và gửi lại được', async () => {
    const user = userEvent.setup();
    const onConfirm = vi
      .fn<(reason: string) => Promise<void>>()
      .mockRejectedValueOnce(val001({ reason: ['Lý do tối thiểu 10 ký tự'] }))
      .mockResolvedValueOnce(undefined);
    const { onOpenChange, errorSpy } = setup(onConfirm);

    // Ngưỡng client (5) thấp hơn BE (10) → qua form, bị BE từ chối.
    await user.type(screen.getByLabelText(/Lý do/i), 'sáu ký');
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }));

    expect(await screen.findByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeEnabled();

    await user.clear(screen.getByLabelText(/Lý do/i));
    await user.type(screen.getByLabelText(/Lý do/i), 'Vi phạm điều khoản sử dụng');
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() => expect(onConfirm).toHaveBeenLastCalledWith('Vi phạm điều khoản sử dụng'));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(screen.queryByText('Lý do tối thiểu 10 ký tự')).not.toBeInTheDocument();
    errorSpy.mockRestore();
  });

  it('VAL_001 ở trường KHÁC hoặc lỗi không phải VAL_001 → không gắn vào ô lý do; modal vẫn giữ mở', async () => {
    const user = userEvent.setup();
    const onConfirm = vi
      .fn<(reason: string) => Promise<void>>()
      .mockRejectedValueOnce(val001({ value: ['Sai định dạng'] }))
      .mockRejectedValueOnce(apiError(500, { code: 'SYS_500', details: { reason: ['x'] } }));
    const { onOpenChange, errorSpy } = setup(onConfirm);

    await user.type(screen.getByLabelText(/Lý do/i), 'Lý do đủ dài để gửi');
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(2));

    expect(screen.queryByText('Sai định dạng')).not.toBeInTheDocument();
    expect(screen.queryByText('x')).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    errorSpy.mockRestore();
  });
});
