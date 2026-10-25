/**
 * Cổng "ai đang trong phòng thoại của kênh VOICE" (p2-03 README §1/§5) — đặt ở `shared/ports/` (giống `WorkspaceOverviewContributor`)
 * để `modules/channels` (danh sách kênh) đọc số người trong phòng mà KHÔNG import `modules/calls` (luật 3 tầng,
 * `.claude/rules/architecture.md`). `modules/calls` đăng ký bản đọc lúc boot (`registerCallsModule()`); chưa đăng ký (worker thuần,
 * test không nạp `calls`) → `getChannelVoiceActivityReader()` trả `null` và danh sách kênh bỏ trường `voice`.
 *
 * ⚠ Reader KHÔNG kiểm quyền: caller (danh sách kênh) chỉ truyền id kênh người dùng ĐÃ thấy được.
 */
export interface ChannelVoiceActivity {
  /** Phiên phòng thoại đang chạy của kênh. */
  callId: string;
  /** Số người đang trong phòng (`CONNECTED`/`RECONNECTING`, khớp preview `GET /channels/:id/voice`). */
  count: number;
}

export interface ChannelVoiceActivityReader {
  /** Chỉ trả kênh CÓ phiên đang chạy và ≥ 1 người ở trong; kênh trống/không có phòng → không có trong Map. */
  activityOf(channelIds: string[]): Promise<Map<string, ChannelVoiceActivity>>;
}

let reader: ChannelVoiceActivityReader | null = null;

/** Gọi lúc boot của module sở hữu phòng thoại (`registerCallsModule()`); đăng ký lại sẽ GHI ĐÈ. */
export function registerChannelVoiceActivityReader(impl: ChannelVoiceActivityReader): void {
  reader = impl;
}

export function getChannelVoiceActivityReader(): ChannelVoiceActivityReader | null {
  return reader;
}

/** Chỉ dùng trong test để cô lập giữa các case. */
export function clearChannelVoiceActivityReader(): void {
  reader = null;
}
