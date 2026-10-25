# Cây thư mục — Super App Backend (be)

> Phase 0 hoàn thành: `auth`, `users` (mở rộng RBAC), `audit-log`, `capabilities`,
> `assets`, `notifications` (lõi). Khi thêm module mới, giữ đúng pattern trong
> `.claude/rules/architecture.md` và cập nhật file này.

```text
./
├── src/
│   ├── core/                       # Utilities dùng chung, KHÔNG business logic
│   │   ├── config/                 # env.schema.ts (Zod), validate-runtime.ts, runtime-config.ts (p0-07 RuntimeConfigService),
│   │   │                            # system-config.registry.ts (SYSTEM_CONFIG_REGISTRY), index.ts
│   │   │                            # workspace-timezone.ts (múi giờ hiệu lực của một nhóm: Workspace.timezone → pm.timezone → CRON_TZ → Asia/Ho_Chi_Minh; hàm thuần)
│   │   ├── constants/               # http-status, roles, permissions (RBAC), limits, modules (feature flags)
│   │   ├── exceptions/              # AppError hierarchy (+ VersionConflict/Idempotency/ScopeRateLimit/AccountLocked)
│   │   ├── middlewares/             # auth (+ requirePermission/requireSelfOrPermission), validate, errorHandler,
│   │   │                            # rateLimiter, scope-limiter, idempotency, upload, sanitize,
│   │   │                            # feature.ts (p0-07 requireFeature/requireSystemConfig)
│   │   ├── permission/              # user-status.ts — cache Redis trạng thái tài khoản (60s) cho authenticateToken;
│   │   │                            # conversation-hooks.port.ts (p1-05, ConversationHooks registry), shares-workspace.ts
│   │   │                            # (sharesActiveWorkspace, cache Redis shares:{a}:{b} 60s); message-hooks.port.ts
│   │   │                            # (p1-06, IMentionValidator/IThreadHook registry — message.service.ts gọi qua đây)
│   │   ├── types/                   # Express type augmentations (AuthUser.permissions)
│   │   └── utils/                   # catchAsync, response (+ cursor), jwt, error.codes, normalize, size, cursor (+ cursor chỉ số), escape-regex, search-query (p5-04: tokenize/neo đầu từ/cửa sổ thời gian/Extended JSON dùng chung)
│   ├── infrastructure/              # Tích hợp bên ngoài
│   │   ├── database/                 # Prisma client singleton (MongoDB Atlas)
│   │   ├── logger/                   # Winston: logger.ts (đầu ra theo logger-config.ts: LOG_STDOUT/LOG_FORMAT/LOG_TO_FILE), redact.ts (che khoá nhạy cảm),
│   │   │                              # request-context-format.ts (p0-11: tự gắn requestId/userId từ AsyncLocalStorage), log-throttle.ts
│   │   ├── error-tracker/            # IErrorTracker + ConsoleTracker mặc định; SentryTracker (observability/) thay thế khi có SENTRY_DSN
│   │   ├── observability/            # (p0-11) sentry.ts (initSentry — thiếu DSN = no-op, require lười @sentry/node; SentryTracker; flushObservability),
│   │   │                              # scrub.ts (chốt che dữ liệu nhạy cảm cho beforeSend), instrument.ts (import ĐẦU TIÊN của server/worker), drain.ts (cờ SIGTERM)
│   │   ├── mail/                     # Nodemailer
│   │   ├── queue/                    # BullMQ: queue.client, queues, worker (registry), register-jobs, index
│   │   ├── redis/
│   │   ├── socket/                   # Socket.IO: room guard (registerRoomGuard/resolveJoinable), events, server,
│   │   │                              # registry (Redis conn:{userId}), emit (v/serverNow), ratelimit (token bucket), ack
│   │   │                              # (p0-03) CẦU NỐI worker → socket: socket.bridge (vòng đời init/closeSocketBridge ở worker.ts) + .client (bọc @socket.io/redis-emitter) + .types,
│   │   │                              # socket.transport (resolveTransport: Server ở API, cầu nối ở worker), socket.bridge.listener (API nhận
│   │   │                              # lệnh emitToScope({recheck}) từ worker) — socket.emit/sessions chạy được ở CẢ API lẫn worker, KHÔNG tự getIO()
│   │   │   └── handlers/             # room/auth/presence/typing — room:join/leave, auth:refresh, presence:*, typing:*
│   │   │                              # socket.viewing.ts (p1-07): khoá Redis viewing:<u>:<scopeKey> (TTL 70 s) — đang xem conv:/ch:/thread ở foreground
│   │   │                              # socket.ops-watch.ts (p0-03): khoá Redis ops:stats:watch (TTL 75 s) — có admin trong room admin:ops; cron admin-overview/jobs/ops-stats.job phát ops:stats mỗi 30 s CHỈ khi có người xem
│   │   ├── metrics/                   # prom-client: metrics.client (registry+metrics), metrics.middleware (http duration),
│   │   │                              # metrics.route (GET /metrics, token ngoài localhost; nạp lại livekit_rooms_active từ Redis),
│   │   │                              # (p0-11) worker-metrics-server (cổng riêng worker:9464 — Bearer METRICS_TOKEN, /health/live), turn.metrics (turn_probe_*)
│   │   ├── media/                     # (p0-08) Máy chủ media LiveKit — DUY NHẤT nơi import `livekit-server-sdk`:
│   │   │                              # media.types (cổng IMediaServer = IRoomService + IEgressClient, kiểu JSON thuần), livekit.client
│   │   │                              # (LiveKitMediaServer thật + getLiveKit()/setMediaServerForTests), noop-media-server (chưa cấu hình →
│   │   │                              # MEDIA_001), in-memory-media-server (giả cho test p2-*), livekit.token (issueMediaToken/publishSourcesOf),
│   │   │                              # room-names (call_/meet_/spike_), livekit.webhook (verify + chuẩn hoá), livekit.handlers
│   │   │                              # (registerLiveKitHandler/dispatchLiveKitEvent), livekit.health, rooms-snapshot, livekit.mappers/config,
│   │   │                              # turn-probe (p0-11: STUN Binding UDP + bắt tay TLS/chứng chỉ TURN — cron media.turn-probe)
│   │   │                              # tests/ (+ integration/health-route)
│   │   ├── push/                      # FCM (D-15): IPushSender, FirebasePushSender/NoopPushSender, getPushSender() factory
│   │   └── storage/                  # IStorage: Local (+readFile cho gateway tải) / S3 / Cloudinary
│   ├── modules/
│   │   ├── auth/                     # JWT access+refresh, Session rotate thật + reuse detection, AuthUserDto
│   │   │   ├── controllers/          # auth.controller (refresh cookie|body, /me alias /profile), session.controller
│   │   │   ├── dtos/                 # auth.dto, auth-user.dto, change-password.dto, verify-email.dto
│   │   │   ├── services/             # auth.service, session.service (hash + rotate)
│   │   │   ├── tests/
│   │   │   └── auth.routes.ts
│   │   ├── users/                    # CRUD + status (lock/unlock/anonymize), role change, session mgmt
│   │   │   ├── controllers/ dtos/ entities/ repositories/ services/ tests/
│   │   │   └── user.routes.ts
│   │   ├── audit-log/                # Flat — AuditService.record() (không ném lỗi), GET /audit-logs (cursor)
│   │   ├── capabilities/             # Flat — GET /capabilities (feature flags + limits + upload)
│   │   ├── assets/                   # Full — upload 2 bước, magic-bytes check (file-type), signed URL, cleanup job
│   │   │   ├── controllers/ dtos/ entities/ jobs/ repositories/ services/ tests/
│   │   │   └── assets.routes.ts
│   │   ├── notifications/            # Full — inbox (cursor), mark-read/all, preference, job deliver.recipient
│   │   │   │                          # p1-07: fan-out tin nhắn → mục hộp thư (MENTION>FIRST_REPLY>THREAD_REPLY, dedupe msg:<id>) + push
│   │   │   │                          # (ma trận cài đặt ACCOUNT/WORKSPACE/member, DND, chặn, đang xem, gộp cửa sổ 10 s, 3 mức lockScreenPreview)
│   │   │   │                          # services/: fanout(.service|-edit.service|-recipients|-reasons|.types) · preference-matrix (thuần) ·
│   │   │   │                          #   preference-resolver.service (lô) · push-decision (thuần) · push-dispatch.service (cửa sổ gộp) ·
│   │   │   │                          #   message-push.service (push.send/push.send-coalesced) · message-push-payload.builder · message-preview ·
│   │   │   │                          #   inbox-context.service (kiểm quyền lúc đọc) · notification-preference.service (ACCOUNT/WORKSPACE) ·
│   │   │   │                          #   notification-stats (Redis giờ/ngày → admin) · notification-wiring (composition) · block-filter.holder
│   │   │   │                          # jobs/: fanout-message.job (fanout.message, fanout.message-edit) · message-push.jobs (push.send-coalesced) ·
│   │   │   │                          #   mark-read-by-stream.job · inbox-retention.job (cron 04:00); push.send (kind:"message") nằm ở push.jobs.ts
│   │   │   │                          # tests/: preference-matrix · push-decision · push-dispatch · fanout · message-push · message-push-payload ·
│   │   │   │                          #   inbox-context · notification-p1-07 (unit) + integration/message-fanout (NT-01/04/05/08/10/14/15/16)
│   │   │   ├── controllers/ dtos/ entities/ jobs/ repositories/ services/ tests/
│   │   │   └── notifications.routes.ts  # + GET/PUT /workspaces/:id/notification-preferences (p1-07)
│   │   ├── read-state/               # Full (p1-07) — mốc đọc KÊNH/THREAD (ReadState) + HỘI THOẠI (ConversationMember.lastReadSeq): POST /read-markers
│   │   │   │                          # (chỉ tăng, kẹp lastSeq, read:updated, read:receipt qua IReadReceiptPublisher, job mark-read-by-stream),
│   │   │   │                          # POST /me/read-all-conversations, GET /me/unread/summary + /me/unread (cache Redis 10 s)
│   │   │   ├── controllers/ dtos/ entities/ repositories/ services/ tests/{,integration/}
│   │   │   ├── read-state.routes.ts
│   │   │   ├── index.ts              # registerReadStateModule() — registerReadStateReader() (ThreadView.myLastReadSeq; gọi từ router.ts)
│   │   │   └── public.ts             # createUnreadService()/notifyUnreadSummaryChanged()/invalidateUnreadSummary() — barrel cho notifications/channels/conversations
│   │   ├── admin-notifications/      # Flat (p1-07) — GET /admin/notifications/stats (system-config:view): số liệu tổng hợp push/fan-out/hộp thư
│   │   │   └── admin-notifications.{routes,controller,service,validators}.ts
│   │   ├── webhooks/                 # Flat (p0-08) — POST /webhooks/livekit (RAW body + JWT ký sha256, mount ở app.ts TRƯỚC express.json):
│   │   │   │                         # WebhookEvent unique (provider,eventId) → 2xx CHỈ sau khi ghi DB; job `livekit.event` (queue calls)
│   │   │   │                         # → dispatch theo tiền tố phòng; cron webhook.sweep/webhook.prune; p5-03 dùng lại cho provider khác
│   │   │   ├── webhook-event.repo.ts livekit-webhook.service.ts livekit-event.processor.ts livekit-event.queue.ts
│   │   │   ├── webhooks.{container,controller,routes}.ts
│   │   │   ├── jobs/                 # livekit-event.job (+ handler spike), webhook-maintenance.jobs (sweep/prune)
│   │   │   └── tests/{,integration/,support/}
│   │   ├── media-admin/              # Flat (p0-08) — GET /admin/media/status (system-config:view): cấu hình/kết nối/số phòng/egress/webhook gần nhất;
│   │   │   │                         # cron media.rooms-snapshot (30 s, chỉ khi voice/meeting bật) → gauge livekit_rooms_active + Redis
│   │   │   │                         # cron TĨNH media.turn-probe (5 phút, p0-11): thăm dò TURN → Redis media:turn-probe:last (admin health `turn`) + gauge turn_probe_*
│   │   │   └── media-admin.{routes,controller,service,repo}.ts media-rooms-snapshot.job.ts media-turn-probe.job.ts tests/
│   │   ├── dev-tools/                # Flat (p0-11) — POST /dev/sentry-test (OPS-01): ném lỗi thử kiểm kênh Sentry; chỉ khi DEV_TOOLS_ENABLED && !production thật
│   │   │   └── dev-tools.routes.ts tests/                                  # (SENTRY_ENVIRONMENT), quyền system-config:update, 404 khi tắt
│   │   ├── media-dev/                # Flat (p0-08) — POST /dev/media/spike-token (chỉ NODE_ENV≠production && MEDIA_SPIKE_ENABLED; mount có điều kiện
│   │   │   │                         # ở router.ts + tự chặn 404 lúc chạy): token phòng spike_<room> cho spike thiết bị
│   │   │   └── media-dev.{routes,controller,service,access,validators}.ts tests/
│   │   ├── calls/                    # Full (p2-01) — lõi cuộc gọi 1-1/nhóm (RING): Call/CallParticipant, Redis call:active|busy|lock, hết giờ 45 s (outbox availableAt),
│   │   │   │                         # webhook LiveKit → reconcile (ghi đè listParticipants), recovery cron 1 phút, tin CALL_SUMMARY đúng một lần, /me/calls
│   │   │   ├── calls.routes.ts calls.container.ts index.ts   # requireCallsEnabled → 503 CALL_012; registerCallsModule() (resolver scope CALL + loại thông báo + listener thu hồi quyền)
│   │   │   ├── controllers/ dtos/ entities/ events/          # call-outbox.events.ts (call.ringing|answered|declined|participant-changed|ended|summary)
│   │   │   ├── repositories/         # call.repository.{interface,prisma}, call-scope.reader (đọc conversation/channel/meeting/user), tx
│   │   │   ├── services/             # call-state.machine (thuần), call-redis.store (+ InMemoryCallRedisPort), call-ring|response|end|reconcile|recovery|query|summary|revocation,
│   │   │   │                         # call-signal.dispatcher (socket + notify), call-token, call-scope.resolver, call-dto.mapper, call-wait
│   │   │   │                         # p2-03 phòng thoại kênh VOICE (mode ROOM): call-room.service (tạo/vào/rời, force), call-host.service (host actions + failover), call-room-interaction.service
│   │   │   │                         # (giơ tay, slot chia sẻ màn hình), call-room-permissions (thuần: nguồn phát), voice-preview.service, channel-voice-activity.reader (cổng shared/ports → danh sách kênh)
│   │   │   │                         # p2-02 call-ring-ack.service (POST /calls/:id/ack — lastRingAckAt/ringAckDeviceIds, CAS version, outbox lần đầu; xem trước màn hình khoá cho push call.* ở notifications/push-payload.builder)
│   │   │   ├── jobs/                 # call.jobs (queue calls + cron call.recovery + handler webhook `call_`), call-revoke-listener
│   │   │   └── tests/{,integration/,support/}
│   │   ├── meetings/                 # Full (p2-04) — lịch họp: Meeting/MeetingAttendee, mã abc-defg-hij, RSVP, HOST/CO_HOST, myActions (server tính), resolve mã, .ics
│   │   │   ├── meetings.routes.ts meetings.container.ts index.ts   # requireFeature(meeting); registerMeetingsModule() (resolver scope MEETING + loại thông báo + listener lifecycle)
│   │   │   ├── admin-meetings.routes.ts  # GET /admin/workspaces/:workspaceId/meetings (workspace:view + cờ meeting) — CHỈ metadata: repositories/admin-meeting.reader (select tối thiểu, chỉ đọc) + services/admin-meeting-query.service + controllers/admin-meetings.controller
│   │   │   ├── controllers/ dtos/ entities/ middlewares/           # meeting-guards: requireMeeting(action) (404 MEET_001 / 403), validateMeetingBody (mã MEET_xxx)
│   │   │   ├── repositories/         # meeting.repository.{interface,prisma}, meeting-directory.reader (thành viên workspace/user), tx
│   │   │   ├── services/             # meeting|meeting-attendee|meeting-query|meeting-lifecycle, meeting-actions.calculator (thuần), meeting-code.generator,
│   │   │   │                         # meeting-scope.resolver, meeting-event.handler (outbox meeting.events + registerMeetingEventSink), meeting-reminder, meeting-ics,
│   │   │   │                         # meeting-conversation-sync (ConversationHooks), meeting-jobs.port, meeting-events
│   │   │   │                         # (p2-05 phòng họp) meeting-room.{deps,access,signals,store,schedule,jobs.port,join|lifecycle|leave|query|maintenance|webhook.service,event.handler},
│   │   │   │                         # meeting-lobby.service, meeting-host-control.service, meeting-chat-group.service, meeting-token.policy (thuần), meeting-call.port (cổng sang calls)
│   │   │   ├── meeting-room.routes.ts meeting-room.container.ts   # POST /meetings/:id/{start,join,leave,end,lock,unlock,chat-group,transfer-control} · GET .../room|lobby · lobby/*, participants/*, hands/{lower-all,:userId/lower}
│   │   │   ├── meeting-recap-recording.routes.ts meeting-recap-recording.container.ts   # (p2-06) /meetings/:id/recap* (xem/lưu nháp CAS/công bố/tệp) · /meetings/:id/recordings* (đồng ý, bắt đầu, danh sách) · /recordings/:id* (dừng, URL ký, xoá, retry-import)
│   │   │   │                         # services: meeting-recap.service, recording-consent.{service,store} (Redis rec:consent*), meeting-recording.service, recording-{lifecycle (máy trạng thái CAS),
│   │   │   │                         # import,maintenance (retention + stuck-check),egress.handler,guards,signals,state,publish (quyền phát theo đồng ý),outbox,runtime,errors},
│   │   │   │                         # meeting-recap-recording.events (sink meeting.events: ended/recap-published/recording-ready), recap-asset-access, admin-recording.service
│   │   │   ├── adapters/             # calls-room.adapter (ĐIỂM NỐI DUY NHẤT với modules/calls qua getCallsContainer(): Call ROOM scope MEETING, khoá call:*, endCall, token) + calls-room-enter (vào phòng nguyên tử); meeting-assets.adapter (p2-06 — cổng MeetingAssetsPort sang @modules/assets/public)
│   │   │   ├── jobs/                 # meeting.jobs (meeting.events|reminder|ics-send|conversation-sync|lifecycle + cron reminder-reconcile), meeting-revoke-listener
│   │   │   │                         # meeting-room.jobs (queue calls: meeting.auto-close|host-grace|attendance-finalize|room-lifecycle + cron room-reconcile + handler webhook `meet_`), meeting-room-revoke-listener
│   │   │   │                         # recap-recording.jobs (p2-06: webhook egress_*, recording.import|storage-delete (media), recording.stop-on-end (calls), meeting.recap-reminder, cron recording.retention-cleanup|stuck-check)
│   │   │   └── tests/{,integration/}   # meeting-room.*.int.test.ts + meeting-room-test-kit/mocks (calls thật + InMemoryMediaServer)
│   │   ├── presence/                 # Flat — presence.service (ONLINE/IDLE/DND/OFFLINE/HIDDEN + reap job),
│   │   │   │                          # typing.service (Redis TTL), GET /presence
│   │   │   ├── presence.jobs.ts presence.routes.ts presence.controller.ts presence.validators.ts
│   │   │   └── presence.service.ts typing.service.ts
│   │   └── system-config/            # Full (p0-07) — GET/PUT/POST reset /admin/system-config/:key
│   │       │                          # (expectedVersion+reason, audit, outbox config.changed → config:updated debounce)
│   │       ├── controllers/ dtos/ entities/ jobs/ repositories/ services/ tests/
│   │       └── system-config.routes.ts
│   │   ├── channels/                 # Full (p1-01 bootstrap → p1-03 CRUD/grant/archive đầy đủ) — services/
│   │   │                              # channel-message-scope.adapter.ts (p1-04): MessageScope CHANNEL, đăng ký qua
│   │   │                              # index.ts#registerChannelModule() (gọi từ router.ts)
│   │   │                              # services/channel-overview.contributor.ts: khối "Kênh của bạn" của overview workspace (lọc theo grant — WS-09)
│   │   │   ├── controllers/ dtos/ entities/ jobs/ repositories/ services/ tests/
│   │   │   ├── channels.routes.ts channel-grants.routes.ts admin-channels.routes.ts
│   │   │   └── index.ts              # createChannelBootstrap()/registerChannelModule() factory
│   │   ├── messages/                 # Full (p1-04) — engine tin nhắn CHUNG cho CHANNEL/CONVERSATION qua registry
│   │   │                              # `scope/` (MessageScope, KHÔNG import channels/conversations); send/list/get/
│   │   │                              # edit/recall, hide, react/pin, forward, SystemMessageService (ISystemMessagePort),
│   │   │                              # services/thread-summary.loader.ts: ghép replyCount/lastReplier* của tin gốc vào MessageView (batch, p1-06);
│   │   │                              # repositories/message.repository.inmemory.ts + tests/support/: harness unit test MessageService
│   │   │                              # PinsQueryService (p1-09: GET …/pins cursor + total/max + lọc tin ẩn + pinnedByUser)
│   │   │   ├── controllers/ dtos/ entities/ events/ jobs/ middlewares/ repositories/ scope/ services/ tests/
│   │   │   ├── messages.routes.ts    # export mặc định + createScopedMessageRouter(scopeType) (alias /channels/:id/messages)
│   │   │   └── public.ts             # registerMessageScope, createSystemMessageService(), excerptOf, Message type — barrel
│   │   ├── conversations/            # Full (p1-05) — DIRECT (getOrCreateDirect idempotent) + GROUP (create/patch/dissolve),
│   │   │                              # thành viên (add/role/remove/transfer/leave), danh sách (filter/q/cursor/preview),
│   │   │                              # cài đặt cá nhân (pin/mute/archive/markUnread/clear), read-receipts (đọc),
│   │   │                              # thư viện media, `scope/` MessageScope CONVERSATION, `permission/` resolver +
│   │   │                              # requireConversation(action), hooks (workspace/meeting/block — xem
│   │   │                              # core/permission/conversation-hooks.port.ts)
│   │   │                              # adapters/member-contact.port.impl (MemberContactPort — members hỏi "nhắn/gọi được không" cho MemberCard.actions; p1-02)
│   │   │                              # jobs/: workspace-member-removed.job · workspace-status.job (workspace archive/restore → GROUP ARCHIVED/ACTIVE) · counters-rebuild.job
│   │   │   ├── controllers/ dtos/ entities/ events/ jobs/ permission/ repositories/ scope/ services/
│   │   │   ├── conversations.routes.ts
│   │   │   ├── index.ts              # registerConversationModule() — MessageScope + ConversationHooks (gọi từ router.ts)
│   │   │   └── public.ts             # createGroupConversationService() — barrel cho admin-conversations
│   │   ├── threads/                  # Full (p1-06) — thread trả lời 1 tầng ở kênh: assertThreadable/onReplyCreated
│   │   │                              # (IThreadHook, tx cùng message.service.ts#send()), theo dõi AUTO_ON/EXPLICIT_*,
│   │   │                              # GET /messages/:id/thread, /threads/:id, PUT subscription, GET /channels/:id/threads (P1)
│   │   │                              # tests/: thread.service · thread-hook.adapter (unit) + integration/ threads.routes (TH-01/02/04/05, MSG-30..36, CH-06) · threads-realtime
│   │   │   ├── controllers/ dtos/ entities/ jobs/ repositories/ services/
│   │   │   ├── threads.routes.ts
│   │   │   ├── index.ts              # registerThreadsModule() — registerThreadHook() (gọi từ router.ts)
│   │   │   └── public.ts             # listThreadSubscribers() — p1-07 fan-out gọi để lấy người theo dõi thread
│   │   ├── mentions/                 # Flat (p1-06) — MentionParser (marker @{u:id}/@{all}/@{r:ROLE}), MentionService
│   │   │                              # (IMentionValidator: mismatch/@all/rate-limit/diff sửa tin), mentionables (gợi ý @)
│   │   │                              # tests/: mention.parser · mention.service · mentionables.service (unit)
│   │   │   ├── mention.parser.ts mention.service.ts mentionables.service.ts mentionables-query.dto.ts
│   │   │   ├── mentions.routes.ts
│   │   │   ├── index.ts              # registerMentionsModule() — registerMentionValidator() (gọi từ router.ts)
│   │   │   └── public.ts             # parseMarkers()/buildTextForSearch() — hàm thuần cho p1-07 (excerpt push/hộp thư)
│   │   ├── wallet/                   # Full (p6-04) — ví nhóm & chia tiền (tiền = SỐ NGUYÊN đồng). Số dư ròng `WalletBalance` là nguồn
│   │   │   │                          # sự thật, `ExpenseShare.status/paidAmount` chỉ là phép chiếu FIFO. Admin KHÔNG có API xem chi tiết
│   │   │   │                          # ví — chỉ `GET /admin/workspaces/:id/wallet-stats` (đếm + dải giá trị, ẩn danh).
│   │   │   ├── domain/               # THUẦN (không I/O, test property fast-check): wallet-math (chia EQUAL/CUSTOM/PERCENT, số dư,
│   │   │   │                          # min-cash-flow, chiếu FIFO) · wallet-schedule (lịch nhắc "m h * * d" theo tz) · vietqr-reference ·
│   │   │   │                          # vn-banks (BIN→tên, chuẩn hoá tên chủ TK) · csv (BOM + chống CSV injection)
│   │   │   ├── controllers/ dtos/ entities/ repositories/ tests/{domain,integration}/
│   │   │   ├── repositories/         # wallet (cài đặt+số dư) · expense (+share) · settlement · payment-profile · wallet-directory
│   │   │   │                          # (tra cứu chỉ-đọc: thành viên/nơi nhắc/tệp) — nhận `tx?` để cùng transaction với service
│   │   │   ├── services/             # expenses · expense-changes (sửa/xoá/điều chỉnh) · settlements · wallet-projection (`$inc` số dư +
│   │   │   │                          # chiếu share trong tx) · wallet-summary · wallet-settings · wallet-reminder · payment-profiles
│   │   │   │                          # (AES-GCM) · wallet-stats (admin) · wallet-export (CSV) · wallet-access · wallet-notifications
│   │   │   ├── jobs/                 # wallet-events.consumer (outbox → `wallet:updated`) · wallet-remind-tick (cron 5 phút, thay scheduler
│   │   │   │                          # theo ví) · wallet-settlement-stale (hằng giờ) · wallet-balance-rebuild (03:10)
│   │   │   ├── wallet.routes.ts admin-wallet.routes.ts   # path tuyệt đối, mount root v1
│   │   │   └── wallet.container.ts   # DI dùng chung routes + jobs (worker không import routes)
│   │   ├── documents/                # Full (p6-01) — tài liệu cộng tác thời gian thực (Yjs/Hocuspocus qua server `collab/`). BE là NGUỒN DUY NHẤT của state:
│   │   │   │                          # `Document` + `DocumentSnapshot` + `DocumentCollaborator`; collab gọi ngược qua `internal-documents.routes.ts` (bí mật nội bộ, KHÔNG qua nginx)
│   │   │   │                          # để hỏi quyền (`access`) và lưu/đọc `state`. Cấp token kết nối `POST /documents/:id/collab-token` (`shared/collab`).
│   │   │   ├── services/             # document-collab (token) · document-access.resolver (scope DOCUMENT) · document-collaborators · document-snapshots (thủ công +
│   │   │   │                          # tự động) · document-revoke (mất quyền ⇒ kick) · document-plaintext (job trích văn bản phẳng từ `yjsState` → `plainText`/`normalizedText`/`wordCount`, CAS theo `yjsVersion`) · collab-admin (admin: health, dọn snapshot)
│   │   │   ├── jobs/                 # document.jobs — plaintext, snapshot-hourly (đăng ký runner vào cron CHUNG `collab.snapshot-hourly`), access-revoked
│   │   │   └── documents.routes.ts internal-documents.routes.ts collab-admin.routes.ts   # đường nội bộ mount TRƯỚC globalLimiter/body parser (app.ts)
│   │   ├── whiteboards/              # Full (p6-02) — bảng trắng cộng tác, khuôn y hệt `documents/` (kind `whiteboard`, prefix `wb:`). Mã lỗi WB_001..008.
│   │   │   │                          # `whiteboard-element.schema` + `whiteboard-state-inspector` đếm phần tử (≤ `LIMITS.whiteboard.elementsMax`; vượt chỉ CẢNH BÁO, không từ chối lưu vì collab thử lại vô hạn khi gặp 4xx lạ);
│   │   │   │                          # JSON schema hợp đồng phần tử ở `contracts/whiteboard-elements.schema.json` (app engine đối chiếu bằng test).
│   │   │   └── whiteboards.routes.ts internal-whiteboards.routes.ts   # WB_008 (409) = bảng đã lưu trữ — collab dựa vào để ngừng lưu
│   │   ├── coins/                    # Full (p7-02) — kinh tế ẢO (xu): sổ cái bất biến `CoinLedgerService` (mọi đổi số dư trong MỘT transaction + khoá idempotency, không âm),
│   │   │   │                          # thưởng xu từ `xp.awarded` (`CoinRule` xu cố định/nguồn, trần ngày qua bảng `CoinEarnEvent` — KHÔNG Redis INCR), nhiệm vụ ngày, cửa hàng + kho đồ.
│   │   │   │                          # Chợ tài liệu là P1 (COIN_006..008 để dành). KHÔNG có đường đổi xu ↔ tiền thật. `public.ts` xuất `createEquippedItemsReader()`.
│   │   │   ├── domain/ services/ repositories/ jobs/ seed/   # seed (`seedCoins`, gọi từ prisma/seed.ts) chưa chạy — người dùng duyệt số liệu trước
│   │   │   └── coins.routes.ts admin-economy.routes.ts   # user: /me/wallet · /me/quests · /shop · /me/inventory; admin: /admin/economy/* (quyền gamification:*, cờ `coins`)
│   │   ├── chat-extensions/          # Full (p7-04) — poll (`MessageKind POLL`), tin HẸN GIỜ (outbox `availableAt`, vô hiệu bằng CAS theo `version`), nhắc việc theo tin,
│   │   │   │                          # chuyển tin → task (`ITaskCreationPort`) / tài liệu (`IResourceCreationPort` — p3-01 CHƯA cài ⇒ 501). Gửi tin thay người dùng qua
│   │   │   │                          # `IMessageSendPort` (cài bằng `MessageService`), KHÔNG nhân bản logic gửi tin. Cờ phụ: polls/scheduledMessages/messageReminders/messageToTask/messageToResource/gif (gif mặc định TẮT).
│   │   │   └── chat-extensions.routes.ts   # /scopes/:type/:id/polls · /scheduled-messages · /messages/:id/(reminders|to-task|to-resource) · /me/reminders (+ alias /channels|/conversations/:id/…)
│   │   ├── plagiarism/               # MỚI CÓ `lib/` (p7-05) — hàm THUẦN quét trùng lặp nội bộ (chuẩn hoá, tách token, murmur3, winnowing, containment, gom đoạn, `TextExtractor`).
│   │   │                              # Chưa có schema/repo/job/route/service; trích PDF/DOCX chờ duyệt thư viện (`mammoth`, thư viện PDF). Xem `.claude/rules/reuse-first.md`.
│   │   ├── discovery/                # Full (p1-09) — tin ĐÃ LƯU (POST/DELETE /messages/:messageId/save, GET /me/saved, kiểm lại quyền
│   │   │   │                          # từng mục, `saved:updated`) + TÌM trong 1 kênh/hội thoại (GET /scopes/:type/:id/search, alias
│   │   │   │                          # /channels|/conversations/:id/search; normalizedContent + regex ĐÃ ESCAPE, quét cửa sổ thời gian
│   │   │   │                          # + maxTimeMs → partial, snippet/highlight giữ dấu). KHÔNG import channels/conversations — tra
│   │   │   │                          # MessageScope qua @modules/messages/public. Danh sách GHIM nằm ở messages (PinsQueryService).
│   │   │   ├── controllers/ dtos/ entities/ repositories/ services/ tests/
│   │   │   ├── services/             # saved.service · scope-search.service · search-query.builder (thuần: tách từ/escape/cửa sổ thời gian) ·
│   │   │   │                          # snippet.util (thuần) · cursor-param · message-visibility · saved-item.presenter
│   │   │   ├── saved.routes.ts scope-search.routes.ts   # path tuyệt đối, mount root v1; scope-search export createScopedSearchRouter()
│   │   │   └── tests/integration/    # discovery-search / discovery-saved-pins (+ discovery-fixtures.ts dùng chung)
│   │   ├── workspace-search/         # Full (p5-04) — TÌM TOÀN WORKSPACE (GET /workspaces/:workspaceId/search?type=messages|files|channels|people|meetings): CHỈ ĐỌC,
│   │   │   │                          # quyền tính TRƯỚC truy vấn (ReadableScopesService: kênh công khai/riêng tư có grant/vai trò, nhóm chat là thành viên, 1-1 khi includeDirect,
│   │   │   │                          # khách chỉ kênh chỉ định) rồi KIỂM LẠI mỗi trang (DU-02). Regex neo đầu từ ĐÃ ESCAPE trên normalizedContent, cửa sổ thời gian + maxTimeMs 3000
│   │   │   │                          # (→ partial / SRCH_104). Truy vấn collection của module khác qua repository ĐỌC riêng (ngoại lệ có chủ đích); snippet dùng @modules/discovery/public.
│   │   │   ├── controllers/ dtos/ entities/ repositories/ services/ tests/
│   │   │   ├── repositories/         # readable-scopes.repository.{interface,prisma,inmemory} · message-search.repository.prisma (findRaw) · catalog-search.repository.prisma (người/tài liệu/họp)
│   │   │   ├── services/             # workspace-search.service (điều phối theo type) · readable-scopes.service · searchers/{message,file,channel,people,meeting}.searcher + message-scan/message-visibility
│   │   │   ├── workspace-search.routes.ts   # path tuyệt đối, mount root v1; cờ phụ workspaceSearch (requireSubFeature)
│   │   │   └── tests/integration/    # workspace-search.api (SRCH-01..06) + search-fixtures.ts dùng chung cho workspace-templates/announcements
│   │   ├── workspace-templates/      # Flat (p5-04) — mẫu workspace (course/capstone/self-study): GET /workspace-templates, áp mẫu POST /workspaces/:id/templates/:code/apply
│   │   │   │                          # (OWNER/ADMIN, Idempotency-Key bắt buộc, bỏ qua kênh trùng tên), tạo nhóm từ mẫu (templateCode ở POST /workspaces qua shared/ports/workspace-template.port),
│   │   │   │                          # admin GET/PUT /admin/workspace-templates (CAS version + lý do + audit). Tạo kênh qua shared/ports/channel-creation.port (channels cài đặt).
│   │   │   ├── workspace-templates.{routes,controller,service,repo,validators}.ts index.ts   # index.ts = createWorkspaceTemplatePort() cho workspaces
│   │   │   ├── seed/templates.seed.ts   # 3 mẫu; npm run db:seed:templates (scripts/seed-workspace-templates.ts, idempotent theo code, --force ghi đè)
│   │   │   └── tests/integration/    # workspace-templates.api (TPL-01..03, idempotency, admin)
│   │   ├── announcements/            # Full (p5-04) — XÁC NHẬN ĐÃ ĐỌC thông báo kênh ADMINS_ONLY: POST/GET/DELETE /messages/:id/announcement, POST .../confirm, GET .../receipts,
│   │   │   │                          # GET /channels/:id/announcements. Biên nhận CHỈ tạo khi người nhận bấm (RC-02); audience = người ĐANG đọc được kênh (channelReaderIds, không phụ thuộc
│   │   │   │                          # registry MessageScope nên job chạy ở worker riêng). Outbox announcement.notify + announcement.deadline-remind (availableAt); socket announcement:updated|confirmed.
│   │   │   ├── controllers/ dtos/ entities/ repositories/ services/ jobs/ tests/
│   │   │   ├── announcements.routes.ts announcement.notification-types.ts   # cờ phụ readConfirm; loại announcement.required|reminder
│   │   │   └── tests/integration/    # announcements.api (RC-01..03, ANN_001..003, fan-out idempotent)
│   │   ├── admin-conversations/      # Flat (p1-05) — GET /admin/workspaces/:id/conversations (CHỈ số liệu, không
│   │   │                              # title/tên thành viên khác ngoài ownerName), POST /admin/conversations/:id/dissolve
│   │   │   ├── admin-conversations.routes.ts admin-conversations.controller.ts
│   │   │   └── admin-conversations.service.ts admin-conversations.validators.ts
│   │   ├── moderation/               # Full (p1-08) — báo cáo (MESSAGE/USER/CHANNEL/CONVERSATION, idempotent theo người×đích),
│   │   │                              # hàng đợi THEO PHẠM VI (OWNER/ADMIN ws · MANAGER kênh private · OWNER/ADMIN nhóm chat) +
│   │   │                              # resolve (gỡ tin qua MessageModerationPort/bỏ qua/cảnh cáo), admin nền tảng (danh sách gộp,
│   │   │                              # chi tiết, D-06 xem nội dung riêng tư có audit+thông báo+hết hạn 24h, PATCH hành động)
│   │   │   ├── controllers/ dtos/ entities/ jobs/ repositories/ services/ tests/
│   │   │   ├── reports.routes.ts scope-reports.routes.ts admin-moderation.routes.ts  # path tuyệt đối, mount root v1
│   │   │   ├── moderation.container.ts               # DI dùng chung 3 file routes
│   │   │   └── moderation.notification-types.ts      # registerNotificationType (moderation.request/…)
│   │   ├── blocks/                   # Flat (p1-08) — POST/DELETE/GET /me/blocks, BlockPort (cache Redis block:/blockedBy:,
│   │   │   │                          # hai chiều cho nhắn/presence, một chiều cho lọc thông báo), `block:updated` (outbox block.events)
│   │   │   ├── blocks.routes.ts blocks.controller.ts blocks.service.ts blocks.repo.ts blocks.validators.ts
│   │   │   ├── block-port.impl.ts blocks.jobs.ts
│   │   │   └── public.ts             # getBlockPort()/createBlockPort() — barrel cho conversations/presence/notifications/calls
│   │   ├── resources/                # Full (p3-01 Resource Hub) — kho tài liệu workspace: thư mục lồng ≤ 8 cấp (unique parentKey/nameKey, di chuyển kiểm vòng +
│   │   │   │                          # lệnh thô `$concatArrays`, xoá/khôi phục THEO LÔ cùng `deletedAt`), tệp từ asset READY (`type`/`language` suy ở server),
│   │   │   │                          # list cursor + tìm không dấu (escapeRegex) + cache Redis theo phiên bản workspace, thùng rác 30 ngày (job `resources.purge`),
│   │   │   │                          # hạn mức `Workspace.storageUsedBytes` (giữ chỗ Redis + kiểm CỨNG trong transaction). Admin: `resource-stats`, `resource-quota`.
│   │   │   ├── controllers/ dtos/ entities/ events/ jobs/ repositories/ services/ tests/{support,integration}
│   │   │   ├── services/             # folder · resource (create/get/url) · resource-list · resource-mutation · trash · resource-purge · resource-admin ·
│   │   │   │                          # storage-quota · storage-usage · resource-upload.gate (hook POST /assets RESOURCE) · resource-type.resolver ·
│   │   │   │                          # asset-port (+ .public: cổng sang @modules/assets/public) · workspace-access (permissionService.assert)
│   │   │   ├── repositories/         # folder · resource (+ .inmemory) · tx (ITxRunner/IOutboxPort — service KHÔNG import Prisma) · workspace-storage ·
│   │   │   │                          # user-directory · quota-override (SystemConfig `resource`, CAS version)
│   │   │   ├── events/resource.events.ts   # outbox resource.*/folder.* → 1 job `resource.events` (queue notifications)
│   │   │   ├── jobs/                 # resources-purge.job (cron 03:15) · resource-events.consumer (outbox → socket `resource:changed`)
│   │   │   ├── resources.routes.ts resources.admin.routes.ts   # path tuyệt đối, mount root v1 + /admin/workspaces; cờ `project` ở từng route
│   │   │   └── resources.container.ts # DI dùng chung routes + job (worker không import routes)
│   │   ├── study/                    # Full (p4-01 Study set & Flashcard; p4-02 mock test/SR và p5-01 live quiz dùng lại CÙNG model) — bộ học PRIVATE/WORKSPACE/PUBLIC,
│   │   │   │                          # 5 loại mục (FLASHCARD, MULTIPLE_CHOICE, MULTI_SELECT, TRUE_FALSE, FILL_BLANK; đáp án theo id lựa chọn, client gửi INDEX),
│   │   │   │                          # `PUT /study-sets/:id/items` = { upsert[], delete[] } trong MỘT transaction (CAS `StudySet.version` TRƯỚC, gom lỗi có index →
│   │   │   │                          # STUDY_001, thân ≤ 2 MB), nhân bản (AssetLink mới trỏ cùng asset), ẩn/khôi phục (nhóm OWNER/ADMIN + admin nền tảng, audit + đóng
│   │   │   │                          # báo cáo), báo cáo qua p1-08. Cờ `study` (mặc định TẮT, `AVAILABLE_MODULES` chưa có tới khi p4-02 xong).
│   │   │   ├── controllers/ dtos/ entities/ jobs/ repositories/ services/ tests/{support,integration}
│   │   │   ├── services/             # study-set (create/get/patch/remove) · study-set-list (+ thẻ phổ biến, cache Redis 10 phút) · study-set-duplicate ·
│   │   │   │                          # study-item-bulk (PUT items) · study-item-query · study-item.validator/.builder (THUẦN, gom lỗi theo index) ·
│   │   │   │                          # study-item-order (THUẦN, order Float trung điểm) · answer-grader (THUẦN — chấm dùng chung p4-01/p4-02/p5-01) ·
│   │   │   │                          # study-set-access (ma trận quyền README §6 — `canView` dùng lại) · study-set-moderation · study-report (+ điểm cắm đích báo cáo) ·
│   │   │   │                          # study-asset.port (+ .public: cổng sang @modules/assets/public) · study-asset-read.resolver (quyền đọc asset STUDY_ITEM/STUDY_SET_COVER) ·
│   │   │   │                          # study-content.reader (cổng đọc cho module khác)
│   │   │   ├── repositories/         # study-set · study-item (+ .inmemory) · tx (ITxRunner — service KHÔNG import Prisma) · user-directory
│   │   │   ├── jobs/study-report.consumer.ts   # đăng ký đích báo cáo STUDY_SET ở WORKER (không thêm processor: `report.events` chỉ có 1 processor — của moderation)
│   │   │   ├── study.routes.ts study.admin.routes.ts   # path tuyệt đối, mount root v1; cờ `study` ở từng route
│   │   │   ├── study.container.ts    # DI dùng chung routes + worker; `registerStudyIntegrations()` (resolver quyền asset + đích báo cáo)
│   │   │   └── public.ts             # gradeAnswer · createStudyContentReader() · hằng loại mục — barrel cho p5-01/p7-02 (không import file trong services/)
│   │   ├── live-quiz/                # Full (p5-01 Live Quiz Battle) — thi trực tiếp theo PIN 6 số từ bộ học (chỉ MULTIPLE_CHOICE một đáp án). Trạng thái NÓNG ở Redis
│   │   │   │                          # (ZSET điểm + HASH đáp án/câu, Lua nguyên tử — một đáp án/người/câu, chấm theo TIME Redis), Mongo chỉ ghi khi kết thúc (write-behind,
│   │   │   │                          # outbox `live-quiz.persist` → `LiveQuizResult` + XP `quiz.scored`). Cờ `live-quiz` (mặc định TẮT, cần `study`).
│   │   │   ├── services/             # live-quiz.service (MẶT TIỀN) · session (create/join/kick) · flow (mở câu/nhận đáp án/công bố/đóng sớm) · finish (đóng phiên, cron, admin) ·
│   │   │   │                          # host-presence (host rời/về/timeout) · persist · query · snapshot · scoring/question.picker (THUẦN)
│   │   │   ├── redis/                # redis-store (Lua nhúng chuỗi TS) · store.inmemory (mô phỏng Lua, có test PARITY với Redis thật) · keys/meta/types
│   │   │   ├── realtime/             # emitter (quiz:* + throttle) · command-bus (timer + delayed job + pub/sub: worker KHÔNG có getIO()) · presence · room-guard
│   │   │   ├── jobs/                 # quiz.question-deadline · quiz.auto-advance · quiz.host-timeout (chỉ `bus.dispatch`) · live-quiz.persist (outbox) · live-quiz.expire-stale (cron TĨNH)
│   │   │   ├── repositories/         # prisma + inmemory · tx (ITxRunner/IQuizOutbox — service KHÔNG import Prisma) · ports
│   │   │   ├── index.ts              # registerLiveQuizModule() — router.ts gọi: guard room `quiz` + executor lệnh hẹn giờ + subscriber
│   │   │   ├── live-quiz.routes.ts live-quiz.admin.routes.ts   # path tuyệt đối, mount root v1; cờ `live-quiz` ở từng route
│   │   │   └── live-quiz.container.ts # DI dùng chung routes + socket handler + job (worker); setLiveQuizContainerForTests()
│   │   ├── pomodoro/                 # Full (p5-02 Phòng Pomodoro) — kênh type POMODORO: đồng hồ theo SERVER trên `Call ROOM` của kênh. Máy trạng thái THUẦN
│   │   │   │                          # (WAITING/FOCUS/SHORT_BREAK/LONG_BREAK/PAUSED/ENDED) + CAS `updateMany({id,version,phase})`; hẹn giờ = outbox `availableAt` (`pomodoro.deadline` jobId
│   │   │   │                          # `…:v{version}`) + cron `pomodoro.reconcile` quét bù. Mic khoá ở FOCUS THỰC THI ở máy chủ media (`updateParticipant`; `canPublish=false` khi nguồn rỗng).
│   │   │   │                          # Cờ `pomodoro` (mặc định TẮT, cần `voice`). Nối `calls` CHỈ qua `adapters/calls-room.adapter.ts` (`getCallsContainer()`) — không sửa lõi `calls`.
│   │   │   ├── services/             # pomodoro.service (lệnh host + idempotent `commandId`) · join (`POST /channels/:id/pomodoro/join`) · transition (`apply`/`create`/`syncHost` + outbox) · runner
│   │   │   │                          # (deadline/empty-room/media-sync/host-sync/reconcile) · presence (mục tiêu, thời gian có mặt, lịch sử) · media-sync · livekit.handler · snapshot ·
│   │   │   │                          # command.store (Redis `pomo:cmd:*`) · THUẦN: state-machine (bảng chuyển) · media-policy (`permissionFor`/`rulesFor`)
│   │   │   ├── adapters/             # calls-room.adapter — DUY NHẤT file import `../../calls` (host `Call.hostId` = chủ phiên, failover do `calls`, phiên đồng bộ lại `hostUserId`)
│   │   │   ├── realtime/             # pomodoro.broadcaster — `pomodoro:updated` (snapshot CHUNG `ch:{id}`) phát bằng `emitToRoom` ở CẢ API lẫn worker (cầu nối socket p0-03)
│   │   │   ├── jobs/ repositories/   # pomodoro.jobs (processor queue `calls` + cron + handler webhook `call_*`) · queue (outbox/delayed) · prisma + inmemory · tx (ITxRunner)
│   │   │   ├── controllers/ dtos/ entities/ tests/{integration,support}
│   │   │   └── pomodoro.routes.ts pomodoro.container.ts   # path tuyệt đối, mount root v1; cờ `pomodoro` ở từng route; DI dùng chung routes + job (worker)
│   │   ├── contribution/             # Full (p4-06 Báo cáo đóng góp & heatmap) — module RIÊNG, KHÔNG chồng vào `projects` (nối vào `projects` CHỈ qua sink `task.events`).
│   │   │   │                          # Điểm/% từng thành viên tính từ FACT (`ContributionTaskFact` một bản ghi/thẻ theo `completionCount`, `ContributionReviewFact` một bản ghi/lượt chấm),
│   │   │   │                          # công thức D-09 công khai kèm số gốc, CHỈ ĐỌC với mọi vai trò (ghi → 405 CONTRIB_001). Heatmap theo NGÀY (`ActivityDaily`, không giờ). Xuất PDF (job nền).
│   │   │   ├── controllers/ dtos/ entities/ jobs/ notifications/ repositories/ services/ tests/{integration,support}
│   │   │   ├── services/             # THUẦN: period (ALL/M:/W: theo tz) · contribution-calculator (+ contribution-shares phần dư lớn nhất) · contribution-explain (câu tiếng Việt) ·
│   │   │   │                          # contribution-config.schema (Board.contribution, `.strict()`). Dịch vụ: contribution (đọc báo cáo/kỳ/recompute) · contribution-member-tasks ·
│   │   │   │                          # contribution-config (CAS configVersion + audit `board.contribution-config`) · contribution-facts (sink → fact idempotent) · contribution-reconcile (cron 02:15) · contribution-timezone (cron 02:45: `pm.timezone` đổi → kéo snapshot/heatmap các bảng không ai mở về đúng múi giờ) ·
│   │   │   │                          # heatmap (đọc) · activity-refresh (`$set` từ nguồn: job 15 phút + làm mới khi xem + cron 01:30) · contribution-stats (admin, chỉ số đếm) ·
│   │   │   │                          # contribution-read (ContributionReadPort: careerScore cho p6-07/p6-08) · export-asset-read.resolver (quyền đọc asset CONTRIBUTION_EXPORT)
│   │   │   ├── services/export/      # contribution-export (yêu cầu/dedupe/xem-tải) · contribution-export-job (dựng PDF → asset REPORT → READY/FAILED/EXPIRED) · contribution-export-data (dữ liệu chuẩn hoá + sha256) ·
│   │   │   │                          # contribution-pdf.renderer (+ -heatmap) · verify-code (mã xác thực 10 ký tự, canonicalJson) · export-labels · contribution-export.ports
│   │   │   ├── services/pdf/         # BỘ GHI PDF TỰ VIẾT (repo chưa có pdfkit): ttf-font (cmap 4/12, hmtx) · pdf-document (Type0/CIDFontType2 Identity-H + ToUnicode, xref) · pdf-font-embed · pdf-flow · pdf-fonts
│   │   │   ├── repositories/         # fact · state · snapshot · activity-daily · export (+ .inmemory) · activity-source (aggregateRaw `$dateToString` theo tz) · contribution-source (đối soát) ·
│   │   │   │                          # contribution-directory (đọc Board/Task/User/Membership + ghi DUY NHẤT `Board.contribution`) · tx
│   │   │   ├── jobs/contribution.jobs.ts   # sink `p4-06.contribution` + reports/{contribution.task-fact, review-fact, recompute, export, activity.aggregate} + cron {activity.reconcile, contribution.reconcile, contribution.timezone-sync, contribution-export.cleanup}
│   │   │   ├── contribution.routes.ts contribution.admin.routes.ts   # path tuyệt đối, mount root v1; cờ `project` ở từng route; createContributionRouter(container) cho test
│   │   │   ├── contribution.container.ts     # DI dùng chung routes + worker; createContributionContainer(overrides) cho test
│   │   │   └── index.ts public.ts    # registerContributionModule() (loại thông báo + quyền đọc asset) · createContributionReadPort() cho module Phase 6
│   │   ├── projects/                 # Full (p3-02 Kanban; p3-03 chi tiết thẻ, p4-04/05 mở rộng CÙNG module; p4-06 ở module `contribution`) — bảng (cột `kind`, đúng 1 DONE,
│   │   │   │                          # WIP cảnh báo), thẻ (kéo thẻ CAS `version` + khoá phân số do SERVER tính từ hàng xóm hiện tại), nhãn,
│   │   │   │                          # lưu trữ, realtime `board:{id}`. Ghi thứ tự thẻ luôn qua `BoardWriteRunner` (hàng đợi theo bảng + `touch(Board)`
│   │   │   │                          # để transaction đụng nhau → retry ⇒ khoá vị trí không trùng). Admin: `GET /admin/workspaces/:id/project-stats`.
│   │   │   ├── controllers/ dtos/ entities/ jobs/ realtime/ repositories/ services/ events/ tests/{fixtures,integration,support}
│   │   │   ├── services/             # board · board-columns.validator (thuần) · board-access.resolver (scope BOARD → WORKSPACE + children() cho
│   │   │   │                          # revokeScope) · board-write-runner + keyed-mutex · task (list/create) · task-move (CAS/policy/effect/outbox) ·
│   │   │   │                          # task-position (fractional index TỰ CÀI, tương thích fractional-indexing@3.2.0 — gói ESM-only) ·
│   │   │   │                          # task-move-policy (registry TaskMovePolicy/TaskMoveEffect cho p4-05) · board-rebalance · label · project-access
│   │   │   │                          # p3-03: task-detail (get/patch[diff→activity+outbox, CAS version]/xoá mềm/khôi phục) · task-diff (thuần) ·
│   │   │   │                          # task-checklist (theo TỪNG MỤC, không expectedVersion; gộp activity 60 s) · checklist-order (thuần) ·
│   │   │   │                          # task-attachment (+ task-attachment.rules) · task-comment (+ task-mention.validator) · task-feed (activity, mentionables) ·
│   │   │   │                          # task-due-reminder (+ .queue) · task-notification.handler/.types · task-asset.port (cổng sang `assets`) · task-publisher
│   │   │   │                          # p4-05 `services/review/` (chấm chéo, cùng module — KHÔNG sửa lõi `task-move.service`): review-config.schema (Zod, nguồn duy nhất
│   │   │   │                          # của `Board.review`) · review-score + reviewer-selector + review-visibility (THUẦN) · review-round.service (open/cancel/approve) ·
│   │   │   │                          # review-round.effect (TaskMoveEffect vào/rời REVIEW, rời DONE) · review-done.policy (TaskMovePolicy chặn DONE `TASK_002`) ·
│   │   │   │                          # review-submit · review-reassign (thủ công + thay thế + co lượt) · review-waive · review-config (+ review-backfill) ·
│   │   │   │                          # review-reconcile (giao lại tự động: rời nhóm/ẩn danh/thành người làm + quét bù) · review-query (GET reviews, /me/reviews) ·
│   │   │   │                          # review-stats · review-publisher (socket sau commit) · review-notification.handler/.types · review-reminders (delayed 24/72 h) ·
│   │   │   │                          # review-events (dòng outbox + jobId) · review-defaults (SystemConfig `pm.review`) · review.deps/.presenter/-errors
│   │   │   │                          # p3-02 P1: board-blueprint (mẫu + sao chép bảng) · board-task-copier (`includeTasks`, đi đúng TaskService.create, trần LIMITS.board.duplicateTasksMax) ·
│   │   │   │                          # đổi `kind` cột sang/khỏi REVIEW → outbox review.backfill mode SYNC (mở/đóng lượt chấm hàng loạt sau commit)
│   │   │   ├── events/               # project-events (tên+payload outbox task.*) · task-event.factory · task-event-sinks (fan-out cho p3-03/p4)
│   │   │   ├── realtime/             # board-room.guard (registerRoomGuard "board") · board-emitter (task:*/board:* qua emitToRoom; p3-03: task:activity)
│   │   │   ├── jobs/                 # board-rebalance-column (queue cron) · task-events.consumer (queue notifications, job `task.events`) ·
│   │   │   │                          # p3-03: task-notification.consumer (sink → notify) · task-due-reminder.job (sink + delayed job `task.due-reminder`) · task-detail-wiring
│   │   │   │                          # p4-05: review-events.consumer (notifications/`review.events` + `review.reminder`) · review-backfill.job (reports/`review.backfill`) ·
│   │   │   │                          # review-reconcile.job (sink `p4-05.review` + reports/`review.membership` + cron TĨNH `review.reconcile`) ·
│   │   │   │                          # review-revoke-listener (`registerRevokeListener`) · review-wiring (composition root cho worker)
│   │   │   ├── repositories/         # board · task · label · task-activity · project-directory · project-stats (+ .inmemory cho unit test); p4-05: task-review (round · review · review-stats);
│   │   │   │                          # p3-03: task-checklist (`$runCommandRaw` + arrayFilters) · task-comment · task-attachment (đọc AssetLink/Asset)
│   │   │   │                          # unit-of-work/prisma-tx: service KHÔNG import Prisma, giao dịch qua `TxContext` mờ
│   │   │   ├── projects.routes.ts admin-projects.routes.ts   # path tuyệt đối, mount root v1; cờ `project` (`requireFeature`) ở từng route
│   │   │   ├── projects.container.ts # DI dùng chung routes + jobs (worker không import routes)
│   │   │   └── index.ts              # registerProjectsModule() — resolver BOARD + guard room `board:` (gọi từ router.ts sau workspaces) + p4-05: `review.policy`/`review.effect`
│   │   │                              # (registry move) + loại thông báo `review.*` + revoke listener chấm chéo
│   │   ├── members/                  # Full (p1-02 thành viên + link mời; p3-04b lời mời EMAIL/khách/duyệt tham gia)
│   │   │   │                          # p1-02: member-query · membership-lifecycle (changeRole/revoke/leave/platformRevoke + p3-04 `expireGuest`) · invite (link)
│   │   │   │                          # p3-04b: invitation-create (mời MEMBER/GUEST, thu hồi, gửi lại, list) · invitation-accept (preview/accept theo token hoặc id, /me/invitations) ·
│   │   │   │                          # guest (PATCH hạn+kênh, CAS expiryVersion) · guest-expiry (+ .schedule: 2 dòng outbox `availableAt`) · join-request (APPROVAL) ·
│   │   │   │                          # admin-access (access-summary, lời mời email che) · invitation-rules/guest-config/invitation-mail (token mã hoá trong outbox)
│   │   │   ├── invitations.routes.ts access.routes.ts    # path tuyệt đối, mount root v1 (lời mời email · khách PATCH + duyệt tham gia)
│   │   │   ├── access.container.ts   # DI dùng chung các route p3-04
│   │   │   ├── jobs/                 # guest-expiry.jobs (guest.expire · guests.expire-sweep cron TĨNH · guest.expiring-notice) · invitation-mail.consumer ·
│   │   │   │                          # membership-revoked.consumer (member:updated + expiresAt riêng OWNER/ADMIN) · invites-expire.job
│   │   │   ├── controllers/ dtos/ entities/ repositories/ services/ tests/
│   │   │   └── members.routes.ts invites.routes.ts admin-members.routes.ts public.ts
│   │   └── workspaces/               # Full (p1-01) — create/list/get/patch/me, archive/restore/transfer/leave,
│   │       │                          # overview (registry contributor), resolver WORKSPACE, admin /admin/workspaces*
│   │       │                          # overview contributor đăng ký qua shared/ports/workspace-overview.port.ts; jobs/workspace-stats.jobs.ts đếm tin/tệp thật
│   │       │                          # theo ngày CRON_TZ (services/workspace-stats.util.ts); archive/restore ghi thêm outbox conversations.workspace-archived|restored
│   │       ├── controllers/ dtos/ entities/ jobs/ repositories/ services/ tests/
│   │       ├── workspaces.routes.ts
│   │       └── admin-workspaces.routes.ts
│   ├── shared/                       # DTO/schema dùng chung nhiều module
│   │   ├── dto/common-schemas.ts     # objectId, pagination, idParam, cursorQuery, expectedVersion, reason
│   │   └── ports/                    # cổng giữa module (không import chéo): channel-bootstrap.port.ts (workspaces→channels),
│   │                                  # block.port.ts (BlockPort — p1-08), message-moderation.port.ts (MessageModerationPort —
│   │                                  # messages cài đặt, moderation dùng), moderation-actions.port.ts (Users/Channel/ConversationAdminPort)
│   │                                  # workspace-overview.port.ts (registry khối overview workspace — channels/… đăng ký, workspaces đọc; p1-01/p1-03)
│   │                                  # channel-creation.port.ts (ChannelCreationPort — workspace-templates tạo kênh, channels cài đặt bằng ChannelService.create; p5-04)
│   │                                  # workspace-template.port.ts (WorkspaceTemplatePort — workspaces tạo nhóm từ mẫu, workspace-templates cài đặt; p5-04)
│   │                                  # asset-scope-gate.port.ts (registry hook theo AssetScope cho POST /assets — `resources` đăng ký RESOURCE, `assets` chỉ tra; p3-01)
│   │                                  # asset-target-access.port.ts (registry quyền ĐỌC asset theo AssetLinkTarget — `study` đăng ký STUDY_ITEM/STUDY_SET_COVER; p4-01)
│   │                                  # report.port.ts (ReportTargetExtension: module sở hữu đích báo cáo mở rộng đăng ký · ReportPort: moderation cung cấp; p4-01)
│   │                                  # contribution-read.port.ts (ContributionReadPort: memberScore/careerScore — `contribution` cài đặt, p6-07/p6-08 dùng; p4-06)
│   │                                  # member-contact.port.ts (MemberContactPort: canMessage/canCall của MemberCard — `conversations` cài đặt, `members` dùng; p1-02)
│   ├── tests/                        # setup.ts (unit, mock Redis), setup.integration.ts (không mock Redis),
│   │                                  # global-setup.ts/global-teardown.ts (MongoMemoryReplSet khi TEST_DB=memory)
│   ├── app.ts                        # Express factory, middleware order
│   ├── router.ts                     # /api/health (+queue) + /api/v1/* (+ /me/notification-preferences)
│   ├── server.ts                     # Startup, validate-runtime, connect DB/Redis, worker in-process, shutdown
│   └── worker.ts                     # Entry riêng cho PROCESS_ROLE=worker (`node dist/worker.js`)
├── prisma/
│   ├── schema.prisma                 # User (RBAC/status/sessionVersion), Session (hash), Asset, AuditLog,
│   │                                  # Notification*, Workspace/WorkspaceMembership (p1-01), Channel/ChannelMembership/
│   │                                  # ChannelGrant (p1-03), Message/MessageReaction/MessageHide (p1-04), Report (p1-08),
│   │                                  # Conversation/ConversationMember (p1-05), UserBlock (p1-08 model, tạo sớm ở
│   │                                  # p1-05 cho eligibility DIRECT — mirror Channel/ChannelMembership đưa vào sớm ở p1-01),
│   │                                  # Thread/ThreadSubscription (p1-06 — reply thread ở kênh + theo dõi),
│   │                                  # SystemConfig, Counter, OutboxEvent
│   └── seed.ts                       # Admin dev từ SEED_ADMIN_EMAIL/PASSWORD — bỏ qua nếu thiếu/production
├── assets/
│   └── fonts/                        # PlusJakartaSans-{Regular,SemiBold}.ttf (OFL, cùng họ font app) — nhúng vào PDF báo cáo đóng góp (p4-06); Dockerfile `COPY assets ./assets`
├── scripts/
│   └── backfill-normalized-name.ts   # Backfill User.normalizedName cho user cũ (tìm kiếm không dấu)
├── .env.example                       # Đầy đủ theo phase — xem docs/plan/config-be.md §1
├── docker-compose.yml                 # Production: redis + api + worker (PROCESS_ROLE tách biệt)
├── docker-compose.dev.yml             # Dev: hạ tầng — KHÔNG chỉnh sửa qua runbook (đã có profile riêng)
├── Dockerfile                         # 2 stage, CMD node dist/server.js (worker override command trong compose)
├── package.json
└── tsconfig.json
```

## Thêm module mới

Dùng `npm run gen:module -- <moduleName> [field1:type ...]`, hoặc tạo thủ công
theo pattern Full trong `.claude/rules/architecture.md` (module đơn giản, ít
business rule → pattern Flat, xem `audit-log`/`capabilities`). Cập nhật lại
`reuse-first.md` khi thêm infra/middleware mới, và bảng ở đây khi thêm module.
