import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import { expenseAdjustmentsPath, expensePath, workspaceExpensesPath } from './wallet.api';
import { parseView } from './parse-view';
import type {
  AdjustExpensePayload,
  CreateExpensePayload,
  CursorPage,
  ExpenseDetailView,
  ExpenseFilter,
  ExpenseView,
  UpdateExpensePayload,
} from './wallet.types';
import {
  cursorMetaSchema,
  expenseDetailViewSchema,
  expenseListSchema,
} from '../schemas/wallet.schemas';

const IDEMPOTENCY_HEADER = 'Idempotency-Key';

/**
 * Khoản chi. Tiền là số NGUYÊN đồng. XOÁ trả HTTP 200 `data: null` (không phải
 * 204) — không đọc body của `delete`.
 *
 * ⚠️ Danh sách đọc `response.data.data` + `response.data.meta` chứ KHÔNG qua
 * `unwrapData`: BE dùng `ResponseUtils.cursor` (`data` là MẢNG, `meta` ở gốc),
 * `unwrapData` bóc `.data` và vứt `meta` — `hasMore` sau đó là `undefined` và
 * danh sách không bao giờ tải tiếp.
 */
export const expensesService = {
  async list(
    workspaceId: string,
    filter: ExpenseFilter,
    cursor?: string,
    limit = 20,
  ): Promise<CursorPage<ExpenseView>> {
    const response = await apiClient.get<{ data: unknown; meta: unknown }>(
      workspaceExpensesPath(workspaceId),
      { params: { ...filter, cursor, limit } },
    );
    return {
      items: parseView(expenseListSchema, response.data.data, 'danh sách khoản chi'),
      meta: parseView(cursorMetaSchema, response.data.meta, 'phân trang'),
    };
  },

  /** `idempotencyKey` bắt buộc — xem `useIdempotencyKey` (BE cache cả phản hồi 4xx 24 giờ). */
  async create(
    workspaceId: string,
    payload: CreateExpensePayload,
    idempotencyKey: string,
  ): Promise<ExpenseDetailView> {
    const response = await apiClient.post(workspaceExpensesPath(workspaceId), payload, {
      headers: { [IDEMPOTENCY_HEADER]: idempotencyKey },
      skipErrorToast: true,
    });
    return parseView(expenseDetailViewSchema, unwrapData(response), 'khoản chi');
  },

  async get(expenseId: string): Promise<ExpenseDetailView> {
    const response = await apiClient.get(expensePath(expenseId));
    return parseView(expenseDetailViewSchema, unwrapData(response), 'khoản chi');
  },

  async update(expenseId: string, payload: UpdateExpensePayload): Promise<ExpenseDetailView> {
    const response = await apiClient.patch(expensePath(expenseId), payload, {
      skipErrorToast: true,
    });
    return parseView(expenseDetailViewSchema, unwrapData(response), 'khoản chi');
  },

  async remove(expenseId: string): Promise<void> {
    await apiClient.delete(expensePath(expenseId), { skipErrorToast: true });
  },

  /** Trả khoản ĐIỀU CHỈNH mới (`kind = ADJUSTMENT`), không phải khoản gốc. */
  async adjust(expenseId: string, payload: AdjustExpensePayload): Promise<ExpenseDetailView> {
    const response = await apiClient.post(expenseAdjustmentsPath(expenseId), payload, {
      skipErrorToast: true,
    });
    return parseView(expenseDetailViewSchema, unwrapData(response), 'khoản điều chỉnh');
  },
};
