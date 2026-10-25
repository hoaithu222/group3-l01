import type { IconName } from '@/shared/ui/icon';
import type { IconTileTone } from '@/shared/ui/icon-tile';

import type {
  CollaboratorRole,
  SnapshotKind,
  WhiteboardMyRole,
  WhiteboardVisibility,
} from '../api/whiteboard.types';

/**
 * Tên sự kiện socket của bảng trắng — khai Ở ĐÂY chứ không thêm vào `core/socket/socket.events.ts` (file dùng chung, sát trần dòng). Khớp
 * `SocketEvent.WHITEBOARD_UPDATED` của BE. Payload chỉ có metadata (xem `WhiteboardUpdatedPayload`); nội dung vẽ đến bằng collab.
 */
export const WHITEBOARD_UPDATED_EVENT = 'whiteboard:updated';

/** Giới hạn khớp `LIMITS.whiteboard` của BE (README §7) — đổi ở BE thì đổi ở đây (chưa endpoint nào trả về trừ `elementsMax` trong collab-token). */
export const WB_UI_LIMITS = {
  addCollaboratorsPerRequestMax: 20,
  collaboratorsMax: 50,
  nameMax: 120,
  snapshotLabelMax: 100,
} as const;

/** Mã lỗi BE → câu tiếng Việt (be.md §8 + mã chung hay gặp). Mã lạ rơi về bộ dịch chung của app. */
export const WB_ERROR_MESSAGES: Record<string, string> = {
  CFG_005: 'Tính năng bảng trắng cộng tác đang tắt.',
  DOC_009: 'Dịch vụ vẽ cộng tác chưa sẵn sàng, vui lòng thử lại sau.',
  RES_003: 'Bảng trắng vừa được thay đổi ở nơi khác. Đã tải lại — hãy thử lại.',
  RES_004: 'Yêu cầu trước đó vẫn đang được xử lý, đợi một chút rồi thử lại.',
  WB_001: 'Nhóm đã đạt số bảng trắng tối đa. Hãy lưu trữ bớt bảng cũ rồi thử lại.',
  WB_002: 'Ảnh thu nhỏ của bảng không hợp lệ.',
  WB_003: 'Người được mời không thuộc nhóm này.',
  WB_004: 'Bảng trắng đã đủ số người cộng tác tối đa.',
  WB_005: 'Bảng trắng đã lưu trữ, chỉ xem được.',
  WB_006: 'Đã đạt số bản lưu thủ công tối đa của bảng này.',
  WB_007: 'Bảng trắng đã đầy: vượt số phần tử hoặc dung lượng cho phép.',
  WB_008: 'Không thể lưu bảng trắng đã lưu trữ.',
};

export const VISIBILITY_LABEL: Record<WhiteboardVisibility, string> = {
  PRIVATE: 'Chỉ người được mời',
  WORKSPACE: 'Mọi người trong nhóm',
};

export const VISIBILITY_HINT: Record<WhiteboardVisibility, string> = {
  PRIVATE: 'Chỉ bạn và người bạn mời xem, vẽ được. Quản trị nhóm cũng không tự xem được.',
  WORKSPACE: 'Mọi thành viên của nhóm xem và vẽ được.',
};

export const ROLE_LABEL: Record<WhiteboardMyRole, string> = {
  CREATOR: 'Người tạo',
  EDITOR: 'Được vẽ',
  MEMBER: 'Thành viên nhóm',
  VIEWER: 'Chỉ xem',
};

export const COLLABORATOR_ROLE_LABEL: Record<CollaboratorRole, string> = {
  EDITOR: 'Được vẽ',
  VIEWER: 'Chỉ xem',
};

/** Loại bản lưu = CHỮ (không chỉ màu/icon — trợ năng). */
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

/**
 * Awareness của bảng trắng (`collab/README.md` §3.3): client throttle ≤ 30 lần/giây (server bỏ tin quá 60/giây/kết nối), mỗi state ≤ 2 KiB,
 * khoá chỉ được là `user`/`pointer`/`selection`/`viewport` — khoá lạ (`cursor`, `tool`, `draft`…) làm server ĐÓNG kết nối.
 */
export const AWARENESS = {
  maxBytes: 2048,
  maxHz: 30,
  /** Tối đa bấy nhiêu id phần tử trong `selection` phát đi (mỗi id ≤ 64 ký tự; 20 id ≈ 1,5 KiB — dưới trần 2 KiB cùng các khoá khác). */
  selectionMax: 20,
} as const;

/** Trạng thái nối chờ bấy lâu chưa đồng bộ lần nào thì báo "Không mở được bảng" (bundle/mạng treo) — như `EDITOR_LOAD_TIMEOUT_MS` của tài liệu. */
export const SESSION_LOAD_TIMEOUT_MS = 20_000;
