/**
 * Side-effect import — mỗi module job gọi `registerJob(queue, name, fn)` khi
 * được import. Tập trung ở đây để `server.ts` (PROCESS_ROLE=all/worker) và
 * `src/worker.ts` (PROCESS_ROLE=worker riêng biệt) dùng chung một danh sách,
 * không lặp lại import ở 2 nơi.
 *
 * NOTE: các import bên dưới được thêm dần theo từng module có job thật
 * (B11 assets, B13 notifications, p0-04 outbox/delayed-jobs/mail) —
 * placeholder rỗng ban đầu vẫn phải là async function hợp lệ để
 * `server.ts`/`worker.ts` gọi được ngay từ B10.
 */
export async function registerAllJobs(): Promise<void> {
  // Infra (p0-04) — side-effect: registerJob/defineCron. File "*.jobs.ts"
  // riêng (KHÔNG export qua barrel `infrastructure/queue`/`infrastructure/mail`)
  // để import barrel ở nơi khác (health check, metrics, service dùng enqueue)
  // không vô tình đăng ký processor trước registerAllJobs().
  await import("./outbox/outbox.jobs");
  await import("./outbox/outbox.cleanup");
  await import("./delayed-jobs.jobs");
  await import("../mail/mail.jobs");

  await import("../../modules/assets/jobs/asset.jobs");
  await import("../../modules/notifications/jobs/notification.jobs");
  await import("../../modules/notifications/jobs/push.jobs");
  // p1-07 — fan-out tin nhắn, push gộp cửa sổ, đánh dấu hộp thư theo luồng, retention hộp thư.
  await import("../../modules/notifications/jobs/fanout-message.job");
  await import("../../modules/notifications/jobs/message-push.jobs");
  await import("../../modules/notifications/jobs/mark-read-by-stream.job");
  await import("../../modules/notifications/jobs/inbox-retention.job");
  // p3-04 — fan-out `@role` (MENTION_ROLE) của tin trong kênh.
  await import("../../modules/mentions/jobs/role-mention-fanout.job");
  await import("../../modules/auth/jobs/biometric.jobs");
  await import("../../modules/users/jobs/user.jobs");
  await import("../../modules/presence/presence.jobs");
  await import("../../modules/system-config/jobs/config-changed.handler");
  await import("../../modules/workspaces/jobs/workspace-events.consumer");
  await import("../../modules/workspaces/jobs/workspace-stats.jobs");
  await import("../../modules/members/jobs/membership-revoked.consumer");
  await import("../../modules/members/jobs/invites-expire.job");
  // p3-04 — hết hạn khách (job hẹn giờ qua outbox + cron quét bù tĩnh + thông báo trước hạn) và email lời mời đích danh.
  await import("../../modules/members/jobs/guest-expiry.jobs");
  await import("../../modules/members/jobs/invitation-mail.consumer");
  await import("../../modules/channels/jobs/channel-events.consumer");
  await import("../../modules/channels/jobs/membership-revoked.consumer");
  await import("../../modules/channels/jobs/channel-role-access.consumer");
  await import("../../modules/channels/jobs/channel-orphan-check.job");
  await import("../../modules/channels/jobs/default-channel-backfill.job");
  await import("../../modules/messages/events/message.outbox-handlers");
  await import("../../modules/messages/jobs/messages-reactions-rebuild.job");
  await import("../../modules/conversations/events/conversation.outbox-handlers");
  await import("../../modules/conversations/jobs/workspace-member-removed.job");
  await import("../../modules/conversations/jobs/workspace-status.job");
  await import("../../modules/conversations/jobs/counters-rebuild.job");
  await import("../../modules/threads/jobs/threads-counters-rebuild.job");
  await import("../../modules/wallet/jobs/wallet-events.consumer");
  await import("../../modules/wallet/jobs/wallet-remind-tick.job");
  await import("../../modules/wallet/jobs/wallet-settlement-stale.job");
  await import("../../modules/wallet/jobs/wallet-balance-rebuild.job");
  // p3-02 — nén khoá vị trí cột Kanban; nhận outbox `task.*` (fan-out qua sink).
  await import("../../modules/projects/jobs/board-rebalance-column.job");
  await import("../../modules/projects/jobs/task-events.consumer");
  // p3-03 — sink `task.events` (thông báo giao việc/bình luận/nhắc tên) + job hẹn giờ `task.due-reminder`.
  await import("../../modules/projects/jobs/task-notification.consumer");
  await import("../../modules/projects/jobs/task-due-reminder.job");
  await import("../../modules/projects/jobs/dependency-counts.job");
  // p4-04 — dời lịch theo phụ thuộc: sink thông báo (`task.rescheduled`/`task.reschedule-bulk.completed`), job nền lô dời lịch
  // (`reports/task.reschedule-bulk`), cron TĨNH `dependency-counts.rebuild` (02:30).
  await import("../../modules/projects/jobs/reschedule-notification.consumer");
  await import("../../modules/projects/jobs/task-reschedule-bulk.job");
  await import("../../modules/projects/jobs/dependency-counts-rebuild.job");
  // p4-05 — chấm chéo: `notifications/review.events` (thông báo REVIEW_* + hẹn nhắc + realtime) và `review.reminder` (hẹn giờ theo review),
  // `reports/review.backfill` (bật/tắt chấm chéo), sink `p4-05.review` của `task.events`, `reports/review.membership`, cron TĨNH `review.reconcile`.
  await import("../../modules/projects/jobs/review-events.consumer");
  await import("../../modules/projects/jobs/review-backfill.job");
  await import("../../modules/projects/jobs/review-reconcile.job");
  // p5-04 — xác nhận đã đọc thông báo kênh: `announcement.notify` (outbox → fan-out `announcement.required`), `announcement.deadline-remind` (outbox `availableAt`).
  await import("../../modules/announcements/jobs/announcement.jobs");
  // p7-04 — mở rộng chat: `poll.close|emit|message-deleted`, `scheduled-message.send`, `message.reminder`, `chat-extensions.on-user-anonymized` (queue `notifications`), cron TĨNH `chat-extensions.sweep` (5 phút, queue `cron`); đăng ký cổng đọc khảo sát + loại thông báo.
  await import("../../modules/chat-extensions/jobs/chat-extensions.jobs");
  // p1-09 — `discovery.user-anonymized` (queue `reports`): xoá tin đã lưu của tài khoản đã ẩn danh hoá.
  await import("../../modules/discovery/jobs/saved-user-anonymized.consumer");
  await import("../../modules/moderation/jobs/report-events.consumer");
  await import("../../modules/moderation/jobs/moderation-notify.consumer");
  // p1-08 — cron TĨNH `reports.stale-reminder` (09:00 hằng ngày): nhắc nhóm báo cáo OPEN > 72 giờ (người xử lý phạm vi + quản trị nền tảng).
  await import("../../modules/moderation/jobs/stale-report-reminder.job");
  await import("../../modules/blocks/blocks.jobs");
  // p3-01 — kho tài liệu: outbox `resource.*`/`folder.*` → socket `resource:changed`; cron dọn thùng rác quá hạn.
  await import("../../modules/resources/jobs/resource-events.consumer");
  await import("../../modules/resources/jobs/resources-purge.job");
  // p4-01 — bộ học: đăng ký đích báo cáo `STUDY_SET` (đặt `reportedCount` khi `report.events` xử lý báo cáo mới) ở worker.
  await import("../../modules/study/jobs/study-report.consumer");
  // p4-02 — thi thử + ôn tập: `mock-attempt.expire` (nộp hộ khi hết giờ), cron `sr.daily-reminder` (tick TĨNH mỗi giờ),
  // `sr.item-deleted` (dọn tiến độ mục đã xoá), `study.user-anonymized` (queue `cron`).
  await import("../../modules/study/jobs/mock-attempt-expire.job");
  await import("../../modules/study/jobs/sr-daily-reminder.job");
  await import("../../modules/study/jobs/sr-item-deleted.job");
  await import("../../modules/study/jobs/study-user-anonymized.consumer");
  // p4-03 — XP/cấp độ/huy hiệu: `gamification/xp.consume` (quiz.scored, sr.reviewed, review.submitted, study-set.published), sink `p4-03.xp` của
  // `task.completed` (queue `notifications`/`task.events` → xếp `xp.consume`), `xp.awarded` (rỗng, chờ p7-02), `notifications/gamification.level-up`,
  // `badge.backfill`, cron `streak.check` (tick TĨNH mỗi giờ), `gamification.user-anonymized`.
  await import("../../modules/gamification/jobs/gamification.jobs");
  // p7-02 — kinh tế ảo Coins: `gamification/xp.awarded` THAY processor rỗng của dòng trên (`registerJob` là `Map.set` — file này PHẢI nạp SAU gamification.jobs) → thưởng xu + tiến độ nhiệm vụ ngày,
  // idempotent theo `XpEvent.dedupeKey`; cron TĨNH `economy.reconcile` (02:30, chỉ đọc + cảnh báo lệch ví ↔ sổ cái).
  await import("../../modules/coins/jobs/coins.jobs");
  // p7-03 — burnout radar (sức khoẻ học tập, OPT-IN, riêng tư): sink `p7-03.burnout` của `task.events` (+1 sự kiện cho người đã bật), cron TĨNH `wellbeing.evaluate` (mỗi giờ phút 20 — tổng hợp + chấm điểm + cảnh báo
  // cho người có giờ địa phương 05:xx) + `wellbeing.retention` (03:00, dọn > 90 ngày), `gamification/wellbeing.purge` (outbox lúc TẮT theo dõi) + `wellbeing.user-anonymized`; đăng ký loại thông báo `wellbeing.alert`.
  await import("../../modules/burnout/jobs/burnout.jobs");
  // p4-06 — báo cáo đóng góp & heatmap: sink `p4-06.contribution` của `task.events` (→ `reports/contribution.task-fact`), `contribution.review-fact`, `contribution.recompute`,
  // `contribution.export` (PDF), cron TĨNH `activity.aggregate` (15 phút), `activity.reconcile` (01:30), `contribution.reconcile` (02:15), `contribution.timezone-sync` (02:45), `contribution-export.cleanup` (03:30).
  await import("../../modules/contribution/jobs/contribution.jobs");
  // p6-06 — huy hiệu kỹ năng: sink `p6-06.skills` của `task.events` (→ `gamification/skill.progress`), `skill.events` (socket + sink p6-07/p6-08),
  // `skill.reevaluate-skill|reevaluate-all`, cron TĨNH `skill.reconcile` (02:30), `career.user-anonymized`.
  await import("../../modules/career/jobs/career.jobs");
  // p6-07 — portfolio: `reports/portfolio.build` (dựng trang HTML tĩnh, idempotent theo build), `reports/portfolio.purge-build` (dọn object trễ 10 phút), `reports/portfolio.events`
  // (`portfolio.published|unpublished` → sink p6-08), sink `p6-07.portfolio` của `skill.events` (→ `gamification/portfolio.on-skill-revoked`), `notifications/portfolio.on-user-anonymized`,
  // cron TĨNH `portfolio.slug-reservation-cleanup` (03:10) + `portfolio.stale-build-reaper` (10 phút); đăng ký loại thông báo `portfolio.*` và đích báo cáo `PORTFOLIO`.
  await import("../../modules/portfolio/jobs/portfolio.jobs");
  // p0-08 — webhook LiveKit: job `livekit.event` (queue `calls`) + handler `spike`; cron `webhook.sweep`/`webhook.prune`
  // và `media.rooms-snapshot` (gauge `livekit_rooms_active`, chỉ chạy khi voice/meeting bật).
  await import("../../modules/webhooks/jobs/livekit-event.job");
  await import("../../modules/webhooks/jobs/webhook-maintenance.jobs");
  await import("../../modules/media-admin/media-rooms-snapshot.job");
  // p0-08/p0-11 — cron TĨNH `media.turn-probe` (5 phút): thăm dò TURN (STUN UDP + TLS) → Redis `media:turn-probe:last` (admin health) + gauge `turn_probe_*`. Thiếu `TURN_PROBE_HOST` = không làm gì.
  await import("../../modules/media-admin/media-turn-probe.job");
  // p2-01 — lõi cuộc gọi: `call.signal-dispatch`/`ring-timeout`/`reconcile`/`summary`/`revocation` (queue `calls`), cron
  // `call.recovery`, handler webhook LiveKit tiền tố `call_`, loại thông báo cuộc gọi, listener thu hồi quyền.
  await import("../../modules/calls/jobs/call.jobs");
  // p2-03 — `call.channel-video-disabled`: kênh VOICE tắt video (`PATCH /channels/:id`) → thu quyền camera của phòng đang chạy.
  await import("../../modules/calls/jobs/call-channel-video.job");
  // p2-04 — lịch họp: `meeting.events` (outbox), `meeting.reminder` (delayed), `meeting.ics-send`, `meeting.conversation-sync`,
  // `meeting.lifecycle` (queue `notifications`), cron `meeting.reminder-reconcile`, loại thông báo, listener thu hồi quyền.
  await import("../../modules/meetings/jobs/meeting.jobs");
  // p2-07 — vận hành gọi & họp (admin): sink `p2-07.admin-media` của `meeting.events` + `call.signal-dispatch` → socket `admin:media-updated` (room `admin:media`).
  // Consumer `meeting.force-end` (meetings) và `call.force-end` (calls) nằm trong `meeting-room.jobs`/`call-admin.outbox-handlers` (đã nạp qua hai dòng trên/dưới).
  await import("../../modules/admin-media-ops/jobs/admin-media.jobs");
  // p5-01 — live quiz: consumer outbox `live-quiz.persist` (queue `reports`) lưu `LiveQuizResult` bền, idempotent; cron TĨNH
  // `live-quiz.expire-stale`; job một lần `quiz.question-deadline` (`scheduleAt`, jobId không chứa `:`).
  await import("../../modules/live-quiz/jobs/persist-results.job");
  await import("../../modules/live-quiz/jobs/expire-stale.job");
  await import("../../modules/live-quiz/jobs/question-deadline.job");
  // p5-01 đợt 3 — `quiz.auto-advance` (sau reveal khi `autoAdvance`) + `quiz.host-timeout` (socket cuối của host rời room); cả hai
  // `scheduleAt` jobId không chứa `:`, processor tự kiểm trạng thái (idempotent). `quiz.scored` → `gamification/xp.consume` (đã nạp ở trên).
  await import("../../modules/live-quiz/jobs/auto-advance.job");
  await import("../../modules/live-quiz/jobs/host-timeout.job");
  // p5-02 — phòng Pomodoro: `pomodoro.deadline|empty-room|media-sync|host-sync` (queue `calls`, delayed job qua outbox `delayMs`, CAS theo version),
  // cron TĨNH `pomodoro.reconcile` (mỗi phút, queue `cron`), handler webhook LiveKit phòng `call_*` (hiện diện + phòng rỗng). ⛔ Không phát socket từ đây.
  await import("../../modules/pomodoro/jobs/pomodoro.jobs");
  // p6-03 — Mentor Connect: `mentor.accepted-effects` / `mentor.ended-effects` (outbox, queue `notifications`), cron TĨNH `mentor.expire` (15 phút),
  // `mentor.ending-soon` + `mentor.post-expire` (mỗi giờ); đăng ký loại thông báo `mentor.*`, đích báo cáo `MENTOR_POST`, listener thu hồi quyền.
  await import("../../modules/mentor/jobs/mentor.jobs");
  // p5-03 — tích hợp: `integrations.webhook-process` (outbox → tin hệ thống INTEGRATION), `integration.token-refresh`, `calendar.sync-meeting` (sink
  // `p5-03.calendar` của `meeting.events`), `calendar.cleanup-user`, `integrations.target-recheck` (listener thu hồi quyền); cron TĨNH
  // `integrations.events-retention` (03:00) + `integrations.health-check` (mỗi giờ).
  await import("../../modules/integrations/jobs/integrations.jobs");
  // p6-05 — in ấn O2O: `media/print.count-pages` (outbox tạo đơn → đếm trang PDF + báo giá), `notifications/print-order.events` (outbox
  // chuyển trạng thái → socket `print-order:updated`/`partner:order`), cron TĨNH `print.order-expire` (15 phút); loại thông báo `print-order.*`.
  await import("../../modules/o2o/jobs/o2o.jobs");
  // p6-01 — Real-time Docs: `notifications/document.events` (outbox → socket `document:updated`), `reports/document.plaintext` (outbox trễ 5 s → văn bản phẳng),
  // `notifications/document.access-revoked` (đóng kết nối collab), cron TĨNH `collab.snapshot-hourly` (phút 7, dùng chung với bảng trắng); resolver DOCUMENT + loại thông báo + listener thu hồi quyền.
  await import("../../modules/documents/jobs/document.jobs");
  // p6-02 — Whiteboard: `notifications/whiteboard.events` (outbox → socket `whiteboard:updated`), `notifications/whiteboard.access-revoked` (đóng kết nối collab), runner `whiteboard` của cron
  // `collab.snapshot-hourly` (dùng chung với tài liệu); resolver WHITEBOARD + listener thu hồi quyền.
  await import("../../modules/whiteboards/jobs/whiteboard.jobs");
  // p6-08 — Recruiter board: `notifications/job-offer.events` (socket `offer:updated`), `notifications/company.status-notify` (socket `company:updated` + thông báo OWNER/vận hành), `reports/talent.index-rebuild`
  // (dựng lại `TalentSearchIndex`, có debounce), `reports/job-offer.expire` (hẹn giờ tại `expiresAt`), `notifications/recruiter.on-user-anonymized`, cron TĨNH `job-offer.expire-sweep` (01:00) +
  // `talent.reconcile` (02:45); sink `p6-08.recruiter` của `skill.events`/`portfolio.events`; đăng ký loại thông báo, resolver COMPANY, provider quyền `company`, đích báo cáo COMPANY/JOB_OFFER.
  await import("../../modules/recruiter/jobs/recruiter.jobs");
  // p0-03 — cron TĨNH `ops.stats-broadcast` (30 giây): phát `ops:stats` tới room `admin:ops` CHỈ khi có admin đang xem (khoá Redis `ops:stats:watch`).
  await import("../../modules/admin-overview/jobs/ops-stats.job");
  // p4-07 — Lộ trình học: cron TĨNH `roadmap.remind-today` (07:30 hằng ngày, retry 3) nhắc buổi bắt buộc đến hạn/trễ chưa xong (RM-15 P1);
  // XP (RM-14) đi qua `gamification/xp.consume` đã nạp ở dòng p4-03 (producer ghi thẳng outbox từ `LessonService.putProgress`, không có job riêng ở đây).
  await import("../../modules/roadmap/jobs/roadmap.jobs");
  // p7-05 — Quét trùng lặp nội bộ: `media/plagiarism.fingerprint` (lập chỉ mục 1 Resource) + `media/plagiarism.fingerprint-purge`
  // (resource.purged), `reports/plagiarism.scan` (chạy 1 lượt quét), `media/plagiarism.reindex` (việc nặng của admin reindex),
  // cron TĨNH `plagiarism.scans-expire` (04:10 hằng ngày) + `plagiarism.resource-events-poll` (mỗi 60 giây — đọc thẳng
  // `OutboxEvent` theo `type` thay vì đăng ký processor thứ hai cho `notifications/resource.events`, xem
  // `listeners/resource-events.listener.ts`). Cần `db push` model DocumentFingerprint/PlagiarismScan/PlagiarismResult/PlagiarismSection.
  await import("../../modules/plagiarism/jobs/plagiarism-fingerprint.job");
  await import("../../modules/plagiarism/jobs/plagiarism-fingerprint-purge.job");
  await import("../../modules/plagiarism/jobs/plagiarism-scan.job");
  await import("../../modules/plagiarism/jobs/plagiarism-reindex.job");
  await import("../../modules/plagiarism/jobs/plagiarism-scans-expire.job");
  await import("../../modules/plagiarism/jobs/plagiarism-resource-events-poll.job");
}
