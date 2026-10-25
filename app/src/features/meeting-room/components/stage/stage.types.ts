import type { MeetingMediaPort } from '../../media/meeting-media.types';

/**
 * Hàm vẽ video do CHA truyền xuống (`getMeetingMedia().renderVideo`): component trong nhóm `stage/` KHÔNG import registry media, để test
 * không cần nạp SDK LiveKit (native). Trả `null` khi không có gì để vẽ (bản giả, track chưa về, adapter không hỗ trợ) ⇒ ô tự rơi về avatar.
 */
export type RenderVideo = MeetingMediaPort['renderVideo'];
