/**
 * Đường dẫn admin kinh tế xu — nối sau `appConfig.apiBaseUrl` (đã chứa `/v1`). Khớp `be/src/modules/coins/admin-economy.routes.ts`;
 * mọi route cần cờ `coins`, xem `gamification:view`, ghi `gamification:update` (lý do 10–500 + audit).
 */

/** `id`/`userId` từ BE đi vào đường dẫn → mã hoá để không chèn được `/`, `?`, `#`. */
const seg = encodeURIComponent;

export const economyApi = {
  /** GET `?days` (1–31, mặc định 7) — `{ totals, perDay[], circulating, topItems[], reconcile }`. */
  overview: '/admin/economy/overview',
  /** GET — ví một người; 404 khi người dùng không tồn tại / đã ẩn danh hoá. */
  userWallet: (userId: string) => `/admin/economy/users/${seg(userId)}/wallet`,
  /** GET `?cursor&limit&type` — sổ cái mới → cũ, kèm `note` (lý do điều chỉnh) và `actorId`. */
  userTransactions: (userId: string) => `/admin/economy/users/${seg(userId)}/transactions`,
  /** POST `{ amount, reason }` + header `Idempotency-Key` BẮT BUỘC → `{ balance, delta, replayed }` (`COIN_001`, `COIN_009`). */
  userAdjust: (userId: string) => `/admin/economy/users/${seg(userId)}/adjust`,
  /** GET `?kind` — cả vật phẩm đang tắt, kèm `owners`; POST tạo (409 khi trùng mã). */
  shopItems: '/admin/economy/shop-items',
  /** PATCH — CAS `expectedVersion` (`RES_003`), không đổi `code`/`kind`. */
  shopItem: (id: string) => `/admin/economy/shop-items/${seg(id)}`,
  /** GET — luật kèm `issued7d`. */
  rules: '/admin/economy/rules',
  /** PATCH — tạo luật thì `expectedVersion` 0, sửa thì CAS (`RES_003`). */
  rule: (sourceType: string) => `/admin/economy/rules/${seg(sourceType)}`,
  /** GET — cả nhiệm vụ đang tắt; POST tạo (409 khi trùng mã). */
  quests: '/admin/economy/quests',
  /** PATCH — CAS `expectedVersion` (`RES_003`), không đổi `code`. */
  quest: (id: string) => `/admin/economy/quests/${seg(id)}`,
  /** GET `?cursor&limit` — tin niêm yết chờ duyệt (chợ tài liệu, P1). */
  pendingListings: '/admin/economy/listings',
  /** GET `?cursor&limit` — tin ĐANG bán/ĐÃ ẩn có báo cáo, nhiều báo cáo nhất trước. */
  reportedListings: '/admin/economy/listings/reported',
  /** POST `{ reason }` — duyệt PENDING_REVIEW → ACTIVE (`gamification:update`). */
  listingApprove: (id: string) => `/admin/economy/listings/${seg(id)}/approve`,
  /** POST `{ reason }` — từ chối PENDING_REVIEW → WITHDRAWN (`gamification:update`). */
  listingReject: (id: string) => `/admin/economy/listings/${seg(id)}/reject`,
  /** POST `{ reason }` — ẩn ACTIVE → HIDDEN + tự hoàn xu người mua trong hạn (`moderation:update`, KHÁC quyền các route economy còn lại). */
  listingHide: (id: string) => `/admin/economy/listings/${seg(id)}/hide`,
  /** POST `{ reason }` — khôi phục HIDDEN → ACTIVE (`moderation:update`). */
  listingRestore: (id: string) => `/admin/economy/listings/${seg(id)}/restore`,
  /**
   * GET · PUT `{ value, expectedVersion, reason }` — bật/tắt chợ + phí % + cấp độ tối thiểu tự duyệt. Đường CHUNG của module `system-config`
   * (`admin/src/features/system-config/service/system-config.api.ts` khai lại kiểu tổng quát); ở đây gọi THẲNG khoá `economy`, không import feature đó.
   */
  settings: '/admin/system-config/economy',
} as const;
