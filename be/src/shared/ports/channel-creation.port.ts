/**
 * Cổng tạo kênh cho module khác (p5-04 be.md §5 "Template apply": `IChannelCreationPort`) — `workspace-templates` tạo kênh theo mẫu
 * mà KHÔNG import `modules/channels`. `modules/channels` cài đặt bằng `ChannelService.create` (giữ nguyên kiểm hạn mức kênh, cờ
 * VOICE/POMODORO, tên trùng `CH_001`, grant người tạo, outbox `channel.created`, audit `channel.create`) và export factory
 * `createChannelCreationPort()` từ `modules/channels/index.ts`.
 */
export interface ChannelCreationInput {
  workspaceId: string;
  /** Người tạo (trở thành quản lý kênh riêng tư / thành viên kênh công khai). */
  actorId: string;
  name: string;
  description?: string;
  type: "TEXT" | "VOICE" | "POMODORO";
  visibility: "PUBLIC" | "PRIVATE";
  postingPolicy: "MEMBERS" | "ADMINS_ONLY";
}

export interface ChannelCreationResult {
  id: string;
  name: string;
}

export interface ChannelCreationPort {
  /** Ném `AppError` của kênh (`CH_001` trùng tên, `CH_006` đủ số kênh, `CH_010` loại kênh chưa bật) — người gọi tự map. */
  create(input: ChannelCreationInput): Promise<ChannelCreationResult>;
}
