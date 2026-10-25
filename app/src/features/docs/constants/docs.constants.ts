import type { IconName } from '@/shared/ui/icon';
import type { IconTileTone } from '@/shared/ui/icon-tile';

import type {
  CollaboratorRole,
  DocumentMyRole,
  DocumentVisibility,
  SnapshotKind,
} from '../api/docs.types';

/** Giới hạn khớp `LIMITS.document` của BE (README §7) — đổi ở BE thì đổi ở đây (chưa endpoint nào trả về). */
export const DOCS_LIMITS = {
  collaboratorsMax: 50,
  addCollaboratorsPerRequestMax: 20,
  snapshotLabelMax: 100,
  titleMax: 200,
} as const;

/** Mã lỗi BE → câu tiếng Việt (be.md §8 + mã chung hay gặp). Mã lạ rơi về bộ dịch chung của app. */
export const DOCS_ERROR_MESSAGES: Record<string, string> = {
  CFG_005: 'Tính năng tài liệu cộng tác đang tắt.',
  DOC_001: 'Nhóm đã đạt số tài liệu tối đa. Hãy lưu trữ bớt tài liệu cũ rồi thử lại.',
  DOC_002: 'Chuyển tài liệu riêng tư thành chung cho cả nhóm cần bạn xác nhận.',
  DOC_003: 'Người được mời không thuộc nhóm này.',
  DOC_004: 'Tài liệu đã đủ số người cộng tác tối đa.',
  DOC_005: 'Tài liệu đã lưu trữ, chỉ xem được.',
  DOC_006: 'Tài liệu vượt dung lượng cho phép.',
  DOC_007: 'Đã đạt số bản lưu thủ công tối đa của tài liệu này.',
  DOC_008: 'Không thể lưu tài liệu đã lưu trữ.',
  DOC_009: 'Dịch vụ soạn thảo cộng tác chưa sẵn sàng, vui lòng thử lại sau.',
  RES_003: 'Tài liệu vừa được thay đổi ở nơi khác. Đã tải lại — hãy thử lại.',
  RES_004: 'Yêu cầu trước đó vẫn đang được xử lý, đợi một chút rồi thử lại.',
};

export const VISIBILITY_LABEL: Record<DocumentVisibility, string> = {
  PRIVATE: 'Chỉ người được mời',
  WORKSPACE: 'Mọi người trong nhóm',
};

export const VISIBILITY_HINT: Record<DocumentVisibility, string> = {
  PRIVATE: 'Chỉ bạn và người bạn mời xem, sửa được. Quản trị nhóm cũng không tự xem được.',
  WORKSPACE: 'Mọi thành viên của nhóm xem và sửa được.',
};

export const ROLE_LABEL: Record<DocumentMyRole, string> = {
  CREATOR: 'Người tạo',
  EDITOR: 'Được sửa',
  MEMBER: 'Thành viên nhóm',
  VIEWER: 'Chỉ xem',
};

export const COLLABORATOR_ROLE_LABEL: Record<CollaboratorRole, string> = {
  EDITOR: 'Được sửa',
  VIEWER: 'Chỉ xem',
};

/** Loại bản lưu = CHỮ (không chỉ màu/icon — `docs.md` §7 về trợ năng). */
export const SNAPSHOT_KIND_LABEL: Record<SnapshotKind, string> = {
  AUTO: 'Tự động',
  MANUAL: 'Thủ công',
  PRE_RESTORE: 'Trước khi khôi phục',
};

/** Ô icon theo loại bản lưu ở danh sách lịch sử — trang trí (loại luôn có CHỮ ở `SNAPSHOT_KIND_LABEL`), mắt tách nhanh bản
 * tự động (đồng hồ, xám) khỏi bản người dùng chủ động lưu (dấu tích, tông thương hiệu) và bản chụp trước khi khôi phục. */
export const SNAPSHOT_KIND_ART: Record<SnapshotKind, { icon: IconName; tone: IconTileTone }> = {
  AUTO: { icon: 'timer', tone: 'neutral' },
  MANUAL: { icon: 'checkmark-circle', tone: 'brand' },
  PRE_RESTORE: { icon: 'history', tone: 'warning' },
};

/** Ảnh trong tài liệu: URL ký sống ≤ 60 s (be.md §7) — giữ trong bộ nhớ 50 s rồi xin lại. */
export const ASSET_URL_CACHE_MS = 50_000;
