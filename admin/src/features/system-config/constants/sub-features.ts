/**
 * Cờ PHỤ của tiện ích (khoá `features` của `SystemConfig`, p5-04/p2-06): không phải phân hệ, mặc định BẬT, chỉ có hiệu lực khi phân hệ
 * cha bật. Khớp `SUB_FEATURE_PARENT` phía BE (`be/src/core/constants/modules.ts`); BE thêm cờ phụ mới thì thêm dòng ở đây.
 *
 * `GET /capabilities` trả chúng chung map `features` với phân hệ (`{ enabled, available }`, `available` = phân hệ cha có mã — và với
 * `meetingRecording` còn cần hạ tầng ghi hình), nên tab "Tính năng" dựng dòng từ `fields[]` × `capabilities.features` như phân hệ
 * thường — chỉ khác chỗ nhóm + khoá theo cha.
 */
export const SUB_FEATURE_PARENT: Readonly<Record<string, string>> = {
  workspaceSearch: 'communication',
  workspaceTemplates: 'communication',
  readConfirm: 'communication',
  meetingRecording: 'meeting',
};

/** Tên nhóm hiện trên đầu các cờ phụ của cùng một phân hệ cha. */
export const SUB_FEATURE_GROUP_LABELS: Readonly<Record<string, string>> = {
  communication: 'Giao tiếp',
  meeting: 'Cuộc họp',
};

/**
 * Vì sao một cờ phụ `available=false` KHI phân hệ cha đã có mã (chỉ những cờ cần hạ tầng riêng). Cờ không có dòng ở đây thì
 * dùng lời chung "chưa khả dụng". Nguồn điều kiện: `isMeetingRecordingSupported()` phía BE (LiveKit + storage S3 + Egress cùng bucket).
 */
export const SUB_FEATURE_UNAVAILABLE_REASONS: Readonly<Record<string, string>> = {
  meetingRecording: 'Storage hiện tại không hỗ trợ ghi hình (cần S3/MinIO + LiveKit Egress).',
};
