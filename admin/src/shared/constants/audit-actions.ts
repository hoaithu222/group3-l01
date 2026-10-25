/**
 * Nhãn tiếng Việt cho `action` / `targetType` của nhật ký quản trị (`GET /audit-logs`).
 *
 * Nguồn thật: mọi lời gọi `auditService.record({ action, targetType })` trong
 * `../be/src` (đối chiếu lần cuối 2026-09-25). BE thêm action mới thì thêm nhãn ở đây —
 * action CHƯA có nhãn KHÔNG vỡ UI: `auditActionLabel()` rơi về chính mã.
 *
 * Đặt ở `shared/` (không phải `features/audit-log/`) vì `AuditTrailPanel` (widget
 * dùng trong drawer user/workspace…) cũng cần — feature không được import feature khác.
 */

/** Action mà BE ghi thật (hoặc đã chốt trong kế hoạch và sắp ghi) → nhãn hiển thị. */
export const AUDIT_ACTION_LABELS: Readonly<Record<string, string>> = {
  // ── Người dùng (be/src/modules/users) ───────────────────────────────────
  'user.lock': 'Khoá tài khoản',
  'user.unlock': 'Mở khoá tài khoản',
  'user.change-role': 'Đổi vai trò người dùng',
  // BE chỉ ghi khi PATCH /users/:id đổi vai trò, email hoặc mật khẩu (`metadata.fields` liệt kê các trường đó).
  'user.update': 'Cập nhật thông tin đăng nhập người dùng (email, mật khẩu, vai trò)',
  'user.request-anonymize': 'Yêu cầu xoá tài khoản',
  'user.delete-request': 'Người dùng tự yêu cầu xoá tài khoản',
  'user.delete-cancel': 'Người dùng huỷ yêu cầu xoá tài khoản',
  'user.anonymize': 'Ẩn danh hoá tài khoản',
  'user.anonymize-cancel': 'Huỷ yêu cầu ẩn danh hoá',
  'user.biometric-revoke': 'Thu hồi đăng nhập sinh trắc học',
  // be/src/modules/users/services/user-avatar.service.ts — quản trị gỡ ảnh đại diện vi phạm (`POST /admin/users/:id/avatar/remove`).
  'user.avatar-remove': 'Gỡ ảnh đại diện',

  // ── Xác thực (be/src/modules/auth) ──────────────────────────────────────
  'auth.logout-all': 'Đăng xuất mọi thiết bị',
  'auth.session-revoke': 'Thu hồi một phiên đăng nhập',
  // BE ghi khi một tài khoản chạm ngưỡng nhập sai mật khẩu (`metadata.lockSeconds`) — KHÔNG phải khoá tài khoản.
  'auth.login-locked': 'Khoá đăng nhập tạm thời (nhập sai mật khẩu nhiều lần)',
  'auth.password-change': 'Đổi mật khẩu',
  'auth.password-reset': 'Đặt lại mật khẩu',
  // be/src/modules/auth/services/social-login.service.ts — đăng nhập bằng Google/Firebase (tạo mới hoặc liên kết tài khoản).
  'auth.social-login': 'Đăng nhập bằng mạng xã hội',

  // ── Cấu hình hệ thống (system-config) ───────────────────────────────────
  'system-config.update': 'Sửa cấu hình',
  'system-config.reset': 'Khôi phục cấu hình mặc định',

  // ── Vận hành hệ thống (admin-jobs / admin-push / admin-storage) ─────────
  'system.job-retry': 'Thử lại job lỗi',
  'system.job-remove': 'Xoá job',
  'system.job-outbox-requeue': 'Đưa lại sự kiện outbox vào hàng đợi',
  // Đã chốt ở kế hoạch p0-05 (`POST /admin/storage/cleanup`), BE chưa ghi audit.
  'system.storage-cleanup': 'Dọn tệp mồ côi',
  'push.test': 'Gửi thông báo thử',

  // ── Workspace ───────────────────────────────────────────────────────────
  'workspace.transfer-owner': 'Chuyển quyền chủ workspace',
  'workspace.platform-archive': 'Lưu trữ workspace (cấp nền tảng)',
  'workspace.platform-restore': 'Khôi phục workspace (cấp nền tảng)',
  // be/src/modules/workspaces/services/admin-workspace-image.service.ts — gỡ ảnh đại diện/ảnh bìa vi phạm (`metadata.kind` = AVATAR | COVER).
  'workspace.image-remove': 'Gỡ ảnh nhóm',
  // p5-04 (be/src/modules/workspace-templates): áp mẫu cho nhóm đã có; admin sửa/bật-tắt/đổi thứ tự mẫu.
  'workspace.template-apply': 'Áp mẫu kênh cho nhóm',
  'workspace-template.update': 'Sửa mẫu nhóm',

  // ── Thành viên workspace ────────────────────────────────────────────────
  'member.role-change': 'Đổi vai trò thành viên',
  'member.ban': 'Cấm thành viên',
  'member.unban': 'Bỏ cấm thành viên',
  'member.remove': 'Xoá thành viên',
  // be/src/modules/members/services/member-add.service.ts — thêm thẳng người dùng sau khi tra email/SĐT.
  'member.add': 'Thêm thành viên trực tiếp',
  'member.platform-revoke': 'Thu hồi thành viên (cấp nền tảng)',
  'invite.create': 'Tạo liên kết mời',
  'invite.revoke': 'Thu hồi liên kết mời',

  // ── Khách, lời mời email, duyệt tham gia, thiết lập truy cập (p3-04; be/src/modules/members|workspaces) ──
  'workspace.settings-update': 'Sửa chính sách tham gia/khách của workspace',
  'invitation.create': 'Gửi lời mời email',
  'invitation.resend': 'Gửi lại lời mời email',
  'invitation.revoke': 'Thu hồi lời mời email',
  'invitation.accept': 'Chấp nhận lời mời email',
  'join-request.approve': 'Duyệt yêu cầu tham gia',
  'join-request.reject': 'Từ chối yêu cầu tham gia',
  'guest.update': 'Sửa hạn/kênh của khách',
  'guest.expire': 'Khách hết hạn truy cập',

  // ── Kênh ────────────────────────────────────────────────────────────────
  'channel.create': 'Tạo kênh',
  'channel.archive': 'Lưu trữ kênh',
  'channel.restore': 'Khôi phục kênh',
  'channel.platform-archive': 'Lưu trữ kênh (cấp nền tảng)',
  'channel.platform-restore': 'Khôi phục kênh (cấp nền tảng)',
  'channel.grant': 'Cấp quyền kênh',
  'channel.grant-patch': 'Sửa quyền kênh',
  'channel.grant-revoke': 'Thu hồi quyền kênh',
  // p3-04 (be/src/modules/channels): cấp/gỡ quyền kênh riêng tư cho cả nhóm vai trò.
  'channel.grant-role': 'Cấp quyền kênh theo vai trò',
  'channel.grant-role-revoke': 'Gỡ quyền kênh theo vai trò',

  // ── Kiểm duyệt (be/src/modules/messages/services/message-moderation.service.ts) ──
  'message.moderator-remove': 'Kiểm duyệt viên gỡ tin nhắn',
  // p1-08 (be/src/modules/moderation): xử lý báo cáo cấp nền tảng + xem nội dung riêng tư (D-06).
  'moderation.view-private': 'Xem nội dung báo cáo riêng tư',
  'moderation.dismiss': 'Bỏ qua báo cáo',
  'moderation.remove-content': 'Gỡ nội dung bị báo cáo',
  'moderation.warn-author': 'Cảnh cáo tác giả',
  'moderation.lock-author': 'Khoá tài khoản tác giả bị báo cáo',
  'moderation.archive-channel': 'Lưu trữ kênh bị báo cáo',
  'moderation.dissolve-conversation': 'Giải tán nhóm chat bị báo cáo',
  'report.resolve': 'Xử lý báo cáo (người kiểm duyệt phạm vi)',

  // ── Ví nhóm (be/src/modules/wallet) ─────────────────────────────────────
  'wallet.settings-update': 'Sửa cài đặt ví nhóm',
  'wallet.payment-info-view': 'Xem thông tin nhận tiền',

  // ── In ấn O2O (p6-05; be/src/modules/o2o) ───────────────────────────────
  'print.order-cancel-admin': 'Huỷ đơn in (cấp nền tảng)',
  'print.file-download': 'Tiệm in tải tệp của đơn in',
  'print.shop-accepting': 'Tiệm in bật/tắt nhận đơn',
  // Vận hành địa điểm/tiệm in (`admin-locations.service.ts`, `admin-shops.service.ts`) — `metadata` của sửa tiệm có bảng giá trước/sau.
  'o2o.location-create': 'Tạo địa điểm',
  'o2o.location-update': 'Sửa địa điểm',
  'o2o.location-hide': 'Ẩn địa điểm',
  'o2o.location-unhide': 'Hiện lại địa điểm',
  'o2o.review-hide': 'Ẩn đánh giá địa điểm vi phạm',
  'o2o.review-unhide': 'Hiện lại đánh giá địa điểm',
  'print.shop-create': 'Tạo tiệm in',
  'print.shop-update': 'Sửa tiệm in (bảng giá, năng lực, nhận đơn)',
  'print.shop-approve': 'Duyệt tiệm in',
  'print.shop-suspend': 'Tạm ngưng tiệm in',

  // ── Kho tài liệu (p3-01 admin.md §2.1; BE be/src/modules/resources) ────
  'resource.purge': 'Dọn vĩnh viễn tệp trong thùng rác',
  'resource.quota-override': 'Đặt hạn mức kho tài liệu riêng cho nhóm',

  // ── Dự án (p3-03; be/src/modules/projects) ──────────────────────────────
  'task-comment.remove': 'Gỡ bình luận thẻ công việc (quản trị nhóm)',

  // ── Chấm chéo (p4-05; be/src/modules/projects/services/review) ──────────
  // Chủ nhóm/quản trị nhóm giao lại người chấm hoặc miễn chấm cho một thẻ; có lý do, KHÔNG có điểm hay nhận xét.
  'task-review.reassign': 'Giao lại người chấm chéo (quản trị nhóm)',
  'task-review.waive': 'Miễn chấm chéo cho thẻ (quản trị nhóm)',

  // ── Báo cáo đóng góp (p4-06; be/src/modules/contribution) ───────────────
  // Chủ nhóm/quản trị nhóm đổi trọng số của MỘT bảng; `metadata` chỉ có công thức trước/sau, KHÔNG có số liệu thành viên.
  'board.contribution-config': 'Đổi công thức tính đóng góp của bảng',

  // ── Bộ học (p4-01; be/src/modules/study) ────────────────────────────────
  'study-set.hide': 'Ẩn bộ học',
  'study-set.unhide': 'Bỏ ẩn bộ học (quản trị nhóm)',
  'study-set.restore': 'Khôi phục bộ học',

  // ── Mentor Connect (p6-03; be/src/modules/mentor) ───────────────────────
  'mentor.accept': 'Chấp nhận cố vấn (cấp khách có hạn)',
  'mentor.engagement-extend': 'Gia hạn đợt cố vấn',
  'mentor.engagement-end': 'Kết thúc đợt cố vấn (quản trị nhóm)',
  'mentor.engagement-end-platform': 'Kết thúc đợt cố vấn cấp nền tảng',
  'mentor.post-hide': 'Ẩn bài tìm cố vấn',
  'mentor.post-unhide': 'Khôi phục bài tìm cố vấn',

  // ── Gamification (p4-03; be/src/modules/gamification) ───────────────────
  'xp-rule.update': 'Sửa luật điểm kinh nghiệm',
  'badge.create': 'Tạo huy hiệu',
  'badge.update': 'Sửa huy hiệu',
  'badge.backfill': 'Cấp huy hiệu cho người đã đủ điều kiện',
  'badge.revoke': 'Thu hồi huy hiệu',
  'gamification.xp-adjust': 'Điều chỉnh điểm kinh nghiệm',

  // ── Lộ trình học (p4-07; be/src/modules/roadmap) ─────────────────────────
  'roadmap-subject.create': 'Tạo lộ trình',
  'roadmap-subject.update': 'Sửa thông tin lộ trình',
  'roadmap-subject.publish': 'Xuất bản lộ trình',
  'roadmap-subject.unpublish': 'Gỡ xuất bản lộ trình',
  'roadmap-subject.archive': 'Lưu trữ lộ trình',
  'roadmap-subject.delete': 'Xoá lộ trình',
  'roadmap-phase.create': 'Thêm tháng',
  'roadmap-phase.update': 'Sửa thông tin tháng',
  'roadmap-phase.delete': 'Xoá tháng',
  'roadmap-lesson.create': 'Thêm buổi học',
  'roadmap-lesson.update': 'Sửa buổi học',
  'roadmap-lesson.publish': 'Xuất bản buổi học',
  'roadmap-lesson.unpublish': 'Gỡ xuất bản buổi học',
  'roadmap-lesson.delete': 'Xoá buổi học',
  'roadmap-media.create': 'Thêm ảnh buổi học',
  'roadmap-media.update': 'Sửa ảnh buổi học',
  'roadmap-media.delete': 'Xoá ảnh buổi học',
  'roadmap.reorder': 'Sắp xếp tháng/buổi trong lộ trình',

  // ── Huy hiệu kỹ năng xác thực (p6-06; be/src/modules/career) ──────────────
  'skill.create': 'Tạo kỹ năng',
  'skill.update': 'Sửa kỹ năng',
  'skill.activate': 'Bật kỹ năng',
  'skill.deactivate': 'Tắt kỹ năng',
  'skill.revoke': 'Thu hồi huy hiệu kỹ năng',
  'skill.restore': 'Khôi phục huy hiệu kỹ năng',
  'skill.reevaluate': 'Đánh giá lại toàn bộ kỹ năng',

  // ── Lịch họp (p2-04; be/src/modules/meetings) ───────────────────────────
  'meeting.create': 'Tạo cuộc họp',
  'meeting.update': 'Sửa cuộc họp',
  'meeting.cancel': 'Huỷ cuộc họp',
  'meeting.cancel-by-admin': 'Huỷ cuộc họp (quản trị nhóm)',
  'meeting.delete': 'Xoá cuộc họp',
  'meeting.transfer-host': 'Chuyển quyền chủ trì cuộc họp',
  // p2-05 (be/src/modules/meetings/services/meeting-room.*): phòng họp thật.
  'meeting.start': 'Bắt đầu phòng họp',
  'meeting.end': 'Kết thúc cuộc họp',
  'meeting.end-system': 'Hệ thống kết thúc cuộc họp',
  'meeting.host-grace': 'Tự chuyển chủ trì khi chủ trì rời phòng',
  // p2-05 host control (be/src/modules/meetings/services/meeting-host-control.service.ts): chủ trì/đồng chủ trì điều khiển phòng đang họp.
  'meeting.lock': 'Khoá phòng họp',
  'meeting.unlock': 'Mở khoá phòng họp',
  'meeting.mute-all': 'Tắt mic tất cả người tham gia',
  'meeting.participant-muted': 'Tắt mic/camera hoặc dừng chia sẻ của người tham gia',
  'meeting.participant-removed': 'Mời người tham gia ra khỏi phòng họp',
  'meeting.participant-role': 'Đổi vai trò người tham gia trong phiên họp',
  'meeting.transfer-control': 'Giao quyền điều khiển phòng họp',
  // p2-07 (be/src/modules/admin-media-ops): quản trị nền tảng kết thúc cưỡng bức, có lý do.
  'meeting.force-end': 'Quản trị kết thúc cuộc họp',
  'call.force-end': 'Quản trị kết thúc cuộc gọi',
  // p2-06 (be/src/modules/meetings/services/meeting-recap.*, meeting-recording.*, recording-*): biên bản & ghi hình.
  'meeting.recap-publish': 'Công bố biên bản họp',
  'recording.consent-request': 'Yêu cầu đồng ý ghi hình cuộc họp',
  'recording.start': 'Bắt đầu ghi hình cuộc họp',
  'recording.stop': 'Dừng ghi hình cuộc họp',
  'recording.retry-import': 'Thử lại xử lý bản ghi hình',
  'recording.download': 'Tải bản ghi hình (quản trị nhóm)',
  'recording.delete': 'Xoá bản ghi hình',

  // ── Live Quiz (p5-01; be/src/modules/live-quiz) ──────────────────────────
  'live-quiz.admin-end': 'Kết thúc phiên Live Quiz (quản trị)',

  // ── Tích hợp (p5-03; be/src/modules/integrations) ───────────────────────
  'integration.connect': 'Kết nối tích hợp',
  'integration.update': 'Sửa cấu hình tích hợp',
  'integration.disconnect': 'Ngắt kết nối tích hợp',
  'integration.replay': 'Phát lại sự kiện webhook',
  'integration.provider-toggle': 'Bật/tắt nhà cung cấp tích hợp',
  'integration.calendar-connect': 'Nối Google Calendar cá nhân',
  'integration.calendar-disconnect': 'Ngắt Google Calendar cá nhân',

  // ── Tài liệu cộng tác (p6-01; be/src/modules/documents) ─────────────────
  'document.create': 'Tạo tài liệu',
  'document.update': 'Sửa thông tin tài liệu',
  'document.archive': 'Lưu trữ tài liệu',
  'document.unarchive': 'Bỏ lưu trữ tài liệu',
  'document.collaborator.add': 'Thêm người cộng tác tài liệu',
  'document.collaborator.remove': 'Gỡ người cộng tác tài liệu',
  'document.snapshot.create': 'Lưu bản tài liệu thủ công',
  'document.snapshot.restore': 'Khôi phục tài liệu về một bản đã lưu',

  // ── Bảng trắng cộng tác (p6-02; be/src/modules/whiteboards) ─────────────
  'whiteboard.create': 'Tạo bảng trắng',
  'whiteboard.update': 'Sửa thông tin bảng trắng',
  'whiteboard.archive': 'Lưu trữ bảng trắng',
  'whiteboard.unarchive': 'Bỏ lưu trữ bảng trắng',
  'whiteboard.collaborator.add': 'Thêm người cộng tác bảng trắng',
  'whiteboard.collaborator.remove': 'Gỡ người cộng tác bảng trắng',
  'whiteboard.snapshot.create': 'Lưu bản bảng trắng thủ công',
  'whiteboard.snapshot.restore': 'Khôi phục bảng trắng về một bản đã lưu',

  // ── Kinh tế xu (p7-02; be/src/modules/coins) ─────────────────────────────
  'coins.adjust': 'Điều chỉnh số dư xu của người dùng',
  'coins.rule.update': 'Sửa quy tắc thưởng xu',
  'coins.shop-item.create': 'Thêm vật phẩm cửa hàng',
  'coins.shop-item.update': 'Sửa vật phẩm cửa hàng',
  'coins.quest.create': 'Tạo nhiệm vụ ngày',
  'coins.quest.update': 'Sửa nhiệm vụ ngày',

  // ── Theo dõi sức khoẻ học tập / burnout (p7-03; be/src/modules/burnout) ────
  // Chỉ có hành động của ADMIN đổi bộ luật. Hành động của người dùng (bật/tắt/xoá dữ liệu) CỐ Ý không ghi audit
  // để admin không nhìn thấy ai đang dùng tính năng riêng tư này.
  'wellbeing.rules-update': 'Sửa bộ luật theo dõi sức khoẻ học tập',
  // Quản trị nền tảng dọn bản lưu tự động cũ (`POST /admin/collab/cleanup-snapshots`).
  'collab.cleanup-snapshots': 'Dọn bản lưu tự động của tài liệu cộng tác',

  // ── Portfolio (p6-07; be/src/modules/portfolio) ─────────────────────────
  'portfolio.takedown': 'Gỡ portfolio vi phạm',
  'portfolio.restore': 'Khôi phục portfolio bị gỡ',

  // ── Recruiter board (p6-08; be/src/modules/recruiter) ───────────────────
  'company.register': 'Đăng ký doanh nghiệp tuyển dụng',
  'company.update': 'Sửa hồ sơ doanh nghiệp',
  'company.resubmit': 'Gửi duyệt lại doanh nghiệp',
  'company.approve': 'Duyệt doanh nghiệp',
  'company.reject': 'Từ chối doanh nghiệp',
  'company.suspend': 'Tạm ngưng doanh nghiệp',
  'company.reinstate': 'Khôi phục doanh nghiệp bị tạm ngưng',
  'company.admin-update': 'Vận hành đổi gói / hạn mức / thông tin doanh nghiệp',
  'company.member-add': 'Thêm nhân sự doanh nghiệp',
  'company.member-remove': 'Gỡ nhân sự doanh nghiệp',
  'talent.profile-view': 'Doanh nghiệp xem hồ sơ ứng viên',
  'job-offer.withdraw': 'Doanh nghiệp thu hồi lời mời',
  // be/src/modules/recruiter/services/offer-moderation.service.ts — kiểm duyệt lời mời bị báo cáo (vận hành CHỈ xem khi có ≥ 1 báo cáo, mỗi lần xem ghi audit).
  'job-offer.view-reported': 'Xem lời mời việc làm bị báo cáo',
  'job-offer.admin-withdraw': 'Quản trị thu hồi lời mời vi phạm',
};

/**
 * Tên action theo TÀI LIỆU KẾ HOẠCH nhưng BE ghi tên khác (BE là nguồn thật). Chỉ giữ
 * để nhãn không rơi về mã thô nếu ai đó ghi theo tên kế hoạch; KHÔNG đưa vào danh
 * sách lọc (chọn lọc theo tên này sẽ không ra dòng nào).
 */
const AUDIT_ACTION_ALIASES: Readonly<Record<string, string>> = {
  'user.role-change': 'user.change-role',
  'system.outbox-requeue': 'system.job-outbox-requeue',
  'system.push-test': 'push.test',
};

/** Nhãn của `action`; chưa có nhãn → chính mã (không bao giờ trả rỗng). */
export function auditActionLabel(action: string): string {
  const canonical = AUDIT_ACTION_ALIASES[action];
  return (
    AUDIT_ACTION_LABELS[action] ??
    (canonical ? AUDIT_ACTION_LABELS[canonical] : undefined) ??
    action
  );
}

/** Mọi action đã biết, sắp theo nhãn — nguồn cho ô lọc nhiều lựa chọn. */
export const AUDIT_ACTION_OPTIONS: ReadonlyArray<{ value: string; label: string }> = Object.entries(
  AUDIT_ACTION_LABELS,
)
  .map(([value, label]) => ({ value, label }))
  .sort((a, b) => a.label.localeCompare(b.label, 'vi'));

/** `targetType` → nhãn. Khoá viết đúng như BE ghi (PascalCase). */
export const AUDIT_TARGET_TYPE_LABELS: Readonly<Record<string, string>> = {
  User: 'Người dùng',
  Workspace: 'Workspace',
  WorkspaceMembership: 'Thành viên workspace',
  Channel: 'Kênh',
  Message: 'Tin nhắn',
  Report: 'Báo cáo',
  InviteLink: 'Liên kết mời',
  SystemConfig: 'Cấu hình hệ thống',
  QueueJob: 'Job',
  OutboxEvent: 'Sự kiện outbox',
  WorkspaceInvitation: 'Lời mời email',
  TaskComment: 'Bình luận thẻ công việc',
  TaskReview: 'Lượt chấm chéo của một người',
  TaskReviewRound: 'Lượt chấm chéo của thẻ',
  Board: 'Bảng công việc',
  StudySet: 'Bộ học',
  MentorPost: 'Bài tìm cố vấn',
  MentorEngagement: 'Đợt cố vấn',
  Company: 'Doanh nghiệp',
  JobOffer: 'Lời mời việc làm',
  LiveQuizSession: 'Phiên Live Quiz',
  WorkspaceTemplate: 'Mẫu nhóm',
  Meeting: 'Cuộc họp',
  Call: 'Cuộc gọi',
  MeetingRecap: 'Biên bản họp',
  MeetingRecording: 'Bản ghi hình cuộc họp',
  Integration: 'Kết nối tích hợp',
  UserIntegration: 'Kết nối cá nhân (lịch)',
  WebhookEvent: 'Sự kiện webhook',
  IntegrationProvider: 'Nhà cung cấp tích hợp',
  SkillDefinition: 'Kỹ năng',
  UserSkillBadge: 'Huy hiệu kỹ năng của người dùng',
  Document: 'Tài liệu',
  Whiteboard: 'Bảng trắng',
  CoinWallet: 'Ví xu',
  ShopItem: 'Vật phẩm cửa hàng',
  BurnoutRules: 'Bộ luật theo dõi sức khoẻ học tập',
  CollabService: 'Dịch vụ soạn thảo cộng tác',
  Portfolio: 'Portfolio',
  Location: 'Địa điểm',
  LocationReview: 'Đánh giá địa điểm',
  PrintShop: 'Tiệm in',
  PrintOrder: 'Đơn in',
  // p7-02: BE ghi `targetType` `CoinRule` (theo `sourceType`) và `CoinQuest` cho hai hành động luật/nhiệm vụ (`CoinWallet`, `ShopItem` đã có ở trên).
  CoinRule: 'Quy tắc thưởng xu',
  CoinQuest: 'Nhiệm vụ ngày',
};

/**
 * Nhãn của `targetType`. So khớp KHÔNG phân biệt hoa/thường vì BE có chỗ ghi lệch
 * (`user.biometric-revoke` ghi `"user"` thay vì `"User"`); chưa biết → chính mã.
 */
export function auditTargetTypeLabel(targetType: string): string {
  if (AUDIT_TARGET_TYPE_LABELS[targetType]) return AUDIT_TARGET_TYPE_LABELS[targetType];
  const lower = targetType.toLowerCase();
  const hit = Object.keys(AUDIT_TARGET_TYPE_LABELS).find((k) => k.toLowerCase() === lower);
  return hit ? AUDIT_TARGET_TYPE_LABELS[hit] : targetType;
}

/** Mọi `targetType` đã biết — nguồn cho ô lọc loại đối tượng. */
export const AUDIT_TARGET_TYPE_OPTIONS: ReadonlyArray<{ value: string; label: string }> =
  Object.entries(AUDIT_TARGET_TYPE_LABELS).map(([value, label]) => ({ value, label }));
