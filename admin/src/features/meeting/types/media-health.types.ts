/**
 * Kiểu `GET /admin/media/health` (p2-07) — khớp `MediaHealth` của BE (`be/src/modules/admin-media-ops/entities/admin-media.types.ts`).
 * BE luôn trả 200; phần nào lỗi thì `status` của phần đó + `error` đã LÀM SẠCH (không URL, không khoá). Chỉ đọc.
 */
export type HealthState = 'OK' | 'DEGRADED' | 'DOWN' | 'DISABLED' | 'UNKNOWN';

export interface QueueHealth {
  waiting: number;
  delayed: number;
  failed: number;
  /** Có khi không đọc được hàng đợi — số đếm khi đó là 0 và KHÔNG tính vào trạng thái tổng. */
  error?: string;
}

export interface MediaHealth {
  /** Trạng thái tổng hợp từ các phần bên dưới. */
  status: HealthState;
  checkedAt: string;
  livekit: {
    status: HealthState;
    latencyMs?: number;
    rooms?: number;
    participants?: number;
    error?: string;
  };
  egress: { status: HealthState; active?: number; failed24h?: number; error?: string };
  webhook: { status: HealthState; lastReceivedAt?: string; received1h: number; failed1h: number };
  turn: { status: HealthState; lastProbeAt?: string; lastProbeOk?: boolean; error?: string };
  queues: Record<'calls' | 'media', QueueHealth>;
}

/** `GET /admin/workspaces/:id/media-stats` đặt ở `features/workspace` (tab "Cuộc gọi & họp"). */
