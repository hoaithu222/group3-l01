import type { Hocuspocus } from "@hocuspocus/server";
import type { AccessService } from "../access-service";
import { closeLiveConnection, liveConnections, type LiveConnection } from "../connections";
import type { Logger } from "../logger";
import { errorMeta } from "../logger";
import type { CollabMetrics } from "../metrics";
import { encodeNotice } from "../types";

export interface RecheckResult {
  checked: number;
  closed: number;
  downgraded: number;
  errors: number;
}

const PARALLEL = 8;

/**
 * Lưới an toàn thu hồi quyền (CW-D1): mỗi `ACCESS_RECHECK_MS` (mặc định 30 s) hỏi lại BE (bỏ đệm) cho từng cặp (document, user) đang
 * kết nối. Hết quyền → đóng kết nối (`forbidden`); bị hạ từ sửa xuống xem → chuyển kết nối sang `readOnly` và báo `READ_ONLY`.
 * Nhờ đó dù tin `/internal/kick` của BE thất lạc, hiệu lực thu hồi vẫn ≤ chu kỳ này. BE lỗi → GIỮ kết nối (không đá hàng loạt
 * khi BE chớp tắt), chỉ đếm lỗi; vòng sau thử lại. Kết nối MỚI thì vẫn bị từ chối khi BE lỗi (`onAuthenticate`).
 */
export class AccessRechecker {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly hocuspocus: () => Hocuspocus,
    private readonly access: AccessService,
    private readonly logger: Logger,
    private readonly metrics: CollabMetrics,
    private readonly intervalMs: number,
  ) {}

  start(): void {
    if (this.intervalMs <= 0 || this.timer) return;
    this.timer = setInterval(() => {
      void this.runOnce().catch((err: unknown) => this.logger.error("vòng kiểm lại quyền lỗi", errorMeta(err)));
    }, this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async runOnce(): Promise<RecheckResult> {
    const result: RecheckResult = { checked: 0, closed: 0, downgraded: 0, errors: 0 };
    if (this.running) return result;
    this.running = true;
    try {
      const groups = new Map<string, LiveConnection[]>();
      for (const live of liveConnections(this.hocuspocus())) {
        if (!live.ctx.user || !live.ctx.kind || !live.ctx.resourceId) continue;
        const key = `${live.documentName}|${live.ctx.user.id}`;
        const list = groups.get(key);
        if (list) list.push(live);
        else groups.set(key, [live]);
      }
      const entries = [...groups.values()];
      for (let i = 0; i < entries.length; i += PARALLEL) {
        await Promise.all(entries.slice(i, i + PARALLEL).map((group) => this.checkGroup(group, result)));
      }
    } finally {
      this.running = false;
    }
    return result;
  }

  private async checkGroup(group: LiveConnection[], result: RecheckResult): Promise<void> {
    const first = group[0];
    if (!first?.ctx.user || !first.ctx.kind || !first.ctx.resourceId) return;
    result.checked += 1;
    let granted;
    try {
      granted = await this.access.check(first.ctx.kind, first.ctx.resourceId, first.ctx.user.id, first.ctx.sv ?? 0, { fresh: true });
    } catch (err) {
      result.errors += 1;
      this.logger.warn("kiểm lại quyền: BE lỗi, giữ kết nối", { documentName: first.documentName, ...errorMeta(err) });
      return;
    }
    if (granted === null || !granted.allowed) {
      for (const live of group) closeLiveConnection(live, "forbidden");
      result.closed += group.length;
      this.metrics.kicksTotal.inc({ reason: "recheck" }, group.length);
      return;
    }
    if (granted.mode === "view") {
      for (const live of group) {
        if (live.ctx.mode === "view" && live.connection.readOnly) continue;
        live.connection.readOnly = true;
        live.ctx.mode = "view";
        live.connection.sendStateless(encodeNotice("READ_ONLY"));
        result.downgraded += 1;
      }
    }
  }
}
