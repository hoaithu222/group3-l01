import type { IContributionStateRepository } from "../repositories/contribution-state.repository.interface";
import type { ContributionFactsService } from "./contribution-facts.service";
import type { IContribConfigPort } from "./contribution.ports";

const PAGE = 200;
/** Trần số bảng xếp tính lại MỖI LƯỢT quét: tránh dồn hàng nghìn job cùng lúc; phần còn lại xử lý lượt sau (hoặc ngay khi có người mở báo cáo). */
export const RETIMEZONE_RECOMPUTE_MAX = 1000;

export interface TimezoneSyncResult {
  boards: number;
  recompute: number;
  heatmap: number;
}

export interface ContributionTimezoneSyncDeps {
  states: IContributionStateRepository;
  config: IContribConfigPort;
  factsService: ContributionFactsService;
  now?: () => Date;
}

/**
 * Múi giờ (`pm.timezone`) đổi ⇒ ranh giới ngày/tuần/tháng và "cuối ngày hạn" đổi, còn snapshot `ALL`/`M:*` và ô heatmap ĐÃ LƯU vẫn theo múi giờ cũ. Bảng đang được mở đã
 * đúng ngay (báo cáo tính tại chỗ + xếp tính lại, heatmap dựng lại đủ lịch sử — xem `reportData`/`refreshIfStale`); lượt quét đêm này kéo phần còn lại (bảng không ai mở) về
 * đúng múi giờ: snapshot lệch → xếp job tính lại; ô heatmap lệch → đánh dấu "bẩn" để job 15 phút (`activity.aggregate`) dựng lại.
 *
 * Idempotent: bảng đã đúng múi giờ không bị đụng tới; chạy lại không đổi gì. Lỗi hạ tầng (queue/DB) làm dừng cả lượt — an toàn vì lượt sau (hoặc người dùng mở báo cáo) làm tiếp.
 */
export class ContributionTimezoneSync {
  private readonly now: () => Date;

  constructor(private readonly d: ContributionTimezoneSyncDeps) {
    this.now = d.now ?? (() => new Date());
  }

  async run(): Promise<TimezoneSyncResult> {
    const result: TimezoneSyncResult = { boards: 0, recompute: 0, heatmap: 0 };
    const defaults = await this.d.config.defaults();
    const zones = new Map<string, string>();
    const zoneOf = async (workspaceId: string): Promise<string> => {
      const known = zones.get(workspaceId);
      if (known) return known;
      const zone = await this.d.config.timezone(workspaceId);
      zones.set(workspaceId, zone);
      return zone;
    };

    let after: string | null = null;
    for (;;) {
      const page = await this.d.states.listPage(after, PAGE);
      for (const state of page) {
        result.boards += 1;
        const zone = await zoneOf(state.workspaceId);
        if (state.computedAt !== null && state.snapshotTimezone !== zone && result.recompute < RETIMEZONE_RECOMPUTE_MAX) {
          await this.d.factsService.requestRecompute(state.boardId);
          result.recompute += 1;
        }
        if (state.activityRefreshedAt !== null && state.activityTimezone !== zone) {
          await this.d.states.markActivityDirty(state.boardId, state.workspaceId, defaults, this.now());
          result.heatmap += 1;
        }
      }
      if (page.length < PAGE) break;
      after = page[page.length - 1].boardId;
    }
    return result;
  }
}
