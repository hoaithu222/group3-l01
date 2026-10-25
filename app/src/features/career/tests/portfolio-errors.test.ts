import { AxiosError } from 'axios';

import {
  isFeatureOff,
  isSlugError,
  isVersionConflict,
  PORTFOLIO_ERROR_MESSAGES,
  portfolioErrorMessage,
} from '../utils/portfolio-errors';

/**
 * app.md p6-07 §3, §8: mã `PORT_001..012` (be.md §8) → câu tiếng Việt HƯỚNG DẪN; `PORT_010` chỉ ra mục còn trống (`details.emptySections`); `RES_003` = lệch phiên bản;
 * 404 `CFG_005` = cờ tắt. Câu không phụ thuộc chữ `message` của server (server có thể đổi/đổi ngôn ngữ).
 */
function apiError(status: number, code: string, details?: unknown): AxiosError {
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    config: {} as never,
    data: { error: { code, details, message: 'Câu của server — KHÔNG được dùng' } },
    headers: {},
    status,
    statusText: '',
  });
}

describe('portfolioErrorMessage', () => {
  it.each([
    ['PORT_001', 409, 'Đường dẫn này đã có người dùng'],
    ['PORT_002', 400, 'chữ thường, số và dấu gạch ngang'],
    ['PORT_003', 400, 'từ không được phép'],
    ['PORT_004', 404, 'chưa có task hoàn thành'],
    ['PORT_005', 409, 'số dự án tối đa'],
    ['PORT_006', 409, 'đã có trong hồ sơ'],
    ['PORT_007', 429, 'làm mới số liệu quá nhiều'],
    ['PORT_008', 403, 'đã bị gỡ do vi phạm'],
    ['PORT_009', 409, 'đang được tạo trang'],
    ['PORT_011', 409, 'chưa được công khai'],
    ['PORT_012', 409, 'không ở trạng thái bị gỡ'],
    ['RES_003', 409, 'vừa được thay đổi ở nơi khác'],
  ])('%s → câu tiếng Việt của app, không dùng chữ của server', (code, status, fragment) => {
    const message = portfolioErrorMessage(apiError(status, code));
    expect(message).toContain(fragment);
    expect(message).not.toContain('KHÔNG được dùng');
  });

  it('bảng phủ đủ PORT_001..012 (PORT_010 có nhánh riêng)', () => {
    const codes = Array.from({ length: 12 }, (_, i) => `PORT_${String(i + 1).padStart(3, '0')}`);
    expect(
      codes.filter((code) => code !== 'PORT_010').every((code) => PORTFOLIO_ERROR_MESSAGES[code]),
    ).toBe(true);
  });

  it('PORT_010: nêu tên mục còn trống; mọi mục đang tắt ⇒ bảo bật ở màn Giao diện', () => {
    const empty = apiError(400, 'PORT_010', {
      emptySections: ['PROJECTS', 'ABOUT'],
      visibleSections: ['ABOUT', 'PROJECTS'],
    });
    expect(portfolioErrorMessage(empty)).toBe(
      'Hồ sơ chưa có nội dung để công khai. Hãy bổ sung nội dung cho: Dự án, Giới thiệu.',
    );
    const allOff = apiError(400, 'PORT_010', { emptySections: [], visibleSections: [] });
    expect(portfolioErrorMessage(allOff)).toContain('bật ít nhất một mục ở màn Giao diện');
    expect(portfolioErrorMessage(apiError(400, 'PORT_010'))).toBe(
      'Hồ sơ chưa có nội dung để công khai.',
    );
  });

  it('mã lạ / lỗi không phải axios rơi về câu chung, không ném', () => {
    expect(portfolioErrorMessage(apiError(500, 'SYS_500'))).toBeTruthy();
    expect(portfolioErrorMessage(new Error('boom'))).toBe('boom');
    expect(portfolioErrorMessage('lạ')).toBeTruthy();
  });
});

describe('phân loại lỗi', () => {
  it('RES_003 chỉ khi 409; CFG_005 = cờ tắt; PORT_001..003 = lỗi ô slug', () => {
    expect(isVersionConflict(apiError(409, 'RES_003'))).toBe(true);
    expect(isVersionConflict(apiError(400, 'RES_003'))).toBe(false);
    expect(isFeatureOff(apiError(404, 'CFG_005'))).toBe(true);
    expect(isFeatureOff(apiError(404, 'RES_001'))).toBe(false);
    expect(
      ['PORT_001', 'PORT_002', 'PORT_003', 'PORT_004'].map((code) =>
        isSlugError(apiError(400, code)),
      ),
    ).toEqual([true, true, true, false]);
  });
});
