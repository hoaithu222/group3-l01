/**
 * Logic THUẦN của phân hệ `economy` (p7-02): phân loại lỗi BE (đổi khoá idempotency, CAS, lỗi gắn ô), schema điều chỉnh/vật phẩm/nhiệm vụ khớp DTO BE, dựng payload chỉ với
 * trường ĐÃ ĐỔI, dòng bảng luật, định dạng số xu, phân trang client, khoảng ngày tổng quan. Không render, không MSW.
 */
import { AxiosError, type AxiosResponse } from 'axios';
import { describe, expect, it } from 'vitest';

import { COIN_SOURCE_TYPES } from '@/features/economy/constants/economy.constants';
import { buildAdjustSchema } from '@/features/economy/schemas/adjust.schema';
import { questFormSchema } from '@/features/economy/schemas/quest.schema';
import { shopItemFormSchema } from '@/features/economy/schemas/shop-item.schema';
import {
  buildRuleRows,
  describeRuleDraft,
  pickRuleDraft,
  ruleDraftError,
  sameRuleDraft,
} from '@/features/economy/utils/coin-rule-draft';
import {
  adjustAmountError,
  isVersionConflict,
  serverFieldMessages,
  shouldRotateIdempotencyKey,
} from '@/features/economy/utils/economy-errors';
import {
  describeItemData,
  formatSaleWindow,
  formatSignedCoins,
  txTypeLabel,
} from '@/features/economy/utils/economy-format.utils';
import { hasEconomyFlow, parseOverviewDays } from '@/features/economy/utils/overview.utils';
import { paginate } from '@/features/economy/utils/paginate.utils';
import {
  questToValues,
  toCreateQuestPayload,
  toUpdateQuestPayload,
} from '@/features/economy/utils/quest-form.utils';
import { parseEmojis } from '@/features/economy/utils/shop-item-data.utils';
import {
  hasItemChanges,
  itemToValues,
  toCreateItemPayload,
  toUpdateItemPayload,
} from '@/features/economy/utils/shop-item-form.utils';
import { AUDIT_ACTION_LABELS, auditTargetTypeLabel } from '@/shared/constants/audit-actions';
import { ERROR_CODE_MESSAGES } from '@/shared/constants/error-codes';

import { makeItem, makeOverview, makeQuest, makeRule } from './economy-fixtures';

/** Lỗi axios giống hệt thứ interceptor ném ra: `error.response.status` + thân `{ error: { code, details } }`. */
function axiosError(status: number | null, code = '', details?: unknown): AxiosError {
  const response =
    status === null
      ? undefined
      : ({ status, data: { success: false, error: { code, message: 'x', details } } } as AxiosResponse);
  return new AxiosError('x', undefined, undefined, undefined, response);
}

describe('phân loại lỗi BE', () => {
  it('đổi Idempotency-Key CHỈ sau kết luận 4xx (trừ 429 và RES_004); lỗi mạng/5xx giữ khoá', () => {
    expect(shouldRotateIdempotencyKey(axiosError(null))).toBe(false); // mất mạng
    expect(shouldRotateIdempotencyKey(axiosError(500, 'SYS_001'))).toBe(false);
    expect(shouldRotateIdempotencyKey(axiosError(429, 'RATE_001'))).toBe(false);
    expect(shouldRotateIdempotencyKey(axiosError(409, 'RES_004'))).toBe(false); // lần trước còn chạy
    expect(shouldRotateIdempotencyKey(axiosError(400, 'COIN_001'))).toBe(true);
    expect(shouldRotateIdempotencyKey(axiosError(400, 'VAL_001'))).toBe(true);
    expect(shouldRotateIdempotencyKey(axiosError(404, 'RES_001'))).toBe(true);
    expect(shouldRotateIdempotencyKey(new Error('không phải axios'))).toBe(false);
  });

  it('RES_003 là xung đột phiên bản; mã khác/lỗi lạ thì không', () => {
    expect(isVersionConflict(axiosError(409, 'RES_003'))).toBe(true);
    expect(isVersionConflict(axiosError(409, 'RES_002'))).toBe(false);
    expect(isVersionConflict(new Error('x'))).toBe(false);
  });

  it('lỗi gắn ô số xu: COIN_001 (kèm số dư), COIN_009 (kèm mức tối đa), VAL_001 có details.amount; mã khác → null', () => {
    expect(adjustAmountError(axiosError(400, 'COIN_001', { balance: 120, required: 400 }))).toBe(
      'Số dư hiện tại chỉ còn 120 xu — không thể trừ nhiều hơn',
    );
    expect(adjustAmountError(axiosError(400, 'COIN_001'))).toBe('Không đủ xu để trừ');
    expect(adjustAmountError(axiosError(400, 'COIN_009', { max: 1_000_000_000 }))).toBe(
      'Số dư sau điều chỉnh vượt mức tối đa 1.000.000.000 xu',
    );
    expect(adjustAmountError(axiosError(400, 'VAL_001', { amount: ['Mức điều chỉnh không hợp lệ'] }))).toBe(
      'Mức điều chỉnh không hợp lệ',
    );
    expect(adjustAmountError(axiosError(500, 'SYS_001'))).toBeNull();
    expect(adjustAmountError(new Error('x'))).toBeNull();
  });

  it('serverFieldMessages lấy thông điệp ĐẦU của mỗi trường, bỏ giá trị không phải chuỗi', () => {
    const err = axiosError(400, 'VAL_001', { reason: ['Lý do tối thiểu 10 ký tự', 'khác'], amount: [], balance: 5 });
    expect(serverFieldMessages(err)).toEqual({ reason: 'Lý do tối thiểu 10 ký tự' });
    expect(serverFieldMessages(axiosError(400, 'VAL_001', ['mảng'] as unknown))).toEqual({});
  });
});

describe('schema điều chỉnh xu', () => {
  const ok = { amount: 100, reason: 'Bù xu do lỗi hệ thống', confirmLarge: false };
  const issues = (schema: ReturnType<typeof buildAdjustSchema>, v: unknown) => {
    const r = schema.safeParse(v);
    return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  };

  it('nguyên ≠ 0, ≤ ±100.000; lý do 10–500', () => {
    const schema = buildAdjustSchema(1000);
    expect(issues(schema, ok)).toEqual([]);
    expect(issues(schema, { ...ok, amount: 0 })).toContain('amount: Số xu điều chỉnh phải khác 0');
    expect(issues(schema, { ...ok, amount: 1.5 })).toContain('amount: Số xu phải là số nguyên');
    expect(issues(schema, { ...ok, amount: 100_001, confirmLarge: true })).toContain('amount: Tối đa ±100.000 xu mỗi lần');
    expect(issues(schema, { ...ok, reason: 'ngắn' })).toContain('reason: Lý do tối thiểu 10 ký tự');
    expect(issues(schema, { ...ok, reason: '   ' })).toContain('reason: Lý do là bắt buộc');
    expect(issues(schema, { ...ok, amount: undefined })).toContain('amount: Nhập số xu');
  });

  it('không cho trừ quá số dư hiện tại; trừ đúng bằng số dư thì được', () => {
    const schema = buildAdjustSchema(500);
    expect(issues(schema, { ...ok, amount: -501 })).toContain('amount: Không thể trừ quá số dư hiện tại (500 xu)');
    expect(issues(schema, { ...ok, amount: -500 })).toEqual([]);
  });

  it('từ 10.000 xu (cả cộng lẫn trừ) phải tích xác nhận', () => {
    const schema = buildAdjustSchema(50_000);
    expect(issues(schema, { ...ok, amount: 9_999 })).toEqual([]);
    expect(issues(schema, { ...ok, amount: 10_000 })).toContain('confirmLarge: Hãy tích xác nhận đây là điều chỉnh lớn');
    expect(issues(schema, { ...ok, amount: -10_000 })).toContain('confirmLarge: Hãy tích xác nhận đây là điều chỉnh lớn');
    expect(issues(schema, { ...ok, amount: 10_000, confirmLarge: true })).toEqual([]);
  });
});

describe('quy tắc thưởng (bản nháp)', () => {
  it('mọi nguồn XP đều có dòng theo thứ tự cố định; luật đã có gắn vào đúng nguồn', () => {
    const rows = buildRuleRows([makeRule({ sourceType: 'QUIZ_PASSED', coins: 7 })]);
    expect(rows.map((r) => r.sourceType)).toEqual(COIN_SOURCE_TYPES);
    expect(rows.filter((r) => r.rule !== null)).toHaveLength(1);
    expect(rows.find((r) => r.sourceType === 'QUIZ_PASSED')?.rule?.coins).toBe(7);
  });

  it('khớp putRuleSchema BE: xu 1–1.000, trần 1–200 hoặc null', () => {
    expect(ruleDraftError({ coins: 10, dailyCap: null, isActive: true })).toBeNull();
    expect(ruleDraftError({ coins: 1000, dailyCap: 200, isActive: true })).toBeNull();
    expect(ruleDraftError({ coins: 0, dailyCap: null, isActive: true })).toBe('Xu mỗi lần phải từ 1 đến 1.000');
    expect(ruleDraftError({ coins: 1001, dailyCap: null, isActive: true })).toBe('Xu mỗi lần phải từ 1 đến 1.000');
    expect(ruleDraftError({ coins: 5, dailyCap: 0, isActive: true })).toBe('Trần ngày phải từ 1 đến 200 (hoặc để trống)');
    expect(ruleDraftError({ coins: 5, dailyCap: 201, isActive: true })).toBe('Trần ngày phải từ 1 đến 200 (hoặc để trống)');
    expect(ruleDraftError({ coins: 5.5, dailyCap: null, isActive: true })).not.toBeNull();
  });

  it('nguồn chưa có luật: nháp gốc 0 xu/tắt; so sánh và mô tả', () => {
    const empty = pickRuleDraft({ sourceType: 'QUIZ_PASSED', rule: null });
    expect(empty).toEqual({ coins: 0, dailyCap: null, isActive: false });
    const saved = pickRuleDraft({ sourceType: 'TASK_COMPLETED', rule: makeRule() });
    expect(sameRuleDraft(saved, { ...saved })).toBe(true);
    expect(sameRuleDraft(saved, { ...saved, coins: 11 })).toBe(false);
    expect(describeRuleDraft(saved)).toBe('10 xu · trần 50/ngày · bật');
    expect(describeRuleDraft({ coins: 3, dailyCap: null, isActive: false })).toBe('3 xu · theo trần chung · tắt');
  });
});

describe('vật phẩm — schema và payload', () => {
  const values = itemToValues(makeItem());
  const parse = (v: unknown) => shopItemFormSchema.safeParse(v);
  const messages = (v: unknown) => {
    const r = parse(v);
    return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  };
  const withReason = { ...values, reason: 'Thêm vật phẩm mùa thu' };

  it('mã a-z0-9-, giá 1–10.000, `data` kiểm THEO LOẠI (loại khác không bị kiểm)', () => {
    expect(messages(withReason)).toEqual([]);
    expect(messages({ ...withReason, code: 'Khung Vang' })).toContain('code: Mã chỉ gồm chữ thường, số và dấu gạch ngang');
    expect(messages({ ...withReason, price: 10_001 })).toContain('price: Giá tối đa 10.000 xu');
    expect(messages({ ...withReason, color: 'đỏ' })).toContain('color: Màu phải dạng #RRGGBB');
    expect(messages({ ...withReason, width: 9 })).toContain('width: Độ dày viền là số nguyên từ 1 đến 8');
    // Khung avatar hợp lệ thì màu chủ đề sai không cản.
    expect(messages({ ...withReason, primary: 'sai' })).toEqual([]);
    expect(messages({ ...withReason, kind: 'PROFILE_THEME', primary: 'sai' })).toContain('primary: Màu phải dạng #RRGGBB');
    expect(messages({ ...withReason, kind: 'EMOJI_PACK', emojis: '' })).toContain('emojis: Nhập ít nhất một emoji');
    expect(messages({ ...withReason, kind: 'EMOJI_PACK', emojis: Array.from({ length: 31 }, () => 'a').join(' ') })).toContain('emojis: Tối đa 30 emoji');
  });

  it('khung bán: ngày kết thúc không được trước ngày bắt đầu (cùng ngày thì được)', () => {
    expect(messages({ ...withReason, availableRange: { from: '2026-09-30', to: '2026-09-01' } })).toContain('availableRange: Ngày kết thúc phải sau hoặc cùng ngày bắt đầu');
    expect(messages({ ...withReason, availableRange: { from: '2026-09-10', to: '2026-09-10' } })).toEqual([]);
  });

  it('tạo: `data` đúng loại + khung bán ISO (từ đầu ngày tới hết ngày)', () => {
    const payload = toCreateItemPayload({ ...withReason, availableRange: { from: '2026-09-10', to: '2026-09-10' } });
    expect(payload).toMatchObject({ kind: 'AVATAR_FRAME', data: { color: '#FFB700', width: 3 }, price: 300, reason: 'Thêm vật phẩm mùa thu' });
    expect(new Date(payload.availableFrom!).getTime()).toBeLessThan(new Date(payload.availableTo!).getTime());
    expect(toCreateItemPayload({ ...withReason, kind: 'EMOJI_PACK', emojis: '😀, 🎉' }).data).toEqual({ emojis: ['😀', '🎉'] });
    expect(toCreateItemPayload({ ...withReason, kind: 'PROFILE_THEME' }).data).toEqual({ primary: withReason.primary, accent: withReason.accent });
  });

  it('sửa: chỉ gửi trường ĐÃ ĐỔI kèm expectedVersion + reason; chưa đổi gì → hasItemChanges=false', () => {
    const item = makeItem();
    expect(hasItemChanges(item, values)).toBe(false);
    expect(toUpdateItemPayload(item, withReason)).toEqual({ id: 'i1', expectedVersion: 4, reason: 'Thêm vật phẩm mùa thu' });

    expect(hasItemChanges(item, { ...values, price: 350 })).toBe(true);
    expect(toUpdateItemPayload(item, { ...withReason, price: 350, isActive: false })).toEqual({
      id: 'i1',
      expectedVersion: 4,
      reason: 'Thêm vật phẩm mùa thu',
      price: 350,
      isActive: false,
    });
    expect(toUpdateItemPayload(item, { ...withReason, color: '#000000' })).toMatchObject({ data: { color: '#000000', width: 3 } });
    const withWindow = toUpdateItemPayload(item, { ...withReason, availableRange: { from: '2026-09-01', to: null } });
    expect(withWindow.availableFrom).toEqual(expect.any(String));
    expect(withWindow.availableTo).toBeNull();
  });

  it('mô tả xem trước bằng chữ, khung bán, số có dấu, nhãn loại giao dịch', () => {
    expect(describeItemData('AVATAR_FRAME', { color: '#FFB700', width: 3 })).toBe('Viền #FFB700 · 3px');
    expect(describeItemData('PROFILE_THEME', { primary: '#111111', accent: '#222222' })).toBe('Chủ đạo #111111 · nhấn #222222');
    expect(describeItemData('EMOJI_PACK', { emojis: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] })).toBe('a b c d e f … (7 emoji)');
    expect(describeItemData('EMOJI_PACK', null)).toBe('—');
    expect(formatSaleWindow(null, null)).toBe('Không giới hạn');
    expect(formatSaleWindow('2026-09-01T00:00:00.000Z', null)).toMatch(/^Từ /);
    expect(formatSaleWindow(null, '2026-09-30T12:00:00.000Z')).toMatch(/^Đến /);
    expect(formatSignedCoins(120)).toBe('+120');
    expect(formatSignedCoins(-1500)).toBe('−1.500');
    expect(formatSignedCoins(0)).toBe('0');
    expect(txTypeLabel({ type: 'ADJUST_ADMIN' })).toBe('Admin điều chỉnh');
    expect(txTypeLabel({ type: 'LOAI_MOI' as never })).toBe('LOAI_MOI'); // loại BE thêm về sau vẫn hiện mã, không trống
    expect(parseEmojis(' 😀,🎉  ✨\n🍂 ')).toEqual(['😀', '🎉', '✨', '🍂']);
  });
});

describe('nhiệm vụ — schema và payload', () => {
  const values = { ...questToValues(makeQuest()), reason: 'Thêm nhiệm vụ mới cho tuần thi' };

  it('khớp createQuestSchema BE: mã, tiêu đề 2–80, mục tiêu 1–100, xu 1–1.000, thứ tự 0–1.000, metric cố định', () => {
    expect(questFormSchema.safeParse(values).success).toBe(true);
    const bad = (over: object) => questFormSchema.safeParse({ ...values, ...over }).success;
    expect(bad({ code: 'Sai Ma' })).toBe(false);
    expect(bad({ title: 'A' })).toBe(false);
    expect(bad({ target: 0 })).toBe(false);
    expect(bad({ target: 101 })).toBe(false);
    expect(bad({ coins: 1001 })).toBe(false);
    expect(bad({ order: -1 })).toBe(false);
    expect(bad({ metric: 'onlineMinutes' })).toBe(false); // không có chỉ số giờ online
    expect(bad({ reason: 'ngắn' })).toBe(false);
  });

  it('sửa chỉ gửi trường đã đổi; tạo gửi đủ', () => {
    const quest = makeQuest();
    expect(toUpdateQuestPayload(quest, values)).toEqual({ id: 'q1', expectedVersion: 5, reason: values.reason });
    expect(toUpdateQuestPayload(quest, { ...values, coins: 30, isActive: false })).toEqual({
      id: 'q1',
      expectedVersion: 5,
      reason: values.reason,
      coins: 30,
      isActive: false,
    });
    expect(toCreateQuestPayload(values)).toMatchObject({ code: 'hoan-thanh-3-task', metric: 'tasksDone', target: 3, coins: 20, order: 1, isActive: true });
  });
});

describe('tổng quan và phân trang', () => {
  it('parseOverviewDays chỉ nhận các khoảng đã khai, còn lại rơi về 7', () => {
    expect(parseOverviewDays('14')).toBe(14);
    expect(parseOverviewDays('30')).toBe(30);
    expect(parseOverviewDays('')).toBe(7);
    expect(parseOverviewDays('999')).toBe(7);
    expect(parseOverviewDays('abc')).toBe(7);
  });

  it('hasEconomyFlow: toàn 0 = rỗng; một ngày có phát sinh (kể cả điều chỉnh âm) = có dữ liệu', () => {
    const zero = makeOverview({ perDay: [{ date: '2026-09-01', issued: 0, spent: 0, burned: 0, adjusted: 0 }] }).perDay;
    expect(hasEconomyFlow(zero)).toBe(false);
    expect(hasEconomyFlow([{ ...zero[0]!, adjusted: -5 }])).toBe(true);
    expect(hasEconomyFlow([])).toBe(false);
  });

  it('paginate: cắt theo trang, kẹp trang ngoài khoảng, danh sách rỗng vẫn là trang 1', () => {
    const items = Array.from({ length: 25 }, (_, i) => i + 1);
    expect(paginate(items, 1, 10).rows).toHaveLength(10);
    expect(paginate(items, 3, 10)).toEqual({ page: 3, rows: [21, 22, 23, 24, 25] });
    expect(paginate(items, 99, 10).page).toBe(3);
    expect(paginate(items, 0, 10).page).toBe(1);
    expect(paginate([], 5, 10)).toEqual({ page: 1, rows: [] });
  });
});

describe('nhãn dùng chung (điều phối viên đã thêm)', () => {
  it('mã lỗi COIN_* và nhãn audit coins.* có tiếng Việt; targetType CoinRule/CoinQuest có nhãn', () => {
    for (const code of ['COIN_001', 'COIN_002', 'COIN_003', 'COIN_004', 'COIN_005', 'COIN_009']) {
      expect(ERROR_CODE_MESSAGES[code], code).toBeTruthy();
    }
    for (const action of ['coins.adjust', 'coins.rule.update', 'coins.shop-item.create', 'coins.shop-item.update', 'coins.quest.create', 'coins.quest.update']) {
      expect(AUDIT_ACTION_LABELS[action], action).toBeTruthy();
    }
    for (const target of ['CoinWallet', 'ShopItem', 'CoinRule', 'CoinQuest']) {
      expect(auditTargetTypeLabel(target), target).not.toBe(target);
    }
  });
});
