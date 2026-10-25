import { apiClient } from '@/core/api/client';

import { wellbeingService } from '../api/wellbeing.service';
import { assessment, disabledSetting, history, setting } from './wellbeing.harness';

/**
 * Hợp đồng gọi BE (`be/src/modules/burnout/burnout.routes.ts`): đường dẫn, tham số, thân yêu cầu, và ba điều bắt buộc — mọi lời gọi tắt toast của interceptor (màn tự nói lỗi bằng
 * câu `WELL_*`), `PUT` là đường DUY NHẤT bật/tắt và LUÔN gửi `optIn` (BE `.strict()`), `PATCH` (đổi cài đặt) KHÔNG BAO GIỜ mang `optIn` (nếu không thì đổi công tắc có thể bật lại theo dõi đã tắt),
 * và KHÔNG có lời gọi nào gửi `userId` (BE lấy từ token).
 */
jest.mock('@/core/api/client', () => ({
  apiClient: {
    delete: jest.fn(),
    get: jest.fn(),
    patch: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
  },
}));

const api = jest.mocked(apiClient);
const ok = (data: unknown) => Promise.resolve({ data: { data, success: true } });
const noContent = () => Promise.resolve({ data: undefined, status: 204 });

beforeEach(() => jest.clearAllMocks());

describe('wellbeingService', () => {
  it('setting: GET /me/wellbeing, bóc lớp bọc, tắt toast', async () => {
    api.get.mockReturnValue(ok(setting({ latest: assessment() })) as never);

    const result = await wellbeingService.setting();

    expect(api.get).toHaveBeenCalledWith('/me/wellbeing', { skipErrorToast: true });
    expect(result.enabled).toBe(true);
    expect(result.latest?.level).toBe('MEDIUM');
  });

  it('update bật: PUT { optIn: true } — chỉ hai trường app biết, không userId', async () => {
    api.put.mockReturnValue(ok(setting()) as never);

    await wellbeingService.update({ optIn: true });

    expect(api.put).toHaveBeenCalledWith(
      '/me/wellbeing',
      { optIn: true },
      { skipErrorToast: true },
    );
  });

  it('update tắt: PUT { optIn: false } (BE tắt + xoá dữ liệu, không cần cờ)', async () => {
    api.put.mockReturnValue(ok(disabledSetting()) as never);

    const result = await wellbeingService.update({ optIn: false });

    expect(api.put.mock.calls[0]?.[1]).toEqual({ optIn: false });
    expect(result.enabled).toBe(false);
  });

  it('patch nhắc nhẹ: PATCH { alertsEnabled } — KHÔNG optIn, không đi qua PUT', async () => {
    api.patch.mockReturnValue(ok(setting({ alertsEnabled: false })) as never);

    const result = await wellbeingService.patch({ alertsEnabled: false });

    expect(api.patch).toHaveBeenCalledWith(
      '/me/wellbeing',
      { alertsEnabled: false },
      { skipErrorToast: true },
    );
    expect(api.patch.mock.calls[0]?.[1]).not.toHaveProperty('optIn');
    expect(api.put).not.toHaveBeenCalled();
    expect(result.alertsEnabled).toBe(false);
  });

  it('history: GET /me/wellbeing/assessments?days=7|30', async () => {
    api.get.mockReturnValue(ok(history({ days: 30 })) as never);

    const result = await wellbeingService.history(30);

    expect(api.get).toHaveBeenCalledWith('/me/wellbeing/assessments', {
      params: { days: 30 },
      skipErrorToast: true,
    });
    expect(result.days).toBe(30);
  });

  it('ack: POST …/alerts/:id/ack với { action }', async () => {
    api.post.mockReturnValue(noContent() as never);

    await wellbeingService.ack('as1', 'SNOOZE');

    expect(api.post).toHaveBeenCalledWith(
      '/me/wellbeing/alerts/as1/ack',
      { action: 'SNOOZE' },
      { skipErrorToast: true },
    );
  });

  it('deleteData: DELETE /me/wellbeing/data', async () => {
    api.delete.mockReturnValue(noContent() as never);

    await wellbeingService.deleteData();

    expect(api.delete).toHaveBeenCalledWith('/me/wellbeing/data', { skipErrorToast: true });
  });

  it('phản hồi sai hợp đồng ⇒ ném lỗi tiếng Việt (không hiện dữ liệu hỏng)', async () => {
    api.get.mockReturnValue(ok({ enabled: 'có' }) as never);

    await expect(wellbeingService.setting()).rejects.toThrow('không đúng định dạng');
  });
});
