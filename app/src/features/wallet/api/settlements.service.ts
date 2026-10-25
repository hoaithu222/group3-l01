import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import { settlementActionPath, walletPayeePath, workspaceSettlementsPath } from './wallet.api';
import { parseView } from './parse-view';
import type {
  CreateSettlementPayload,
  CursorPage,
  PaymentInfoView,
  SettlementFilter,
  SettlementView,
} from './wallet.types';
import { cursorMetaSchema } from '../schemas/wallet.schemas';
import {
  paymentInfoViewSchema,
  settlementListSchema,
  settlementViewSchema,
} from '../schemas/wallet-payments.schemas';

const what = 'thanh toán';

/**
 * Trả nợ (settlement). Xác nhận/từ chối/huỷ đều trả `SettlementView` mới;
 * `WALLET_007` (409) = không còn PENDING (đã có người xử lý trước).
 */
export const settlementsService = {
  async list(
    workspaceId: string,
    filter: SettlementFilter,
    cursor?: string,
    limit = 20,
  ): Promise<CursorPage<SettlementView>> {
    const response = await apiClient.get<{ data: unknown; meta: unknown }>(
      workspaceSettlementsPath(workspaceId),
      // BE nhận `mine` là chuỗi 'true'|'false' — axios serialize boolean thành đúng chuỗi đó.
      { params: { ...filter, cursor, limit } },
    );
    return {
      items: parseView(settlementListSchema, response.data.data, 'danh sách thanh toán'),
      meta: parseView(cursorMetaSchema, response.data.meta, 'phân trang'),
    };
  },

  async create(
    workspaceId: string,
    payload: CreateSettlementPayload,
    idempotencyKey: string,
  ): Promise<SettlementView> {
    const response = await apiClient.post(workspaceSettlementsPath(workspaceId), payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
      skipErrorToast: true,
    });
    return parseView(settlementViewSchema, unwrapData(response), what);
  },

  async confirm(settlementId: string): Promise<SettlementView> {
    const response = await apiClient.post(settlementActionPath(settlementId, 'confirm'));
    return parseView(settlementViewSchema, unwrapData(response), what);
  },

  async reject(settlementId: string, reason: string): Promise<SettlementView> {
    const response = await apiClient.post(settlementActionPath(settlementId, 'reject'), { reason });
    return parseView(settlementViewSchema, unwrapData(response), what);
  },

  async cancel(settlementId: string): Promise<SettlementView> {
    const response = await apiClient.post(settlementActionPath(settlementId, 'cancel'));
    return parseView(settlementViewSchema, unwrapData(response), what);
  },

  /**
   * 404 = người nhận chưa có tài khoản HOẶC bạn không đang nợ họ (BE cố ý gộp hai
   * ca để không lộ ai có tài khoản). `skipErrorToast`: đây là trạng thái bình
   * thường của màn Trả nợ, không phải sự cố cần toast.
   */
  async paymentInfo(workspaceId: string, userId: string): Promise<PaymentInfoView> {
    const response = await apiClient.get(walletPayeePath(workspaceId, userId), {
      skipErrorToast: true,
    });
    return parseView(paymentInfoViewSchema, unwrapData(response), 'tài khoản nhận tiền');
  },
};
