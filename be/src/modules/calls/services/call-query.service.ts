import type { AuthUser } from "../../../core/types/express";
import { ErrorCode } from "../../../core/utils/error.codes";
import { decodeCursor, encodeCursor } from "../../../core/utils/cursor";
import type { ActiveCallQueryDto, ListCallsQueryDto } from "../dtos";
import type { CallDto, CallEntity, CallHistoryItem, CallParticipantEntity, CallTokenResponse } from "../entities/call.interface";
import type { CallDeps } from "./call.deps";
import { callError } from "./call-scope.resolver";
import { isConnectedLike, isRingingLike } from "./call-state.machine";

export interface HistoryPage {
  items: CallHistoryItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** Đọc: chi tiết + `myActions`, banner "Tham gia", cuộc gọi hiện tại của tôi, lịch sử, gia hạn token (be.md §4). */
export class CallQueryService {
  constructor(private readonly d: CallDeps) {}

  /** Dựng DTO cho `viewer` — `myActions` do server tính từ quyền hiện tại. */
  async buildDto(viewer: AuthUser, call: CallEntity, participants?: CallParticipantEntity[]): Promise<CallDto> {
    const list = participants ?? (await this.d.repo.findParticipants(call.id));
    const [isScopeMember, isScopeAdmin, limits] = await Promise.all([
      this.d.scopes.canStayInScope(viewer, call),
      this.d.scopes.isScopeAdmin(viewer.id, call),
      this.d.limits(),
    ]);
    return this.d.mapper.toDto(call, list, viewer.id, { isScopeMember, isScopeAdmin, maxParticipants: limits.maxParticipants }, this.d.now());
  }

  /** `GET /calls/:id` — participant bất kỳ trạng thái, hoặc thành viên phạm vi (xem tóm tắt); còn lại 404 (`CALL_005`). */
  async getDetail(viewer: AuthUser, callId: string): Promise<CallDto> {
    const call = await this.d.repo.findById(callId);
    if (!call) throw callError(ErrorCode.CALL_005, 404);
    const participants = await this.d.repo.findParticipants(callId);
    const isParticipant = participants.some((p) => p.userId === viewer.id);
    if (!isParticipant && !(await this.d.scopes.canStayInScope(viewer, call))) throw callError(ErrorCode.CALL_005, 404);
    return this.buildDto(viewer, call, participants);
  }

  /** `GET /calls/active` — cuộc gọi đang diễn ra trong phạm vi (banner "Đang có cuộc gọi — Tham gia"). */
  async getActive(viewer: AuthUser, q: ActiveCallQueryDto): Promise<{ call: CallDto | null }> {
    if (!(await this.d.scopes.canStayInScope(viewer, q))) throw callError(ErrorCode.CALL_001, 404);
    const [open] = await this.d.repo.findOpenByScope(q.scopeType, [q.scopeId]);
    return { call: open ? await this.buildDto(viewer, open) : null };
  }

  /** `GET /me/active-call` — nguồn sự thật khi app mở lại: ưu tiên cuộc đang kết nối, rồi cuộc đang đổ chuông. */
  async myActive(viewer: AuthUser): Promise<{ call: CallDto | null; myParticipant: { state: string; role: string } | null }> {
    const open = await this.d.repo.findOpenParticipations(viewer.id);
    const pick = open.find((o) => isConnectedLike(o.participant.state)) ?? open.find((o) => isRingingLike(o.participant.state));
    if (!pick) return { call: null, myParticipant: null };
    return { call: await this.buildDto(viewer, pick.call), myParticipant: { state: pick.participant.state, role: pick.participant.role } };
  }

  /** `POST /calls/:id/token` — gia hạn/cấp lại token cho participant đang trong cuộc gọi. */
  async renewToken(viewer: AuthUser, callId: string): Promise<CallTokenResponse> {
    const call = await this.d.repo.findById(callId);
    const me = call ? await this.d.repo.findParticipant(callId, viewer.id) : null;
    if (!call) throw callError(ErrorCode.CALL_005, 410);
    if (!me) throw callError(ErrorCode.CALL_014, 403);
    return this.d.tokens.issueFor(viewer, call, me);
  }

  /** `GET /me/calls` — cursor `(callStartedAt, id)`; `missed` = MISSED + BUSY. */
  async history(viewer: AuthUser, q: ListCallsQueryDto): Promise<HistoryPage> {
    const cursor = q.cursor ? decodeCursor(q.cursor) : null;
    const rows = await this.d.repo.listHistory(viewer.id, {
      filter: q.filter,
      scopeType: q.scopeType,
      scopeId: q.scopeId,
      cursor: cursor ?? undefined,
      limit: q.limit,
    });
    const hasMore = rows.length > q.limit;
    const page = rows.slice(0, q.limit);
    const callIds = page.map((r) => r.callId);
    const [calls, everyone] = await Promise.all([this.d.repo.findByIds(callIds), this.d.repo.findParticipantsOf(callIds)]);
    const previews = new Map<string, string[]>();
    for (const p of everyone) previews.set(p.callId, [...(previews.get(p.callId) ?? []), p.userId]);
    const items = await this.d.mapper.toHistoryItems(page, viewer.id, new Map(calls.map((c) => [c.id, c])), previews);
    const last = page[page.length - 1];
    return { items, hasMore, nextCursor: hasMore && last ? encodeCursor(last.callStartedAt, last.id) : null };
  }
}
