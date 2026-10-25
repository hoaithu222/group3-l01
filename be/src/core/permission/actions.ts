/**
 * Danh mục hành động ("<scope>.<verb>") theo scope — khai sẵn tên cho module
 * Phase 1–2 (be.md §3). `core/permission` chỉ định nghĩa CHUỖI HẰNG, không
 * biết action nào gắn với vai trò nào — đó là việc của `ScopeResolver` từng
 * module (p1-02/p1-03/p1-05/p2-01/p2-04).
 */
export const ACTIONS = {
  WORKSPACE: [
    "workspace.read",
    "workspace.update",
    "workspace.archive",
    "workspace.transfer",
    "workspace.member.list",
    "workspace.member.invite",
    "workspace.member.remove",
    "workspace.member.ban",
    "workspace.member.role",
    "workspace.channel.create",
    "workspace.conversation.create",
    "workspace.meeting.create",
    // ── Phase 3 (foundation) — ma trận vai → action nằm ở `workspaces/services/workspace-permission.resolver.ts`.
    // p3-01 Resource Hub (permissionKey P7: RESOURCE_VIEW / RESOURCE_UPLOAD / RESOURCE_DELETE / FOLDER_MANAGE).
    // `resource.delete` = thao tác lên tệp/thư mục CỦA NGƯỜI KHÁC, xoá thư mục có nội dung, khôi phục của người khác,
    // xoá vĩnh viễn ngay; thao tác lên tệp/thư mục CỦA MÌNH chỉ cần `folder.manage`/`resource.upload` + kiểm sở hữu ở service.
    "workspace.resource.read",
    "workspace.resource.upload",
    "workspace.resource.delete",
    "workspace.folder.manage",
    // p3-02/p3-03 Projects (BOARD_VIEW / BOARD_EDIT / TASK_CREATE / TASK_UPDATE_STATUS / TASK_DELETE …).
    // `board.create` (OWNER/ADMIN) cần ở WORKSPACE vì chưa có board; `board.edit` = sửa tên/cột/lưu trữ/xoá nhãn đang dùng.
    // `task.update` = sửa mọi trường/checklist/đính kèm/nhãn (MEMBER+); `task.status` = kéo thẻ/đổi cột;
    // `task.delete` = xoá thẻ/bình luận/đính kèm CỦA NGƯỜI KHÁC + khôi phục thẻ người khác; `task.comment` = bình luận.
    "workspace.board.read",
    "workspace.board.create",
    "workspace.board.edit",
    "workspace.task.create",
    "workspace.task.update",
    "workspace.task.status",
    "workspace.task.delete",
    "workspace.task.comment",
    // p3-04 khách/duyệt/@role: mời + gia hạn + thu hồi khách; duyệt/từ chối yêu cầu tham gia; đặt joinPolicy/guestPolicy
    // (chỉ OWNER); `mention.role` (`@Quản trị viên`, `@Thành viên` — P1).
    "workspace.guest.manage",
    "workspace.join-request.decide",
    "workspace.policy.update",
    "workspace.mention.role",
  ],
  CHANNEL: [
    "channel.read",
    "channel.join",
    "channel.message.send",
    "channel.message.react",
    "channel.message.pin",
    "channel.message.moderate",
    "channel.manage",
    "channel.grant.manage",
    "channel.call.join",
    "channel.call.host",
  ],
  CONVERSATION: [
    "conversation.read",
    "conversation.message.send",
    "conversation.message.pin",
    "conversation.update",
    "conversation.member.add",
    "conversation.member.remove",
    "conversation.member.role",
    "conversation.transfer",
    "conversation.leave",
    "conversation.dissolve",
    "conversation.call.start",
  ],
  MEETING: [
    "meeting.read",
    "meeting.join",
    "meeting.edit",
    "meeting.cancel",
    "meeting.delete",
    "meeting.start",
    "meeting.end",
    "meeting.invite",
    "meeting.attendee.remove",
    "meeting.lobby.admit",
    "meeting.record",
    "meeting.recap.edit",
    "meeting.recap.publish",
    "meeting.recording.view",
    "meeting.recording.delete",
    // p2-04 — xem chi tiết (agenda/link/danh sách người) tách khỏi `meeting.read` (metadata); RSVP; cấp/thu CO_HOST + chuyển chủ trì.
    "meeting.detail.read",
    "meeting.rsvp",
    "meeting.role.manage",
  ],
  CALL: [
    "call.join",
    "call.leave",
    "call.invite",
    "call.end",
    "call.host.mute",
    "call.host.remove",
    "call.host.lock",
    "call.host.transfer",
    "call.screen.share",
  ],
  // p6-01 Real-time Docs — ma trận vai → action nằm ở `documents/services/document-access.resolver.ts` (uỷ quyền `resolveCollabResourceAccess`, `shared/collab`).
  // `edit` = sửa nội dung (qua collab), `manage` = đổi tên/visibility/mời người/lưu trữ, `snapshot` = tạo bản lưu thủ công, `restore` = khôi phục bản lưu.
  DOCUMENT: ["document.read", "document.edit", "document.manage", "document.snapshot", "document.restore"],
  // p6-02 Whiteboard — cùng ma trận vai với DOCUMENT (`resolveCollabAbilities`, `shared/collab`), resolver ở `whiteboards/services/whiteboard-access.resolver.ts`.
  // `edit` = vẽ/sửa nội dung (qua collab) và đổi ảnh thu nhỏ; `manage` = đổi tên/visibility/mời người/lưu trữ; `snapshot`/`restore` như tài liệu.
  WHITEBOARD: ["whiteboard.read", "whiteboard.edit", "whiteboard.manage", "whiteboard.snapshot", "whiteboard.restore"],
  // p6-08 Recruiter board — scope `COMPANY` (resolver ở `modules/recruiter/services/company-scope.resolver.ts`). `view` = mọi nhân sự ACTIVE (kể cả công ty PENDING/REJECTED/SUSPENDED);
  // `manage` = OWNER (sửa hồ sơ, gửi duyệt lại, quản lý nhân sự); `talent` (tìm/xem ứng viên) và `offer` (gửi/thu hồi lời mời, nhắn) CHỈ khi công ty APPROVED.
  COMPANY: ["company.view", "company.manage", "company.talent", "company.offer"],
} as const;

export type Action = (typeof ACTIONS)[keyof typeof ACTIONS][number];

/**
 * Action mà GUEST không được biết là có tồn tại: `PermissionService.assert` trả 404 trung tính (`PERM_404`)
 * thay vì 403 khi `access.role === "GUEST"` (p3-04 README §2/§6 "GUEST 404 với board/tài liệu"; Phase 3 README §9).
 * Gồm action Phase 3 và (p3-04b) danh bạ `workspace.member.list`, `workspace.channel.create`,
 * `workspace.conversation.create`, `workspace.member.invite`, `workspace.meeting.create` — khách không được biết các chức
 * năng đó tồn tại.
 */
export const GUEST_HIDDEN_ACTIONS: ReadonlySet<Action> = new Set<Action>([
  "workspace.resource.read",
  "workspace.resource.upload",
  "workspace.resource.delete",
  "workspace.folder.manage",
  "workspace.board.read",
  "workspace.board.create",
  "workspace.board.edit",
  "workspace.task.create",
  "workspace.task.update",
  "workspace.task.status",
  "workspace.task.delete",
  "workspace.task.comment",
  // p3-04b — danh bạ thành viên, tạo kênh/nhóm chat/họp, mời người: 404 trung tính với khách.
  "workspace.member.list",
  "workspace.member.invite",
  "workspace.channel.create",
  "workspace.conversation.create",
  "workspace.meeting.create",
]);
