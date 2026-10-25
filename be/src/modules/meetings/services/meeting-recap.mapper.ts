import type { MeetingEntity } from "../entities/meeting.interface";
import type { RecapAttachmentDto, RecapDto, RecapEntity } from "../entities/meeting-recap.interface";
import type { MeetingAssetInfo } from "./meeting-assets.port";

const iso = (d: Date | null | undefined): string | undefined => (d ? d.toISOString() : undefined);

export const toAttachmentDto = (a: MeetingAssetInfo): RecapAttachmentDto => ({ assetId: a.id, name: a.originalName, mime: a.mime, size: a.size });

interface RecapView {
  meeting: MeetingEntity;
  recap: RecapEntity | null;
  /** `true` = người sửa (thấy NHÁP + tệp hiện tại); `false` = người xem (chỉ bản đã công bố). */
  asEditor: boolean;
  canEdit: boolean;
  canPublish: boolean;
  attachments: RecapAttachmentDto[];
  now: Date;
}

/**
 * Dựng `RecapDto`. Người xem KHÔNG thấy nháp: `content` lấy từ `publishedContent` (snapshot lúc công bố) nên sửa tiếp sau công bố không lộ ra tới khi
 * công bố lại (README §2). Chưa có bản ghi (`recap = null`) → nháp rỗng ảo `version = 0`, chỉ người sửa nhận được.
 */
export function toRecapDto(v: RecapView): RecapDto {
  const { meeting, recap } = v;
  const base = { meetingId: meeting.id, attachments: v.attachments, myActions: { canEdit: v.canEdit, canPublish: v.canPublish }, serverNow: v.now.toISOString() };
  if (!recap) {
    return { ...base, recapId: null, content: "", startedAt: iso(meeting.startedAt), endedAt: iso(meeting.endedAt), authorId: meeting.hostId, lastEditedBy: meeting.hostId, hasUnpublishedChanges: false, version: 0 };
  }
  const published = recap.publishedAt !== null && recap.publishedVersion !== null;
  return {
    ...base,
    recapId: recap.id,
    content: v.asEditor ? recap.content : (recap.publishedContent ?? ""),
    startedAt: iso(recap.startedAt ?? meeting.startedAt),
    endedAt: iso(recap.endedAt ?? meeting.endedAt),
    authorId: recap.authorId,
    lastEditedBy: recap.lastEditedBy,
    ...(published ? { publishedAt: iso(recap.publishedAt), publishedBy: recap.publishedBy ?? undefined, publishedVersion: recap.publishedVersion ?? undefined } : {}),
    // Chưa công bố lần nào ⇒ mọi nội dung đều là "chưa công bố"; đã công bố ⇒ có sửa sau `publishedVersion`.
    hasUnpublishedChanges: v.asEditor && (published ? recap.version > (recap.publishedVersion ?? 0) : true),
    version: v.asEditor ? recap.version : (recap.publishedVersion ?? recap.version),
  };
}
