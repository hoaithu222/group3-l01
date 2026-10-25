import { TEMPLATE_ERROR_MESSAGES } from '../constants/workspace-templates.constants';
import {
  defaultChannelKeys,
  selectionSignature,
  selectTemplate,
  toggleChannelKey,
} from '../utils/selection';
import { planSkips } from '../utils/skip-plan';
import { describeTemplateError } from '../utils/template-errors';
import { apiError, CAPSTONE, COURSE, networkError } from './fixtures';

describe('selection', () => {
  it('chọn mẫu ⇒ đúng các kênh defaultSelected theo thứ tự khai báo của mẫu', () => {
    expect(defaultChannelKeys(COURSE)).toEqual(['thong-bao', 'thao-luan']);
    expect(selectTemplate(CAPSTONE)).toEqual({ channelKeys: ['tien-do'], code: 'capstone' });
  });

  it('bật/tắt một kênh: KHÔNG sửa lựa chọn cũ, kết quả theo thứ tự của mẫu (không theo thứ tự tick)', () => {
    const start = { channelKeys: ['thao-luan'], code: 'course' };

    const withAll = toggleChannelKey(
      COURSE,
      toggleChannelKey(COURSE, start, 'phong-hoc', true),
      'thong-bao',
      true,
    );
    const without = toggleChannelKey(COURSE, withAll, 'thao-luan', false);

    expect(withAll.channelKeys).toEqual(['thong-bao', 'thao-luan', 'phong-hoc']);
    expect(without.channelKeys).toEqual(['thong-bao', 'phong-hoc']);
    expect(start.channelKeys).toEqual(['thao-luan']);
    // Khoá lạ (không thuộc mẫu) không lọt vào lựa chọn.
    expect(toggleChannelKey(COURSE, start, 'khong-co', true).channelKeys).toEqual(['thao-luan']);
  });

  it('chữ ký body không phụ thuộc thứ tự khoá; chưa chọn mẫu ⇒ chuỗi rỗng', () => {
    expect(selectionSignature({ channelKeys: ['b', 'a'], code: 'course' })).toBe(
      selectionSignature({ channelKeys: ['a', 'b'], code: 'course' }),
    );
    expect(selectionSignature({ channelKeys: ['a'], code: 'course' })).not.toBe(
      selectionSignature({ channelKeys: ['a'], code: 'capstone' }),
    );
    expect(selectionSignature(null)).toBe('');
  });
});

describe('planSkips — báo trước kênh bị bỏ qua (BE mới là chuẩn)', () => {
  it('trùng tên KHÔNG phân biệt dấu/hoa thường (như normalizeSearch của BE)', () => {
    const plan = planSkips(COURSE, ['thao luan', 'PHÒNG HỌC', 'Kênh khác'], new Set());

    expect(plan).toEqual({ 'phong-hoc': 'NAME_EXISTS', 'thao-luan': 'NAME_EXISTS' });
  });

  it('loại kênh đang tắt ⇒ TYPE_UNAVAILABLE; trùng tên được ưu tiên hơn', () => {
    expect(planSkips(COURSE, [], new Set(['VOICE']))).toEqual({ 'phong-hoc': 'TYPE_UNAVAILABLE' });
    expect(planSkips(COURSE, ['Phòng học'], new Set(['VOICE']))).toEqual({
      'phong-hoc': 'NAME_EXISTS',
    });
  });

  it('không có gì trùng/tắt ⇒ bảng rỗng (mọi kênh sẽ được tạo)', () => {
    expect(planSkips(COURSE, ['Kênh khác'], new Set())).toEqual({});
  });
});

describe('describeTemplateError', () => {
  it('TPL_001..003 và CFG_005: loại + câu tiếng Việt của feature', () => {
    expect(describeTemplateError(apiError(404, 'TPL_001'))).toEqual({
      code: 'TPL_001',
      kind: 'template-gone',
      message: TEMPLATE_ERROR_MESSAGES.TPL_001,
    });
    expect(describeTemplateError(apiError(409, 'TPL_002')).kind).toBe('archived');
    expect(describeTemplateError(apiError(409, 'TPL_003'))).toMatchObject({
      kind: 'channel-limit',
      message: expect.stringContaining('số kênh tối đa'),
    });
    expect(describeTemplateError(apiError(404, 'CFG_005')).kind).toBe('feature-off');
  });

  it('403 ⇒ forbidden; 429 ⇒ rate-limited; không có phản hồi ⇒ offline; lỗi khác ⇒ other', () => {
    expect(describeTemplateError(apiError(403, 'PERM_403')).kind).toBe('forbidden');
    expect(describeTemplateError(apiError(429, 'RATE_002')).kind).toBe('rate-limited');
    expect(describeTemplateError(networkError()).kind).toBe('offline');
    expect(describeTemplateError(apiError(500, 'INTERNAL')).kind).toBe('other');
    expect(describeTemplateError(new Error('boom')).kind).toBe('other');
  });
});
