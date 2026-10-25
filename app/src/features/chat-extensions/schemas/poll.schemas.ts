import { z } from 'zod';

import { graphemeLength } from '@/features/chat';
import { normalizeSearch } from '@/shared/utils/format/string.utils';

import type { CreatePollInput } from '../api/chat-extensions.types';
import type { ChatExtLimits } from '../utils/chat-ext-limits';
import { checkWhen, combineDateAndTime, daysToMs } from '../utils/local-time';

/**
 * Form "Tạo khảo sát" (p7-04 app.md §3 `CreatePollSheet`). Schema dựng THEO `limits.poll` của capabilities (không hard-code 10 lựa chọn/300 ký tự/30 ngày) và giờ máy chủ
 * lúc kiểm (`getNowMs`) — hạn chốt phải ở tương lai ≥ `closeMinLeadSeconds` và ≤ `closesInMaxDays`.
 *
 * Mọi lỗi gắn vào ĐÚNG ô (`options.<i>.text`, `deadlineDate`, `deadlineTime`) — không lỗi ở tầng form/mảng (bàn phím che mất, người dùng tưởng nút hỏng). Số dòng lựa chọn LUÔN nằm trong
 * `[optionsMin, optionsMax]` do giao diện giữ (không cho xoá quá mức/thêm quá trần), nên luật "đủ số lựa chọn" không cần lỗi riêng: mỗi dòng đang có phải điền, hoặc bị xoá.
 * Trùng lựa chọn so sau khi BỎ DẤU + chữ thường (cùng `normalizeSearch` của BE) — "Có" và "co" là MỘT lựa chọn ở server, báo trùng ngay ở client thay vì `POLL_001`.
 */
export type PollFormLimits = Pick<
  ChatExtLimits['poll'],
  'optionsMin' | 'optionsMax' | 'questionMax' | 'optionMax' | 'closesInMaxDays' | 'closeMinLeadSeconds'
>;

export function createPollFormSchema(limits: PollFormLimits, getNowMs: () => number) {
  return z
    .object({
      question: z
        .string()
        .trim()
        .min(1, 'Hãy nhập câu hỏi')
        .refine((value) => graphemeLength(value) <= limits.questionMax, {
          message: `Câu hỏi tối đa ${limits.questionMax} ký tự`,
        }),
      options: z
        .array(
          z.object({
            text: z
              .string()
              .trim()
              .min(1, 'Hãy nhập lựa chọn')
              .refine((value) => graphemeLength(value) <= limits.optionMax, {
                message: `Lựa chọn tối đa ${limits.optionMax} ký tự`,
              }),
          }),
        )
        .min(limits.optionsMin)
        .max(limits.optionsMax),
      multi: z.boolean(),
      anonymous: z.boolean(),
      deadlineOn: z.boolean(),
      deadlineDate: z.date().nullable(),
      deadlineTime: z.string(),
    })
    .superRefine((value, ctx) => {
      const seen = new Set<string>();
      value.options.forEach((option, index) => {
        const key = normalizeSearch(option.text);
        if (key === '') return;
        if (seen.has(key)) {
          ctx.addIssue({ code: 'custom', message: 'Lựa chọn này bị trùng', path: ['options', index, 'text'] });
        }
        seen.add(key);
      });

      if (!value.deadlineOn) return;
      if (!value.deadlineDate) {
        ctx.addIssue({ code: 'custom', message: 'Chọn ngày kết thúc', path: ['deadlineDate'] });
        return;
      }
      const at = combineDateAndTime(value.deadlineDate, value.deadlineTime);
      if (!at) {
        ctx.addIssue({ code: 'custom', message: 'Chọn giờ kết thúc', path: ['deadlineTime'] });
        return;
      }
      const message = checkWhen(
        at,
        getNowMs(),
        { minLeadMs: limits.closeMinLeadSeconds * 1000, maxMs: daysToMs(limits.closesInMaxDays) },
        'Hạn kết thúc',
      );
      if (message) ctx.addIssue({ code: 'custom', message, path: ['deadlineTime'] });
    });
}

export type PollFormValues = z.infer<ReturnType<typeof createPollFormSchema>>;

/** Giá trị đã kiểm → thân request. `closesAt` là ISO UTC của mốc theo GIỜ MÁY người dùng chọn. */
export function toCreatePollInput(values: PollFormValues, clientMessageId: string): CreatePollInput {
  const closesAt =
    values.deadlineOn && values.deadlineDate
      ? combineDateAndTime(values.deadlineDate, values.deadlineTime)?.toISOString()
      : undefined;
  return {
    clientMessageId,
    question: values.question,
    options: values.options.map((option) => option.text),
    multi: values.multi,
    anonymous: values.anonymous,
    ...(closesAt ? { closesAt } : {}),
  };
}

export const EMPTY_POLL_FORM: PollFormValues = {
  question: '',
  options: [{ text: '' }, { text: '' }],
  multi: false,
  anonymous: false,
  deadlineOn: false,
  deadlineDate: null,
  deadlineTime: '',
};
