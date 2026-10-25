import { docsErrorMessage, isNotAvailable, isVersionConflict } from '../utils/docs-errors';

/** Mã lỗi BE `DOC_001..009` (+ `RES_003`) → câu tiếng Việt hiện đúng chỗ; 404/`CFG_005` = không còn khả dụng; `RES_003` = phiên bản lệch. */
function apiError(status: number, code: string) {
  return Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: { data: { error: { code, message: code } }, headers: {}, status },
  });
}

describe('mã lỗi DOC_ → tiếng Việt', () => {
  it.each([
    ['DOC_001', /số tài liệu tối đa/],
    ['DOC_002', /xác nhận/],
    ['DOC_003', /không thuộc nhóm/],
    ['DOC_004', /số người cộng tác tối đa/],
    ['DOC_005', /lưu trữ, chỉ xem/],
    ['DOC_006', /dung lượng/],
    ['DOC_007', /bản lưu thủ công/],
    ['DOC_008', /Không thể lưu tài liệu đã lưu trữ/],
    ['DOC_009', /chưa sẵn sàng/],
    ['RES_003', /vừa được thay đổi/],
  ])('%s', (code, pattern) => {
    expect(docsErrorMessage(apiError(409, code))).toMatch(pattern);
  });

  it('404/CFG_005 = không còn khả dụng; RES_003 = xung đột phiên bản; lỗi lạ rơi về bộ dịch chung', () => {
    expect(isNotAvailable(apiError(404, 'RES_001'))).toBe(true);
    expect(isNotAvailable(apiError(404, 'CFG_005'))).toBe(true);
    expect(isNotAvailable(apiError(403, 'DOC_005'))).toBe(false);
    expect(isVersionConflict(apiError(409, 'RES_003'))).toBe(true);
    expect(docsErrorMessage(new Error('boom'))).toBe('boom');
  });
});
