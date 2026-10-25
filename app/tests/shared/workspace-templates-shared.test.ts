import {
  skipReasonLabel,
  summarizeTemplateResult,
  type TemplateApplyResult,
} from '@/shared/workspace-templates';

/**
 * Kết quả ÁP MẪU dùng chung (p5-04) giữa `workspaces` (`data.template` của `POST /workspaces`) và `workspace-templates`: một câu tóm tắt
 * GỌN cho toast sau khi tạo nhóm, và lý do bỏ qua bằng chữ (không hiện mã kỹ thuật cho người dùng).
 */

const created = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `c-${i}`, key: `k-${i}`, name: `Kênh ${i}` }));
const skipped = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ key: `s-${i}`, reason: 'NAME_EXISTS' }));

const result = (patch: Partial<TemplateApplyResult>): TemplateApplyResult => ({
  createdChannels: [],
  skipped: [],
  ...patch,
});

describe('summarizeTemplateResult', () => {
  it('tạo hết, không bỏ qua ⇒ success', () => {
    expect(summarizeTemplateResult(result({ createdChannels: created(3) }))).toEqual({
      message: 'Đã tạo 3 kênh theo mẫu.',
      tone: 'success',
    });
  });

  it('tạo được một phần, có bỏ qua ⇒ info kèm số kênh bỏ qua', () => {
    expect(
      summarizeTemplateResult(result({ createdChannels: created(2), skipped: skipped(1) })),
    ).toEqual({
      message: 'Đã tạo 2 kênh theo mẫu · bỏ qua 1 kênh.',
      tone: 'info',
    });
  });

  it('không tạo được kênh nào vì bị bỏ qua hết ⇒ info', () => {
    expect(summarizeTemplateResult(result({ skipped: skipped(2) }))).toEqual({
      message: 'Không tạo kênh mới — 2 kênh bị bỏ qua.',
      tone: 'info',
    });
  });

  it('chọn mẫu nhưng bỏ tick hết kênh (channelKeys rỗng) ⇒ câu trung tính', () => {
    expect(summarizeTemplateResult(result({}))).toEqual({
      message: 'Không có kênh nào được tạo theo mẫu.',
      tone: 'info',
    });
  });

  it('failed:true (nhóm đã tạo nhưng áp mẫu lỗi) ⇒ warning kèm hướng xử lý, bất kể số kênh', () => {
    const summary = summarizeTemplateResult(result({ createdChannels: created(1), failed: true }));

    expect(summary.tone).toBe('warning');
    expect(summary.message).toContain('Đã tạo nhóm nhưng chưa tạo được kênh theo mẫu');
    expect(summary.message).toContain('áp lại mẫu trong Cài đặt nhóm');
  });
});

describe('skipReasonLabel', () => {
  it('lý do đã biết ⇒ chữ tiếng Việt; lý do BE thêm sau này ⇒ câu chung, không lộ mã kỹ thuật', () => {
    expect(skipReasonLabel('NAME_EXISTS')).toBe('đã có kênh trùng tên');
    expect(skipReasonLabel('TYPE_UNAVAILABLE')).toBe('loại kênh này chưa được bật');
    expect(skipReasonLabel('SOMETHING_NEW')).toBe('không tạo được');
  });
});
