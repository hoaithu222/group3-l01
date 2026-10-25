import { registerAssetTargetReadResolver } from "../../../shared/ports/asset-target-access.port";
import { loadViewer, recapRights, recordingRights } from "./recap-recording.access";
import type { MeetingRoomDeps } from "./meeting-room.deps";

/**
 * Quyền ĐỌC tệp theo đối tượng gắn (`AssetAccessService.canRead` → resolver theo `targetType`, p4-01 port) cho hai đích của p2-06 — `MEETING_RECAP` và
 * `MEETING_RECORDING` không quy về một `ScopeType` cố định (nháp vs công bố, bản ghi READY vs đã xoá) nên đăng ký resolver riêng:
 *  · đính kèm biên bản: người SỬA đọc được mọi tệp hiện có; người xem CHỈ đọc tệp đã có trong bản công bố (`publishedAssetIds`) và chỉ khi biên bản đã công bố;
 *  · tệp ghi hình: người xem được cuộc họp đọc được khi bản ghi còn READY chưa xoá. (Tải về/URL phát vẫn đi qua `GET /recordings/:id/url` với luật riêng.)
 * Người ngoài cuộc họp → `false` → `AssetService` trả 404 trung tính. Chưa đăng ký (worker) → rơi về luật scope `MEETING` (`meeting.read`).
 */
export function registerMeetingAssetReadResolvers(getDeps: () => MeetingRoomDeps): void {
  registerAssetTargetReadResolver("MEETING_RECAP", {
    async canRead(user, link) {
      const d = getDeps();
      const recap = await d.recaps.findById(link.targetId);
      const meeting = recap ? await d.repo.findById(recap.meetingId) : null;
      if (!recap || !meeting) return false;
      const rights = recapRights(await loadViewer(d, meeting, user.id), recap);
      return rights.canViewDraft || (rights.canViewPublished && recap.publishedAssetIds.includes(link.assetId));
    },
  });
  registerAssetTargetReadResolver("MEETING_RECORDING", {
    async canRead(user, link) {
      const d = getDeps();
      const rec = await d.recordings.findById(link.targetId);
      const meeting = rec && !rec.deletedAt && rec.status === "READY" ? await d.repo.findById(rec.meetingId) : null;
      if (!meeting) return false;
      return recordingRights(await loadViewer(d, meeting, user.id)).canView;
    },
  });
}
