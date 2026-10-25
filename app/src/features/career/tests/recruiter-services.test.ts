import { apiClient } from '@/core/api/client';

import { jobSettingsService } from '../api/career-settings.service';
import { companyBlocksService } from '../api/company-blocks.service';
import { offersService } from '../api/offers.service';

/**
 * Contract phía app ↔ `be/src/modules/recruiter/**` (p6-08 app.md §8 "Contract"): `PUT /me/career` gửi ĐỦ hồ sơ + `consentVersion` khi bật; tin trong lời mời có `clientMessageId`;
 * `interested` gửi `shareEmail`; `decline` gửi mã lý do; báo cáo đi `POST /reports` với `JOB_OFFER`; danh sách cursor đọc `meta.nextCursor` ở gốc phản hồi. Mọi lời gọi `skipErrorToast`
 * (màn tự hiện lỗi đúng chỗ — toast chung sẽ hiện thêm một lần).
 */
const get = jest.spyOn(apiClient, 'get');
const post = jest.spyOn(apiClient, 'post');
const put = jest.spyOn(apiClient, 'put');
const del = jest.spyOn(apiClient, 'delete');
const NO_TOAST = { skipErrorToast: true };
const ok = <T>(data: T) => ({ data: { data, success: true } }) as never;

beforeEach(() => jest.clearAllMocks());

describe('hồ sơ Tìm việc', () => {
  it('đọc từ GET /me/career/job-settings', async () => {
    get.mockResolvedValue(ok({ openToWork: false }));
    await jobSettingsService.get();
    expect(get).toHaveBeenCalledWith('/me/career/job-settings', NO_TOAST);
  });

  it('PUT /me/career gửi consentVersion khi bật; tắt thì không kèm', async () => {
    put.mockResolvedValue(ok({ openToWork: true }));
    await jobSettingsService.update({
      consentVersion: 'v1',
      headline: 'Sinh viên',
      location: null,
      openToWork: true,
      preferredRoles: ['Backend'],
    });
    expect(put).toHaveBeenLastCalledWith(
      '/me/career',
      {
        consentVersion: 'v1',
        headline: 'Sinh viên',
        location: null,
        openToWork: true,
        preferredRoles: ['Backend'],
      },
      NO_TOAST,
    );

    await jobSettingsService.update({
      headline: null,
      location: null,
      openToWork: false,
      preferredRoles: [],
    });
    expect(put.mock.calls[1]?.[1]).not.toHaveProperty('consentVersion');
  });
});

describe('lời mời + thread', () => {
  it('danh sách đọc meta.nextCursor ở GỐC phản hồi (unwrapData vứt meta)', async () => {
    get.mockResolvedValue({ data: { data: [{ id: 'o1' }], meta: { nextCursor: 'c2' } } } as never);
    await expect(offersService.list('c1')).resolves.toEqual({
      items: [{ id: 'o1' }],
      nextCursor: 'c2',
    });
    expect(get).toHaveBeenCalledWith('/me/offers', {
      params: { cursor: 'c1', limit: 50 },
      ...NO_TOAST,
    });
  });

  it('quan tâm gửi shareEmail; từ chối gửi mã lý do; id được mã hoá trong đường dẫn', async () => {
    post.mockResolvedValue(ok({ id: 'o/1' }));
    await offersService.interested('o/1', false);
    expect(post).toHaveBeenLastCalledWith(
      '/me/offers/o%2F1/interested',
      { shareEmail: false },
      NO_TOAST,
    );
    await offersService.decline('o1', 'NOT_LOOKING');
    expect(post).toHaveBeenLastCalledWith(
      '/me/offers/o1/decline',
      { reason: 'NOT_LOOKING' },
      NO_TOAST,
    );
  });

  it('tin trong lời mời gửi tới /offers/:id/messages (không dưới /me) với clientMessageId + content', async () => {
    post.mockResolvedValue(ok({ id: 'm1' }));
    await offersService.sendMessage('o1', { clientMessageId: 'uuid-1234-5678', content: 'Chào' });
    expect(post).toHaveBeenCalledWith(
      '/offers/o1/messages',
      { clientMessageId: 'uuid-1234-5678', content: 'Chào' },
      NO_TOAST,
    );

    get.mockResolvedValue({ data: { data: [], meta: { nextCursor: null } } } as never);
    await offersService.messages('o1', 'cu');
    expect(get).toHaveBeenLastCalledWith('/offers/o1/messages', {
      params: { cursor: 'cu', limit: 30 },
      ...NO_TOAST,
    });
  });
});

describe('chặn doanh nghiệp + báo cáo', () => {
  it('chặn POST /me/company-blocks { companyId }; bỏ chặn DELETE /me/company-blocks/:id', async () => {
    post.mockResolvedValue(ok({ blocked: true }));
    del.mockResolvedValue(ok({ blocked: false }));
    await companyBlocksService.block('c1');
    expect(post).toHaveBeenCalledWith('/me/company-blocks', { companyId: 'c1' }, NO_TOAST);
    await companyBlocksService.unblock('c1');
    expect(del).toHaveBeenCalledWith('/me/company-blocks/c1', NO_TOAST);
  });

  it('báo cáo lời mời đi POST /reports với targetType JOB_OFFER', async () => {
    post.mockResolvedValue(ok({ alreadyReported: false }));
    await companyBlocksService.reportOffer('o1', 'SCAM', 'Đòi phí tuyển dụng');
    expect(post).toHaveBeenCalledWith(
      '/reports',
      {
        description: 'Đòi phí tuyển dụng',
        reason: 'SCAM',
        targetId: 'o1',
        targetType: 'JOB_OFFER',
      },
      NO_TOAST,
    );
  });
});
