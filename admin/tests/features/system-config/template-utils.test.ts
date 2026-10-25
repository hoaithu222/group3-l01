/**
 * Phần THUẦN của tab "Mẫu nhóm" (p5-04 admin.md §2.1, §4): schema form (khoá/tên trùng, "Chung", số kênh, đếm grapheme),
 * phần thay đổi gửi lên, thứ tự kéo-thả, khoá loại kênh theo cờ, đọc lỗi 400 của BE và dòng cờ phụ ở tab Tính năng.
 */
import { describe, expect, it } from 'vitest';

import type { Capabilities } from '@/core/capabilities';
import {
  templateFormSchema,
  type TemplateFormValues,
} from '@/features/system-config/templates/schemas/template.schema';
import type {
  TemplateChannel,
  WorkspaceTemplate,
} from '@/features/system-config/templates/types/templates.types';
import { buildChannelTypeOptions } from '@/features/system-config/templates/utils/channel-type-options';
import { serverFieldErrors } from '@/features/system-config/templates/utils/template-errors';
import {
  diffTemplate,
  summarizePatch,
  toTemplateForm,
} from '@/features/system-config/templates/utils/template-form';
import {
  describeSequence,
  moveTemplate,
  orderChanges,
} from '@/features/system-config/templates/utils/template-reorder';
import { graphemeLength } from '@/features/system-config/templates/utils/template-text';
import type { SystemConfigItem } from '@/features/system-config/types/system-config.types';
import {
  buildFeatureRows,
  lockReason,
  splitFeatureRows,
} from '@/features/system-config/utils/feature-rows';

const channel = (over: Partial<TemplateChannel> = {}): TemplateChannel => ({
  key: 'thong-bao',
  name: 'Thông báo',
  description: '',
  type: 'TEXT',
  visibility: 'PUBLIC',
  postingPolicy: 'MEMBERS',
  defaultSelected: true,
  ...over,
});

const template = (over: Partial<WorkspaceTemplate> = {}): WorkspaceTemplate => ({
  code: 'course',
  name: 'Nhóm môn học',
  description: 'Lớp học phần',
  channels: [channel(), channel({ key: 'thao-luan', name: 'Thảo luận' })],
  isActive: true,
  order: 1,
  version: 3,
  updatedBy: null,
  updatedAt: '2026-09-20T03:00:00.000Z',
  ...over,
});

const form = (over: Partial<TemplateFormValues> = {}): TemplateFormValues => ({
  ...toTemplateForm(template()),
  ...over,
});

/**
 * Lỗi theo đường dẫn (`channels.1.key`) sau khi kiểm bằng schema. Mỗi ô giữ lỗi ĐẦU TIÊN — đúng cái react-hook-form
 * hiện (`zodResolver` mặc định `criteriaMode: firstError`).
 */
function issuesOf(values: TemplateFormValues): Record<string, string> {
  const result = templateFormSchema.safeParse(values);
  const out: Record<string, string> = {};
  if (result.success) return out;
  for (const issue of result.error.issues) {
    const path = issue.path.join('.');
    if (!(path in out)) out[path] = issue.message;
  }
  return out;
}

describe('templateFormSchema', () => {
  it('bản seed hợp lệ đi qua', () => {
    expect(templateFormSchema.safeParse(form()).success).toBe(true);
  });

  it('tên mẫu 2–60 ký tự hiển thị; mô tả ≤ 300', () => {
    expect(issuesOf(form({ name: '   ' })).name).toBe('Nhập tên mẫu');
    expect(issuesOf(form({ name: 'A' })).name).toMatch(/2–60/);
    expect(issuesOf(form({ name: 'A'.repeat(61) })).name).toMatch(/2–60/);
    expect(issuesOf(form({ name: 'Đồ án' }))).toEqual({});
    expect(issuesOf(form({ description: 'x'.repeat(301) })).description).toMatch(/300/);
  });

  it('1–15 kênh', () => {
    expect(issuesOf(form({ channels: [] })).channels).toMatch(/ít nhất 1/);
    const many = Array.from({ length: 16 }, (_, i) => channel({ key: `k${i}`, name: `Kênh ${i}` }));
    expect(issuesOf(form({ channels: many })).channels).toMatch(/tối đa 15/);
    expect(issuesOf(form({ channels: many.slice(0, 15) }))).toEqual({});
  });

  it('khoá kênh: a-z, 0-9, gạch ngang; ≤ 40; duy nhất', () => {
    const at = (key: string) => issuesOf(form({ channels: [channel({ key })] }))['channels.0.key'];
    expect(at('Ab_c')).toMatch(/a-z, 0-9/);
    expect(at('có dấu')).toMatch(/a-z, 0-9/);
    expect(at('a'.repeat(41))).toMatch(/40/);
    expect(at('a'.repeat(40))).toBeUndefined();
    expect(at('   ')).toBe('Nhập khoá kênh');

    const dup = issuesOf(
      form({ channels: [channel({ key: 'ab' }), channel({ key: 'cd', name: 'Hai' }), channel({ key: 'ab', name: 'Ba' })] }),
    );
    expect(dup['channels.2.key']).toBe('Khoá kênh bị trùng');
    expect(dup['channels.0.key']).toBeUndefined();
  });

  it('tên kênh trùng SAU chuẩn hoá ("Frontend" vs "frontend ", có dấu/không dấu) bị chặn ở hàng sau', () => {
    const at = (a: string, b: string) =>
      issuesOf(
        form({ channels: [channel({ key: 'a', name: a }), channel({ key: 'b', name: b })] }),
      )['channels.1.name'];
    expect(at('Frontend', 'frontend ')).toBe('Tên kênh bị trùng trong mẫu');
    expect(at('Đồ án', 'do an')).toBe('Tên kênh bị trùng trong mẫu');
    expect(at('Frontend', 'Backend')).toBeUndefined();
  });

  it('cấm tên "Chung" (kênh mặc định tự tạo), kể cả "chung "/"CHÚNG"', () => {
    for (const name of ['Chung', 'chung ', 'CHUNG', 'Chúng']) {
      expect(issuesOf(form({ channels: [channel({ name })] }))['channels.0.name']).toMatch(/Chung/);
    }
    expect(issuesOf(form({ channels: [channel({ name: 'Chung cư' })] }))).toEqual({});
  });

  it('tên kênh đếm grapheme: emoji ghép tính 1 ký tự như BE', () => {
    expect(graphemeLength('👨‍👩‍👧‍👦')).toBe(1);
    expect(graphemeLength('Đồ án')).toBe(5);
    const family = '👨‍👩‍👧‍👦';
    const at = (name: string) => issuesOf(form({ channels: [channel({ name })] }))['channels.0.name'];
    expect(at(family.repeat(60))).toBeUndefined();
    expect(at(family.repeat(61))).toMatch(/2–60/);
    expect(at('A')).toMatch(/2–60/);
  });
});

describe('diffTemplate / summarizePatch', () => {
  it('không đổi gì → rỗng (nút Lưu khoá); khoảng trắng đầu-cuối không tính là đổi', () => {
    const t = template();
    expect(diffTemplate(toTemplateForm(t), t)).toEqual({});
    expect(diffTemplate(form({ name: '  Nhóm môn học  ' }), t)).toEqual({});
  });

  it('chỉ gửi trường đã đổi; hàng kênh được cắt trắng', () => {
    const t = template();
    expect(diffTemplate(form({ name: 'Lớp học phần' }), t)).toEqual({ name: 'Lớp học phần' });
    expect(diffTemplate(form({ isActive: false }), t)).toEqual({ isActive: false });
    expect(diffTemplate(form({ description: '' }), t)).toEqual({ description: '' });

    const edited = form({
      channels: [channel({ key: ' thong-bao ', name: ' Thông báo mới ' }), channel({ key: 'thao-luan', name: 'Thảo luận' })],
    });
    expect(diffTemplate(edited, t).channels?.[0]).toMatchObject({ key: 'thong-bao', name: 'Thông báo mới' });
  });

  it('đổi thứ tự / thêm / bớt hàng = đổi `channels`', () => {
    const t = template();
    const [a, b] = toTemplateForm(t).channels;
    expect(diffTemplate(form({ channels: [b, a] }), t)).toHaveProperty('channels');
    expect(diffTemplate(form({ channels: [a] }), t)).toHaveProperty('channels');
    expect(diffTemplate(form({ channels: [a, b, channel({ key: 'moi', name: 'Mới' })] }), t)).toHaveProperty('channels');
    expect(diffTemplate(form({ channels: [a, { ...b, defaultSelected: false }] }), t)).toHaveProperty('channels');
  });

  it('tóm tắt liệt kê trường đổi bằng tiếng Việt', () => {
    expect(summarizePatch({ name: 'x', isActive: false })).toBe('Thay đổi: tên, trạng thái bật/tắt.');
    expect(summarizePatch({})).toBe('Không có thay đổi.');
  });
});

describe('thứ tự mẫu', () => {
  const a = template({ code: 'a', name: 'A', order: 1, version: 2 });
  const b = template({ code: 'b', name: 'B', order: 2, version: 4 });
  const c = template({ code: 'c', name: 'C', order: 3, version: 6 });

  it('moveTemplate chuyển tới vị trí đích, không sửa mảng gốc; khoá lạ/trùng → giữ nguyên', () => {
    const list = [a, b, c];
    expect(moveTemplate(list, 'c', 'a').map((t) => t.code)).toEqual(['c', 'a', 'b']);
    expect(moveTemplate(list, 'a', 'c').map((t) => t.code)).toEqual(['b', 'c', 'a']);
    expect(moveTemplate(list, 'a', 'a').map((t) => t.code)).toEqual(['a', 'b', 'c']);
    expect(moveTemplate(list, 'x', 'a').map((t) => t.code)).toEqual(['a', 'b', 'c']);
    expect(list.map((t) => t.code)).toEqual(['a', 'b', 'c']);
  });

  it('orderChanges chỉ trả mẫu đổi `order`, kèm expectedVersion của CHÍNH mẫu đó', () => {
    // đổi chỗ hai mẫu cạnh nhau → chỉ hai mẫu đó
    expect(orderChanges(moveTemplate([a, b, c], 'b', 'a'))).toEqual([
      { code: 'b', order: 1, expectedVersion: 4 },
      { code: 'a', order: 2, expectedVersion: 2 },
    ]);
    // kéo mẫu cuối lên đầu → cả ba dịch chỗ
    expect(orderChanges(moveTemplate([a, b, c], 'c', 'a')).map((x) => [x.code, x.order])).toEqual([
      ['c', 1],
      ['a', 2],
      ['b', 3],
    ]);
    // thứ tự hiện tại đã đúng → không có gì để lưu
    expect(orderChanges([a, b, c])).toEqual([]);
  });

  it('chuẩn hoá `order` trùng nhau (cùng 0) về 1..n', () => {
    const zero = [a, b, c].map((t) => ({ ...t, order: 0 }));
    expect(orderChanges(zero).map((x) => x.order)).toEqual([1, 2, 3]);
  });

  it('describeSequence nối tên bằng mũi tên', () => {
    expect(describeSequence([a, b, c])).toBe('A → B → C');
  });
});

describe('buildChannelTypeOptions', () => {
  const state = (opts: ReturnType<typeof buildChannelTypeOptions>) =>
    Object.fromEntries(opts.map((o) => [o.value, Boolean(o.disabled)]));

  it('TEXT luôn chọn được; VOICE/POMODORO khoá theo cờ phân hệ', () => {
    expect(state(buildChannelTypeOptions({ voice: false, pomodoro: false }))).toEqual({
      TEXT: false,
      VOICE: true,
      POMODORO: true,
    });
    expect(state(buildChannelTypeOptions({ voice: true, pomodoro: false }))).toEqual({
      TEXT: false,
      VOICE: false,
      POMODORO: true,
    });
    expect(state(buildChannelTypeOptions({ voice: true, pomodoro: true }))).toEqual({
      TEXT: false,
      VOICE: false,
      POMODORO: false,
    });
  });
});

describe('serverFieldErrors (VAL_001 của BE)', () => {
  const axiosLike = (details: unknown) => ({
    response: { data: { success: false, error: { code: 'VAL_001', message: 'x', details } } },
  });

  it('đọc lỗi trường cấp 1 (`flatten().fieldErrors` = { trường: string[] })', () => {
    expect(serverFieldErrors(axiosLike({ channels: ['Tên kênh bị trùng trong mẫu'], name: ['Tên mẫu 2-60 ký tự'] }))).toEqual([
      { field: 'name', message: 'Tên mẫu 2-60 ký tự' },
      { field: 'channels', message: 'Tên kênh bị trùng trong mẫu' },
    ]);
  });

  it('bỏ qua trường lạ (vd `reason`), details rỗng hoặc sai dạng', () => {
    expect(serverFieldErrors(axiosLike({ reason: ['Lý do tối thiểu 10 ký tự'] }))).toEqual([]);
    expect(serverFieldErrors(axiosLike(null))).toEqual([]);
    expect(serverFieldErrors(axiosLike('chuỗi'))).toEqual([]);
    expect(serverFieldErrors(new Error('mạng'))).toEqual([]);
  });
});

describe('dòng cờ phụ ở tab Tính năng', () => {
  const ITEM: SystemConfigItem = {
    key: 'features',
    tab: 'features',
    label: 'Tính năng',
    fields: [
      { path: 'communication', label: 'Nhắn tin & kênh', kind: 'bool', default: false },
      { path: 'push', label: 'Thông báo đẩy', kind: 'bool', default: true },
      { path: 'workspaceSearch', label: 'Tìm kiếm toàn nhóm', kind: 'bool', default: true },
      { path: 'readConfirm', label: 'Xác nhận đã đọc thông báo', kind: 'bool', default: true },
    ],
    stored: { readConfirm: false },
    effective: {},
    version: 2,
    updatedAt: null,
    updatedBy: null,
  };
  const caps = (communication: { enabled: boolean; available: boolean }): Capabilities =>
    ({
      features: {
        communication,
        push: { enabled: true, available: true },
        workspaceSearch: { enabled: communication.enabled, available: communication.available },
        readConfirm: { enabled: false, available: communication.available },
      },
    }) as unknown as Capabilities;

  it('cờ phụ mang phân hệ cha; tách nhóm khỏi phân hệ, giữ thứ tự', () => {
    const rows = buildFeatureRows(ITEM, caps({ enabled: true, available: true }));
    const { modules, subs } = splitFeatureRows(rows);
    expect(modules.map((r) => r.id)).toEqual(['communication', 'push']);
    expect(subs.map((r) => r.id)).toEqual(['workspaceSearch', 'readConfirm']);
    expect(subs[0]).toMatchObject({ parentId: 'communication', parentLabel: 'Nhắn tin & kênh', parentEnabled: true });
    expect(subs[1]).toMatchObject({ overridden: true, enabled: false });
    expect(modules[0].parentId).toBeUndefined();
  });

  it('khoá theo cha: chưa có mã → "chưa có mã"; cha đang tắt → "cần bật phân hệ"; còn lại theo quyền', () => {
    const noCode = splitFeatureRows(buildFeatureRows(ITEM, caps({ enabled: false, available: false }))).subs[0];
    expect(lockReason(noCode, true)).toBe('Phân hệ chưa có mã trên bản triển khai này.');

    const parentOff = splitFeatureRows(buildFeatureRows(ITEM, caps({ enabled: false, available: true }))).subs[0];
    expect(lockReason(parentOff, true)).toBe('Cần bật phân hệ "Nhắn tin & kênh" trước.');

    const ok = splitFeatureRows(buildFeatureRows(ITEM, caps({ enabled: true, available: true }))).subs[0];
    expect(lockReason(ok, true)).toBeNull();
    expect(lockReason(ok, false)).toBe('Bạn không có quyền sửa cấu hình.');
  });
});
