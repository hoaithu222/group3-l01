import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  CALLS_ACTIVE_PATH,
  CALLS_PATH,
  ME_ACTIVE_CALL_PATH,
  ME_CALLS_PATH,
  callActionPath,
  callPath,
} from './calls.api';
import type {
  CallDto,
  CallHistoryFilter,
  CallHistoryItem,
  CallHistoryPage,
  CallScopeType,
  CallToken,
  CreateCallPayload,
  CreateCallResult,
  CursorMeta,
  DeclineCallResult,
  JoinCallResult,
  MyActiveCall,
} from './calls.types';

/** Phần token BE trải PHẲNG cạnh `call` (`{ call, token, livekitUrl, expiresAt, serverNow }`) — chuẩn hoá về một đối tượng. */
interface TokenFields {
  expiresAt?: string;
  livekitUrl?: string;
  token?: string;
}

function tokenOf(body: TokenFields): CallToken | null {
  if (!body.token || !body.livekitUrl || !body.expiresAt) return null;
  return { expiresAt: body.expiresAt, livekitUrl: body.livekitUrl, token: body.token };
}

/**
 * `skipErrorToast` ở MỌI thao tác chuyển trạng thái: `CALL_004/006/007/011/012` là NỘI DUNG của hộp thoại/luồng
 * cuộc gọi (`CallErrorDialogs`, `ended` + lý do), không phải toast tự tắt sau 4 giây — người dùng đang nhìn màn gọi.
 */
const QUIET = { skipErrorToast: true } as const;

export const callsService = {
  async create(payload: CreateCallPayload): Promise<CreateCallResult> {
    const response = await apiClient.post(CALLS_PATH, payload, QUIET);
    const body = unwrapData<{ call: CallDto; joined: boolean; serverNow: string } & TokenFields>(
      response,
    );
    return {
      call: body.call,
      joined: body.joined,
      serverNow: body.serverNow,
      token: tokenOf(body),
    };
  },

  async get(callId: string): Promise<CallDto> {
    return unwrapData<CallDto>(await apiClient.get(callPath(callId), QUIET));
  },

  /** `GET /calls/active` — `call: null` khi phạm vi không có cuộc gọi đang diễn ra (banner "Tham gia"). */
  async getActive(scopeType: CallScopeType, scopeId: string): Promise<CallDto | null> {
    const response = await apiClient.get(CALLS_ACTIVE_PATH, {
      ...QUIET,
      params: { scopeId, scopeType },
    });
    return unwrapData<{ call: CallDto | null }>(response).call;
  },

  async getMyActive(): Promise<MyActiveCall> {
    return unwrapData<MyActiveCall>(await apiClient.get(ME_ACTIVE_CALL_PATH, QUIET));
  },

  async answer(callId: string, deviceId: string): Promise<JoinCallResult> {
    const response = await apiClient.post(callActionPath(callId, 'answer'), { deviceId }, QUIET);
    const body = unwrapData<{ call: CallDto; serverNow: string } & TokenFields>(response);
    return { call: body.call, serverNow: body.serverNow, token: tokenOf(body) };
  },

  /** `force` (phòng thoại kênh, p2-03): đá máy cũ/rời cuộc gọi khác để vào phòng này — chỉ sau khi người dùng xác nhận. */
  async join(callId: string, deviceId: string, force?: boolean): Promise<JoinCallResult> {
    const response = await apiClient.post(callActionPath(callId, 'join'), { deviceId, ...(force ? { force } : {}) }, QUIET);
    const body = unwrapData<{ call: CallDto; serverNow: string } & TokenFields>(response);
    return { call: body.call, serverNow: body.serverNow, token: tokenOf(body) };
  },

  async decline(callId: string, deviceId: string): Promise<DeclineCallResult> {
    const response = await apiClient.post(callActionPath(callId, 'decline'), { deviceId }, QUIET);
    return unwrapData<DeclineCallResult>(response);
  },

  async cancel(callId: string): Promise<CallDto> {
    const response = await apiClient.post(callActionPath(callId, 'cancel'), undefined, QUIET);
    return unwrapData<{ call: CallDto }>(response).call;
  },

  async leave(callId: string): Promise<CallDto> {
    const response = await apiClient.post(callActionPath(callId, 'leave'), undefined, QUIET);
    return unwrapData<{ call: CallDto }>(response).call;
  },

  /** `forEveryone`: nhóm — người gọi hoặc OWNER/ADMIN; 1-1 luôn kết thúc cho cả hai. */
  async end(callId: string, forEveryone: boolean): Promise<CallDto> {
    const response = await apiClient.post(callActionPath(callId, 'end'), { forEveryone }, QUIET);
    return unwrapData<{ call: CallDto }>(response).call;
  },

  /** Gia hạn/cấp lại token khi token sắp hết hạn hoặc SDK báo `Disconnected` vì token. */
  async renewToken(callId: string): Promise<CallToken> {
    const response = await apiClient.post(callActionPath(callId, 'token'), undefined, QUIET);
    return unwrapData<CallToken>(response);
  },

  /** Đọc THẲNG `response.data` để giữ `meta` cursor (như `studyService.list`). */
  async history(
    filter: CallHistoryFilter,
    cursor: string | undefined,
    limit = 20,
  ): Promise<CallHistoryPage> {
    const response = await apiClient.get<{ data: CallHistoryItem[]; meta: CursorMeta }>(
      ME_CALLS_PATH,
      { ...QUIET, params: { cursor, filter, limit } },
    );
    return { items: response.data.data, meta: response.data.meta };
  },
};
