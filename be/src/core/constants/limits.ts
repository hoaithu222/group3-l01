/**
 * Giới hạn nghiệp vụ dùng chung — nguồn cho `capabilities` và validation.
 * Giá trị runtime có thể bị ghi đè bởi `SystemConfig` (admin, Phase 1) nhưng
 * KHÔNG được vượt giới hạn cứng ở đây (vd `upload.maxFileBytes` không vượt
 * `MAX_FILE_SIZE` env).
 */
const KiB = 1024;
const MiB = 1024 * KiB;

export const LIMITS = {
  workspace: {
    nameMin: 2,
    nameMax: 80,
    descriptionMax: 500,
    perUserMax: 50,
    overviewCacheSeconds: 10,
    recentGroupsMax: 5,
  },
  channel: {
    nameMin: 2,
    nameMax: 60,
    descriptionMax: 500,
    pinMax: 20,
    perWorkspaceMax: 200,
    initialMembersMax: 100,
    grantBatchMax: 50,
    discoverPageMax: 50,
    listCacheSeconds: 10,
  },
  message: {
    maxChars: 4_000,
    maxBodyBytes: 64 * 1024,
    attachmentsMax: 5,
    editWindowSeconds: 15 * 60,
    rateBurst: { max: 5, windowSeconds: 5 },
    rateSustained: { max: 60, windowSeconds: 60 },
    /** p1-04 be.md §9 `rate.forward` — 20 lượt chuyển tiếp/phút/người. */
    rateForward: { max: 20, windowSeconds: 60 },
    /** p1-04 be.md §9 `rate.reaction` — 30 lượt react/10s/người. */
    rateReaction: { max: 30, windowSeconds: 10 },
    typingEmitSeconds: 3,
    typingTtlSeconds: 5,
    mentionsMax: 20,
    /** Voice note tối đa 300s (p0-05 §9) — dùng chung với `LIMITS.upload.kinds.VOICE.maxSeconds`. */
    voiceNoteMaxSeconds: 300,
    /** p1-04 be.md §9 — số loại emoji khác nhau tối đa trên 1 tin. */
    reactionsDistinctMax: 20,
    /** p1-04 be.md §9 — số link trích ra tối đa từ nội dung 1 tin. */
    linksMax: 10,
  },
  invite: {
    defaultExpiresHours: 24,
    expiresHoursOptions: [1, 24, 168] as const,
    defaultMaxUses: 10,
    maxUsesMin: 1,
    maxUsesMax: 100,
    acceptRatePerHour: 20,
    activePerWorkspaceMax: 20,
    previewRatePerMinute: 30,
  },
  member: { displayNameMax: 40, listPageMax: 100 },
  pagination: { default: 30, max: 100 },
  /**
   * Upload/asset (p0-05) — allowlist MIME + trần dung lượng THEO KIND, dùng
   * bởi `mime-policy.ts` (nguồn sự thật duy nhất cho kind ↔ mime ↔ maxBytes).
   * `maxFileBytes` là trần tuyệt đối (kind lớn nhất, hiện VIDEO) — vẫn bị
   * chặn thêm bởi `env.MAX_FILE_SIZE` (`min(maxFileBytes, parseSize(env))`).
   */
  upload: {
    maxFileBytes: 100 * MiB,
    kinds: {
      IMAGE: {
        maxBytes: 20 * MiB,
        mime: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic"] as const,
      },
      VIDEO: {
        maxBytes: 100 * MiB,
        mime: ["video/mp4", "video/quicktime"] as const,
      },
      AUDIO: {
        maxBytes: 25 * MiB,
        mime: ["audio/mpeg", "audio/mp4", "audio/aac", "audio/ogg", "audio/wav"] as const,
      },
      VOICE: {
        maxBytes: 10 * MiB,
        maxSeconds: 300,
        mime: ["audio/mp4", "audio/aac", "audio/mpeg", "audio/ogg"] as const,
      },
      FILE: {
        maxBytes: 25 * MiB,
        mime: [
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "text/plain",
          "text/csv",
          "application/zip",
        ] as const,
      },
    },
    /** Thời hạn URL presigned PUT (S3) — thời gian client được phép tải nội dung lên. */
    presignedPutTtlSeconds: 900,
    /**
     * MIME BỔ SUNG theo scope (ngoài `kinds.*.mime`) — chỉ scope nào khai mới có thêm. p3-01 README §2:
     * scope RESOURCE nhận thêm `text/markdown`, `application/json` (mới) + `text/csv`, `audio/mpeg`, `audio/mp4`
     * (đã có ở `kinds.FILE/AUDIO`, liệt kê tường minh cho rõ). Mã nguồn nhận là `text/plain` + đuôi thuộc
     * `resource.codeExtensions`. TASK/TASK_COMMENT KHÔNG khai → dùng allowlist chung. Agent p3-01 nối vào
     * `mime-policy.ts` (kind của các MIME mới = FILE) — KHÔNG thêm HTML/SVG/executable.
     */
    scopeMime: {
      RESOURCE: ["text/markdown", "application/json", "text/csv", "audio/mpeg", "audio/mp4"] as const,
    },
    /**
     * (p4-01 README §7) Scope SIẾT CHẶT hơn allowlist chung: chỉ các kind/MIME liệt kê ở đây được nhận và trần dung lượng
     * riêng từng kind (ghi đè `kinds.*.maxBytes` — chỉ để GIẢM). STUDY: ảnh JPEG/PNG/WebP ≤ 5 MiB, âm thanh mp3/m4a ≤ 10 MiB;
     * mọi kind khác (video, tệp, voice, gif/heic) bị từ chối `ASSET_001`.
     */
    scopeRestrict: {
      STUDY: {
        IMAGE: { maxBytes: 5 * MiB, mime: ["image/jpeg", "image/png", "image/webp"] as const },
        AUDIO: { maxBytes: 10 * MiB, mime: ["audio/mpeg", "audio/mp4"] as const },
      },
      /** (p4-06) Tệp do SERVER sinh — chỉ PDF báo cáo đóng góp ≤ `LIMITS.contribution.exportMaxBytes` (20 MiB). Client không tạo được scope này. */
      REPORT: {
        FILE: { maxBytes: 20 * MiB, mime: ["application/pdf"] as const },
      },
      /** (p6-05) Tệp in O2O — P0 chỉ PDF ≤ 25 MiB (DOCX/PPTX chuyển PDF ở P1). */
      PRINT: {
        FILE: { maxBytes: 25 * MiB, mime: ["application/pdf"] as const },
      },
      /** (p6-05) Ảnh địa điểm O2O — JPEG/PNG/WebP ≤ 5 MiB. */
      LOCATION: {
        IMAGE: { maxBytes: 5 * MiB, mime: ["image/jpeg", "image/png", "image/webp"] as const },
      },
      /** (p4-03) Ảnh huy hiệu gamification — chỉ PNG/WebP ≤ 512 KiB (KHÔNG SVG/JPEG/GIF: SVG chạy được script khi mở trực tiếp). Chỉ người có `gamification:update` tải lên (gate của module `gamification`). */
      BADGE: {
        IMAGE: { maxBytes: 512 * KiB, mime: ["image/png", "image/webp"] as const },
      },
      /** (p6-08) Logo doanh nghiệp (ảnh JPEG/PNG/WebP ≤ 2 MiB = `LIMITS.company.logoMaxBytes`) và JD đính kèm lời mời (PDF ≤ 5 MiB = `LIMITS.offer.jdMaxBytes`). KHÔNG SVG. */
      COMPANY: {
        IMAGE: { maxBytes: 2 * MiB, mime: ["image/jpeg", "image/png", "image/webp"] as const },
        FILE: { maxBytes: 5 * MiB, mime: ["application/pdf"] as const },
      },
      /** (p6-02) Ảnh thu nhỏ bảng trắng (client chụp canvas 512 px) — chỉ PNG/WebP ≤ 1 MiB; KHÔNG SVG/GIF/HEIC. */
      WHITEBOARD: {
        IMAGE: { maxBytes: 1 * MiB, mime: ["image/png", "image/webp"] as const },
      },
      /** (p4-07) Ảnh bìa môn học/ảnh buổi học — JPEG/PNG/WebP ≤ 5 MiB; tài liệu buổi học — PDF ≤ 20 MiB. Chỉ người có `roadmap:update` tải lên (gate của module `roadmap`). KHÔNG SVG (ảnh mockup nhập từ giáo trình lưu inline, không qua endpoint upload). */
      ROADMAP: {
        IMAGE: { maxBytes: 5 * MiB, mime: ["image/jpeg", "image/png", "image/webp"] as const },
        FILE: { maxBytes: 20 * MiB, mime: ["application/pdf"] as const },
      },
    },
    /** Trần TTL cho URL ký đọc nội dung riêng tư (không phải avatar). */
    signedUrlTtlMaxSeconds: 60,
    /** TTL URL avatar (cache lâu hơn — danh sách avatar hiển thị nhiều). */
    avatarUrlTtlSeconds: 3600,
    /**
     * "Ô" thời gian của URL ẢNH HIỂN THỊ (avatar người dùng/nhóm/nhóm chat, ảnh bìa nhóm — `shared/media/display-image.ts`):
     * mọi URL ký trong cùng một ô GIỐNG HỆT nhau (client cache theo URL) và còn hạn 1–2 ô. 1 ngày = đổi URL mỗi ngày,
     * rò rỉ URL chỉ xem được ảnh tối đa ~2 ngày; tăng số này thì cache lâu hơn nhưng URL rò rỉ sống lâu hơn.
     */
    displayImageUrlBucketSeconds: 86_400,
    /** Asset UPLOADING/PROCESSING/READY/REJECTED chưa gắn AssetLink quá giờ này bị `assets.cleanup` xoá. */
    orphanTtlHours: 24,
    avatarMaxBytes: 2 * MiB,
    /** Cạnh dài tối đa của thumbnail (px) — `sharp` resize `fit: "inside"`. */
    thumbMaxPx: 320,
    /** Ảnh ≤ ngưỡng này được xử lý ĐỒNG BỘ trong request `complete` (fast path) thay vì chờ job. */
    fastPathMaxBytes: 2 * MiB,
  },
  presence: { heartbeatSeconds: 30, leaseSeconds: 90, idleAfterMinutes: 5 },
  // p2-03 (be.md §9): phòng thoại kênh VOICE — `emptyRoomEndSeconds` = LiveKit `emptyTimeout` (phòng trống tự đóng), tóm tắt chỉ khi ≥ 60 s.
  voice: { maxParticipants: 8, maxScreenShares: 1, hostReconnectGraceSeconds: 30, emptyRoomEndSeconds: 300, summaryMinDurationSeconds: 60, hostActionPerMinute: 60 },
  /**
   * Cuộc gọi 1:1/nhóm (p2-01, khác `voice` — phòng thoại kênh) — canonical
   * theo p0-07 be.md §3 registry `limits.call` (ringTimeoutSeconds 20–60,
   * ringMaxInvitees/maxParticipants 2–16, reconnectGraceSeconds 10–60,
   * tokenTtlSeconds 300–3600). Chỉ hằng số mặc định — module gọi chưa tồn tại.
   */
  call: {
    // p2-01 (D-17, README §7): đổ chuông 45 s, đổ chuông tối đa 16 người (trước đó placeholder p0-07: 30 s / 8 người).
    ringTimeoutSeconds: 45,
    ringMaxInvitees: 16,
    // p0-08 README §7: 16 (trần technical LiveKit 50; hạ xuống nếu spike MED-11 không đạt ở 4 người).
    maxParticipants: 16,
    reconnectGraceSeconds: 30,
    // p0-08 README §2/§7: token chỉ dùng để KẾT NỐI → 600 s (trước đây đặt 3600 — bằng trần registry 300–3600).
    tokenTtlSeconds: 600,
    // p2-01 (be.md §9) — rate limit + TTL khoá Redis + độ trễ dọn cuộc gọi đổ chuông mồ côi.
    createRatePerMinute: 10,
    invitePerMinute: 30,
    tokenRatePerMinute: 30,
    activeKeyTtlSeconds: 21_600,
    busyKeyTtlSeconds: 21_600,
    staleRingGraceSeconds: 15,
    /** Số giây `JOINING` không thấy trong LiveKit thì reconcile đưa `LEFT`. */
    joiningStaleSeconds: 30,
    /** Cuộc ACTIVE không được đối soát quá số giây này → recovery xếp `call.reconcile`. */
    reconcileStaleSeconds: 120,
    /** Phòng ROOM ngắn hơn số giây này không ghi tin tóm tắt (be.md §5.7 bước 3). */
    summaryMinRoomSeconds: 10,
  },
  /**
   * Hội thoại/kênh nhắn tin — canonical p0-07 be.md §3 `limits.conversation`,
   * chốt bởi p1-05 be.md §7/README §7 (trước đó p1-01 tạm đặt `titleMax:100`,
   * `membersMax:100` lúc module này chưa build — đổi lại đúng be.md §7:
   * `titleMax 80`, `membersMax 200`; `titleMin` mới, dùng bởi `createGroupSchema`).
   */
  conversation: {
    titleMin: 1,
    titleMax: 80,
    membersMax: 200,
    pinMax: 10,
    /** p1-04 be.md §9 chốt 10 (trước đó p1-01 tạm để 5 lúc `conversation`/`forward` chưa có mã thật). */
    forwardTargetsMax: 10,
    /** p1-05 be.md §9 — số hội thoại ghim tối đa/người (`CONV_009`). */
    memberPinnedMax: 20,
    /** p1-05 be.md §9 — số người thêm tối đa/lần gọi `POST /conversations/:id/members`. */
    addMembersBatchMax: 50,
    /** p1-05 be.md §9 — số kết quả tối đa `GET /conversations/people`. */
    peopleSearchLimit: 20,
  },
  /**
   * Lưu trữ ghi âm cuộc gọi/họp (dùng chung, tách khỏi `meeting.recordingRetentionDays`) — p0-07 be.md §3 `limits.recording` (retentionDays 7–365).
   * p2-06 (ghi hình họp): `consentRequestTtlSeconds` hạn một yêu cầu đồng ý; `playbackUrlTtlSeconds` URL phát (900 s — NGOẠI LỆ có chủ đích so với ≤ 60 s:
   * video dài cần range request trong phiên xem, player xin URL mới khi 403); `downloadUrlTtlSeconds` URL tải (dùng ngay); `importMaxAttempts` số lần
   * `recording.import` thử lại; `concurrentMax` số egress đồng thời toàn hệ thống (`REC_003`); `maxMinutes` thời lượng tối đa MỘT lần ghi — `Asset.size`
   * là Int32 (≈ 2 GiB) mà RoomComposite 720p30 ≈ 1,4 GB/giờ nên phải tự dừng trước ngưỡng đó (host bắt đầu ghi lại được); `stuckStartingMinutes`/
   * `stuckStoppingMinutes`/`stuckProcessingMinutes` ngưỡng cron `recording.stuck-check`; `perUserUrlPerMinute` trần xin URL/người.
   */
  recording: {
    retentionDays: 90,
    consentRequestTtlSeconds: 120,
    playbackUrlTtlSeconds: 900,
    downloadUrlTtlSeconds: 60,
    layoutDefault: "GRID" as "GRID" | "SPEAKER",
    importMaxAttempts: 5,
    concurrentMax: 4,
    maxMinutes: 80,
    stuckStartingMinutes: 2,
    stuckStoppingMinutes: 30,
    stuckProcessingMinutes: 120,
    retentionBatch: 200,
    consentRequestPerMinute: 6,
    urlPerMinute: 60,
  },
  /** Biên bản họp (p2-06): trần grapheme của nội dung, số tệp đính kèm, nhắc lại sau khi kết thúc (giờ). */
  meetingRecap: { contentMax: 20_000, attachmentsMax: 10, reminderAfterHours: 24, excerptChars: 280 },
  /**
   * Phòng Pomodoro (p5-02 be.md §9) — khoảng cấu hình chu kỳ (client đọc qua `capabilities.limits.pomodoro`, không hard-code); `emptyRoomEndMinutes` phòng
   * rỗng bao lâu thì phiên ENDED (cũng là `emptyTimeout` của phòng LiveKit); `goalMax` số grapheme của mục tiêu cá nhân; `hostGraceSeconds` chờ
   * bao lâu sau khi chủ phòng rời thì đồng bộ chủ phiên theo failover của `calls`; `commandIdempotencySeconds` TTL kết quả lệnh của chủ phòng
   * (`commandId`); `recoveryLagSeconds` phase quá hạn hơn ngưỡng này (BE chết) → PAUSED `RECOVERY` thay vì tự chuyển phase (không cộng vòng ảo);
   * `maxParticipants` trần chỗ của phòng; `commandPerMinute` rate limit lệnh/người/kênh.
   */
  pomodoro: {
    focusMinutes: { default: 25, min: 5, max: 90 },
    shortBreakMinutes: { default: 5, min: 1, max: 30 },
    longBreakMinutes: { default: 15, min: 5, max: 60 },
    cyclesBeforeLongBreak: { default: 4, min: 2, max: 8 },
    emptyRoomEndMinutes: 5,
    goalMax: 200,
    hostGraceSeconds: 30,
    commandIdempotencySeconds: 3600,
    recoveryLagSeconds: 60,
    maxParticipants: 8,
    commandPerMinute: 30,
  },
  /**
   * Tìm trong kênh/hội thoại (p1-09 be.md §9) — `maxTerms` số từ AND tối đa
   * sau chuẩn hoá; `maxTimeMs` ngân sách thời gian truy vấn Mongo/1 request
   * (hết → `partial:true`); `ratePerMinute` theo người; `snippetChars` số
   * grapheme tối đa của snippet.
   */
  search: {
    queryMin: 2,
    queryMax: 100,
    pageSize: 30,
    indexLagTargetSeconds: 5,
    maxTerms: 8,
    maxTimeMs: 2000,
    ratePerMinute: 30,
    snippetChars: 160,
    /**
     * Tìm toàn workspace (p5-04 be.md §9) — `workspaceScopesMax` số kênh + hội thoại tối đa đưa vào một truy vấn (ưu tiên nơi hoạt động
     * gần nhất, vượt → `meta.truncated`); `defaultLookbackMonths` khoảng lùi mặc định khi không có `from`; `workspaceMaxTimeMs` ngân sách
     * Mongo/1 request (hết mà chưa có kết quả → `SRCH_104`); `peopleScanMax` số thành viên đọc tối đa khi tìm người.
     * Số từ tối đa dùng chung `maxTerms`.
     */
    workspaceScopesMax: 200,
    defaultLookbackMonths: 12,
    workspaceMaxTimeMs: 3000,
    peopleScanMax: 5000,
  },
  /**
   * Xác nhận đã đọc thông báo (p5-04 be.md §9) — `perChannelActiveMax` yêu cầu còn hiệu lực/kênh; `deadlineMaxDays` hạn tối đa;
   * `remindBeforeHours` nhắc người CHƯA xác nhận trước hạn; `receiptsPageMax` trần trang danh sách xác nhận.
   */
  announcement: {
    perChannelActiveMax: 10,
    deadlineMaxDays: 30,
    remindBeforeHours: 24,
    receiptsPageMax: 100,
  },
  /**
   * Khảo sát trong chat (p7-04 be.md §9) — độ dài tính theo grapheme; `closesInMaxDays` hạn chốt tối đa; `closeMinLeadSeconds` hạn phải cách hiện tại ≥ mức này;
   * `voteRate` chặn bầu dồn (theo người); `emitThrottleSeconds` nhịp tối đa của `poll:updated` cho MỘT khảo sát (nhóm 200 người bầu dày).
   */
  poll: {
    optionsMin: 2,
    optionsMax: 10,
    questionMax: 300,
    optionMax: 100,
    closesInMaxDays: 30,
    closeMinLeadSeconds: 60,
    votersPageMax: 100,
    voteRate: { max: 30, windowSeconds: 10 },
    emitThrottleSeconds: 1,
  },
  /**
   * Tin hẹn giờ (p7-04 be.md §9) — `pendingPerUserMax` số tin ĐANG CHỜ của mỗi người; `sendAtMaxDays`/`minLeadSeconds` cửa sổ hẹn; `staleSendingSeconds` một tin kẹt `SENDING`
   * quá mức này (worker chết giữa chừng) được phát lại; `createRate` chặn tạo dồn; `sendRetries` số lần thử lại khi lỗi hạ tầng (BullMQ).
   */
  scheduledMessage: {
    pendingPerUserMax: 50,
    sendAtMaxDays: 30,
    minLeadSeconds: 60,
    staleSendingSeconds: 120,
    createRate: { max: 30, windowSeconds: 3600 },
    sendRetries: 3,
  },
  /** Nhắc lại tin (p7-04 be.md §9) — `pendingPerUserMax` số nhắc ĐANG CHỜ của mỗi người; `remindAtMaxDays`/`minLeadSeconds` cửa sổ hẹn. */
  reminder: {
    pendingPerUserMax: 100,
    remindAtMaxDays: 365,
    minLeadSeconds: 60,
  },
  /** Mẫu workspace (p5-04 be.md §9) — `channelKeysMax` số kênh chọn khi áp/tạo; `templateChannelsMax` số kênh trong một mẫu; `applyRatePerHour` lượt áp mẫu/giờ/người. */
  workspaceTemplate: {
    channelKeysMax: 20,
    templateChannelsMax: 15,
    applyRatePerHour: 20,
  },
  /** Tin đã lưu (p1-09 be.md §9) — `max` bản ghi/người; `ratePerMinute` lượt lưu/phút/người (be.md §4 `scopeLimiter("save")`). */
  saved: { max: 1000, ratePerMinute: 60 },
  notification: {
    pushBatchWindowSeconds: 10,
    inboxRetentionDays: 90,
    maxDevicesPerUser: 10,
    fcmBatchSize: 500,
    voipTtlSeconds: 60,
    callSignalTtlSeconds: 60,
    defaultMode: "MENTIONS" as const,
    tokenStaleDays: 60,
    revokedTokenPurgeDays: 30,
    deviceRegisterRatePerHour: 30,
    /** p1-07 be.md §9 — số người xử lý/lô khi fan-out 1 tin (`fanout.message`). */
    fanoutChunkSize: 500,
    /** p1-07 — trích nội dung tối đa (grapheme) trong push `lockScreenPreview=FULL`. */
    previewMaxChars: 100,
    /** p1-07 — trích nội dung tối đa (grapheme) của `InboxItem.context.excerpt`. */
    inboxExcerptMaxChars: 120,
    /** p1-07 — TTL cache Redis đếm chưa đọc (`unread:summary:<u>`, `unread:ch:<u>:<ch>`). */
    unreadCacheSeconds: 10,
    /** p1-07 — trần đếm chưa đọc 1 kênh (`100+`). */
    unreadCountCap: 100,
    /** p1-07 — TTL khoá `viewing:<u>:<scopeKey>` (p0-03 gia hạn theo heartbeat 30 s). */
    viewingTtlSeconds: 70,
    /** p1-07 — số ngày lưu dữ liệu thống kê thông báo trong Redis (`admin/notifications/stats`). */
    statsRetentionDays: 8,
    /**
     * p1-07 be.md §2/§9 — mặc định cài đặt thông báo khi người dùng chưa chọn (khoá
     * `SystemConfig` `notification.defaults`, admin ghi đè). 1-1/nhóm mặc định `ALL`
     * (Messenger-like), kênh `MENTIONS_AND_THREADS` — KHÁC `defaultMode: "MENTIONS"`
     * bên trên (giữ cho pipeline `deliver.recipient` phi tin nhắn của p0-06).
     */
    defaults: {
      directMode: "ALL" as const,
      groupMode: "ALL" as const,
      channelMode: "MENTIONS_AND_THREADS" as const,
      lockScreenPreview: "HIDDEN" as const,
      sound: true,
    },
  },
  /**
   * Thẻ (p3-02 README §7 + p3-03 README §7). `dependenciesMax` do p4-04 dùng (giữ nguyên).
   * `trashRetentionDays`: sau ngần này ngày thẻ đã xoá KHÔNG còn khôi phục được (`TASK_016`) — thẻ vẫn
   * là dữ liệu đóng góp lịch sử (p4-06), KHÔNG xoá cứng.
   */
  task: {
    titleMax: 200,
    perBoardMax: 5000,
    assigneesMax: 10,
    labelsPerTaskMax: 10,
    descriptionMax: 20_000,
    checklistMax: 100,
    checklistItemMax: 200,
    attachmentsMax: 10,
    commentMax: 4000,
    commentAttachmentsMax: 5,
    /** Sửa bình luận trong 15 phút (`TASK_015`). */
    commentEditWindowSeconds: 900,
    dueReminderHoursBefore: 24,
    trashRetentionDays: 30,
    storyPointsMax: 100,
    dependenciesMax: 50,
    /** p4-04: số cạnh tối đa được duyệt khi kiểm vòng/dựng đồ thị con — vượt → `TASK_021`. */
    dependencyGraphVisitMax: 5000,
    /** p4-04: dời ≤ ngần này thẻ thì áp đồng bộ, lớn hơn → lô nền. */
    rescheduleSyncMax: 200,
    /** p4-04: trần số thẻ một lần dời (vượt → `TASK_021`). */
    rescheduleBulkMax: 5000,
    /** p4-04: dời ≤ ngần này thẻ thì phát `task:updated` từng thẻ, lớn hơn → một `board:rescheduled`. */
    rescheduleEmitEachMax: 50,
    /**
     * p4-04: lô dời lịch nền `QUEUED`/`RUNNING` quá ngần này phút (tính từ lúc tạo/bắt đầu chạy) bị cron TĨNH `reschedule-batch.sweep`
     * coi là treo → `FAILED` + nhả `activeKey`. Lô tối đa `rescheduleBulkMax` thẻ chạy vài phút; retry BullMQ (3 lần, backoff) cũng nằm gọn trong đó.
     */
    rescheduleBatchStaleMinutes: 30,
    /** p4-04: số lô treo tối đa xử lý mỗi lượt quét (lượt sau xử lý tiếp phần còn lại). */
    rescheduleBatchSweepMax: 100,
    /** p3-03 (P1): số người theo dõi tối đa trả về trong `GET /tasks/:id/watchers` (và nạp khi gửi thông báo). */
    watchersListMax: 200,
  },
  /** p4-04 (P1): `GET /boards/:id/gantt` — khoảng ngày tối đa và số thẻ tối đa (vượt → `truncated`). */
  gantt: {
    rangeMaxDays: 366,
    tasksMax: 2000,
  },
  /**
   * Chấm chéo (p4-05 README §7): `requiredMax` số lượt duyệt tối đa/thẻ, rubric ≤ `rubricCriteriaMax` tiêu chí (tên/mô tả/điểm tối đa),
   * `feedbackMax` nhận xét, `reopenGraceMinutes` = mở lại thẻ khỏi DONE trong ngần này phút thì GIỮ kết quả duyệt (kéo nhầm),
   * `historyRoundsMax` số lượt cũ trả trong `GET /tasks/:id/reviews`. `reviewerPoolMax` = trần nhóm người chấm giới hạn (P1);
   * `candidateScanMax` = số thành viên đọc tối đa khi chọn người chấm (nhóm lớn hơn vẫn ra kết quả đúng cho phần đầu danh sách).
   */
  review: {
    requiredMax: 5,
    rubricCriteriaMax: 10,
    criterionLabelMax: 80,
    criterionDescriptionMax: 300,
    criterionMaxScoreMax: 100,
    feedbackMax: 2000,
    reopenGraceMinutes: 10,
    historyRoundsMax: 20,
    reviewerPoolMax: 200,
    candidateScanMax: 2000,
    /** Trần phần tử một lần quét đối soát (`review.reconcile`) — nhóm lớn hơn được xử lý dần qua các lượt sau. */
    reconcileScanMax: 2000,
  },
  /**
   * Báo cáo đóng góp & heatmap (p4-06 README §7): `heatmapRangeMaxDays` khoảng ngày tối đa của một lần xem heatmap (vượt → `CONTRIB_004`),
   * `exportsPerUserPerHour` số lần xuất PDF/giờ/người/bảng (429), `exportRetentionDays` hạn giữ tệp PDF, `recomputeDebounceSeconds` gom nhiều
   * thay đổi fact vào một lần tính lại, `weekCacheSeconds` cache báo cáo theo tuần, `memberTasksPageMax` trần trang danh sách thẻ theo người,
   * `exportMaxBytes` trần tệp PDF. `heatmapFreshSeconds` = khoảng tối thiểu giữa hai lần tính lại ô heatmap gần đây khi có người xem,
   * `activityLiveDays` = số ngày gần nhất (gồm hôm nay) được tính lại từ nguồn, `activityDirtyBatchMax` = số bảng "bẩn" xử lý mỗi lượt job 15 phút.
   */
  contribution: {
    heatmapRangeMaxDays: 366,
    exportsPerUserPerHour: 5,
    exportRetentionDays: 30,
    recomputeDebounceSeconds: 60,
    weekCacheSeconds: 300,
    memberTasksPageMax: 50,
    exportMaxBytes: 20 * 1024 * 1024,
    heatmapFreshSeconds: 60,
    activityLiveDays: 2,
    activityDirtyBatchMax: 200,
  },
  /** Bảng (p3-02 README §7). `positionKeyMaxLength`: khoá vị trí dài hơn → job `board.rebalance-column`. */
  board: {
    columnsMax: 12,
    perWorkspaceMax: 20,
    nameMax: 80,
    labelsMax: 50,
    columnTitleMax: 40,
    positionKeyMaxLength: 50,
    /** `POST /boards/:id/duplicate { includeTasks }` — số thẻ tối đa sao chép trong MỘT yêu cầu (mỗi thẻ đi đúng đường `TaskService.create`); nhiều hơn → `tasksTruncated`. */
    duplicateTasksMax: 100,
  },
  /** Kho tài liệu (p3-01 README §7). `workspaceQuotaBytes` 2 GiB > Int32 — dùng `number` (an toàn tới 2^53). */
  resource: {
    folderDepthMax: 8,
    folderNameMax: 120,
    resourceNameMax: 200,
    descriptionMax: 1000,
    tagsMax: 10,
    workspaceQuotaBytes: 2 * 1024 * MiB,
    trashRetentionDays: 30,
    codePreviewMaxBytes: 512 * 1024,
    /** Đuôi tệp `text/plain` được coi là CODE (`resource-type.resolver`). */
    codeExtensions: [
      "js", "jsx", "ts", "tsx", "py", "java", "kt", "c", "h", "cpp", "cs", "go", "rs", "rb", "php",
      "swift", "sql", "md", "json", "yaml", "yml", "xml", "sh", "css", "scss",
    ] as const,
    listCacheSeconds: 60,
  },
  /**
   * Khách (GUEST) — p3-04 README §7. `enabledByDefault`: giá trị mặc định của `Workspace.guestPolicy.enabled`
   * khi nhóm chưa thiết lập (SystemConfig `guest.enabledByDefault`, README §7); client đọc qua
   * `capabilities.limits.guest.enabledByDefault` (README §5 ghi `limits.invite.guestEnabled` — xem D-28 mục 4).
   */
  guest: {
    defaultDays: 30,
    maxDays: 90,
    maxPerWorkspace: 20,
    designatedChannelsMax: 10,
    expiringNoticeHours: 48,
    enabledByDefault: false,
  },
  /** Lời mời đích danh theo email (p3-04) — KHÁC `invite` (liên kết mời p1-02). */
  invitation: { expiresDays: 7, perWorkspacePerDayMax: 50, resendCooldownHours: 12 },
  /**
   * Bộ học & flashcard (p4-01 README §7) — canonical `limits.study`. `bulkOpsMax` = số phần tử tối đa của
   * `upsert[]`/`delete[]` trong một lần `PUT /study-sets/:id/items`; `bodyMaxBytes` = trần thân yêu cầu của route đó.
   * p4-02/p5-01 đọc `itemsPerSetMax`/`optionsMax` từ đây (không khai lại).
   */
  study: {
    setTitleMax: 120,
    setDescriptionMax: 1000,
    tagsMax: 10,
    tagMax: 30,
    itemsPerSetMax: 500,
    bulkOpsMax: 500,
    promptMax: 2000,
    optionsMin: 2,
    optionsMax: 6,
    optionTextMax: 300,
    acceptedAnswersMax: 10,
    acceptedAnswerMax: 200,
    explanationMax: 2000,
    itemTagsMax: 5,
    setsPerUserMax: 300,
    bodyMaxBytes: 2 * MiB,
    /** Số lỗi mục tối đa trả trong `details` của STUDY_001 (gom hết nhưng không phình response). */
    errorDetailsMax: 50,
    /** Thẻ phổ biến: số thẻ trả về + thời gian cache (giây). */
    popularTagsMax: 30,
    popularTagsCacheSeconds: 600,
    /** Điểm cắm cho hàng đợi kiểm duyệt: từ ngưỡng này bộ được đánh dấu ưu tiên (README be.md §7). */
    reportedPriorityThreshold: 5,
  },
  /**
   * Lộ trình học (p4-07 README §8) — canonical `limits.roadmap`. `bodyMdMaxChars`/`blocksMaxBytes` chặn buổi quá khổ;
   * `svgMaxBytes` áp cho từng `RoadmapMedia.svg` (ảnh mockup import); `lessonCacheSeconds` = TTL gợi ý cho `ETag`/cache client.
   */
  roadmap: {
    subjectsMax: 50,
    phasesPerSubjectMax: 24,
    lessonsPerSubjectMax: 400,
    bodyMdMaxChars: 200_000,
    blocksMaxBytes: 1_000_000,
    resourcesPerLessonMax: 60,
    mediaPerLessonMax: 40,
    svgMaxBytes: 200_000,
    checklistMax: 80,
    practiceSetsMax: 10,
    noteMax: 2000,
    lessonCacheSeconds: 600,
  },
  /**
   * Thi thử (p4-02 README §7). `expireGraceSec` = độ trễ mạng cho phép sau `expiresAt`; `attemptsPerSetPerDayMax` đếm theo ngày địa phương
   * của người thi; `answersBatchMax` = số đáp án tối đa một lần `PUT /mock-attempts/:id/answers`.
   */
  mock: {
    durationMaxSec: 3 * 3600,
    durationMinSec: 60,
    questionsMax: 200,
    expireGraceSec: 5,
    eventsMax: 200,
    attemptsPerSetPerDayMax: 20,
    answersBatchMax: 50,
    /** Số tag tối đa của `byTag` trước khi gộp phần còn lại vào `__other`. */
    byTagMax: 8,
    /** Ngưỡng đạt mặc định (%). */
    passPctDefault: 50,
  },
  /**
   * Live quiz (p5-01 README §7). `answerGraceMs` = độ trễ cộng thêm cho job đóng câu (job chạy SAU hạn; server vẫn chấm theo
   * thời điểm nhận thực tế, không nới hạn); `keepAfterEndSeconds`/`keepAfterPersistSeconds` = TTL khoá Redis sau khi kết thúc
   * (chờ ghi kết quả bền) / sau khi đã ghi; `stale*Minutes` = ngưỡng cron dọn phiên treo.
   */
  liveQuiz: {
    playersMax: 100,
    secondsPerQuestion: { min: 5, max: 120, default: 20 },
    questionsMax: 50,
    revealSeconds: 5,
    revealSecondsMax: 30,
    hostGraceSeconds: 30,
    pinTtlMinutes: 120,
    scoring: { base: 1000, speedBonus: 500 },
    leaderboardTop: 10,
    nicknameMax: 30,
    answerGraceMs: 300,
    pinAttempts: 10,
    joinPerMinute: 10,
    keepAfterEndSeconds: 6 * 3600,
    keepAfterPersistSeconds: 3600,
    staleWaitingMinutes: 120,
    staleInProgressMinutes: 30,
    historyPageMax: 50,
  },
  /**
   * Ôn tập ngắt quãng SM-2 (p4-02 README §7). `newPerDay`/`newPerDayMax` = thẻ MỚI đưa vào hàng đợi mỗi ngày (mặc định/trần);
   * `reminderLocalHour` = giờ địa phương gửi nhắc "N thẻ cần ôn hôm nay"; `reviewLogRetentionDays` = số ngày nhật ký ôn dùng tính chuỗi ngày.
   */
  sr: {
    dueBatch: 50,
    newPerDay: 20,
    newPerDayMax: 100,
    intervalMaxDays: 365,
    reviewsPerDayMax: 1000,
    reminderLocalHour: 7,
    reviewLogRetentionDays: 400,
  },
  /** Huy hiệu (p4-03 README §7). */
  badge: { showcaseMax: 6, criteriaClausesMax: 10, codeMax: 40, nameMax: 60, descriptionMax: 300 },
  leaderboard: { top: 50, cacheSeconds: 300 },
  /**
   * XP/cấp độ (p4-03 README §7). `minTaskAgeSec` = tuổi tối thiểu của thẻ (từ lúc tạo tới lúc hoàn thành) để được cộng XP;
   * `storyPointsMultiplierMax` kẹp hệ số story points; `adjustMaxAbs` = trần một lần admin điều chỉnh XP.
   */
  gamification: {
    adjustMaxAbs: 1000,
    minTaskAgeSec: 120,
    minTaskAgeSecMax: 3600,
    storyPointsMultiplierMax: 5,
    xpEventsPageMax: 50,
    /** Số phần tử `thresholdsPreview` trả cho admin. */
    levelPreviewCount: 20,
    /** Thời gian cache luật XP (giây) — sửa luật có hiệu lực ≤ ngần này. */
    ruleCacheSeconds: 60,
    /** Cỡ lô khi backfill huy hiệu. */
    backfillBatch: 500,
    /** Số huy hiệu tối đa mỗi lần đánh giá/hiển thị danh mục. */
    catalogMax: 200,
  },
  /**
   * Huy hiệu kỹ năng xác thực (p6-06 README §7). Điểm story points / điểm review LƯU ×10 số nguyên (`…X10`); `creditMinStoryPoints` là mặc định
   * của khoá SystemConfig `skill` (admin chỉnh được); `reevaluateCooldownSeconds` = limiter "Đánh giá lại toàn bộ" (1 lần/giờ, `SKILL_006`).
   */
  skill: {
    labelMatchMax: 10,
    labelMax: 40,
    codeMax: 40,
    nameMax: 60,
    descriptionMax: 300,
    iconMax: 60,
    orderMax: 1000,
    requiredTasksDoneMin: 1,
    requiredTasksDoneMax: 500,
    minStoryPointsMax: 5000,
    peerScoreMax: 10,
    proofTasksMax: 5,
    definitionsMax: 200,
    creditMinStoryPoints: 1,
    creditMinStoryPointsMax: 100,
    batch: 500,
    reevaluateCooldownSeconds: 3600,
    labelSuggestionsMax: 20,
    previewSampleMax: 5,
  },
  roles: { maxPerWorkspace: 20, nameMax: 40 },
  /**
   * (p6-01 README §7) Real-time Docs. `stateMaxBytes` 5 MiB vì Mongo giới hạn 16 MB/document (chừa chỗ cho snapshot/metadata); `concurrentEditorsMax` áp ở service
   * `collab/` (BE trả qua `GET /internal/documents/:id/access` → `limits.maxConnections`). Admin chỉ HẠ được các trần có trong `SYSTEM_CONFIG_REGISTRY` (`limits.document`).
   */
  document: {
    titleMax: 200,
    collaboratorsMax: 50,
    concurrentEditorsMax: 50,
    /** Số bản AUTO giữ lại (cron mỗi giờ, chỉ khi có thay đổi). */
    snapshotsAuto: 30,
    snapshotsManualMax: 100,
    /** Số bản PRE_RESTORE (tự tạo trước mỗi lần khôi phục) giữ lại. */
    preRestoreKeep: 10,
    stateMaxBytes: 5 * MiB,
    plainTextMaxBytes: 100 * KiB,
    perWorkspaceMax: 500,
    /** Collab token sống 5 phút; client xin lại khi còn 60 s. */
    collabTokenTtlSeconds: 300,
    collabTokenPerMinute: 30,
    /** Tài liệu/lượt chụp AUTO xử lý mỗi lô của cron `collab.snapshot-hourly` (runner của tài liệu). */
    snapshotBatch: 200,
  },
  /**
   * (p6-02 README §7) Bảng trắng cộng tác. `stateMaxBytes` 8 MiB (Mongo 16 MB/document: state + metadata còn dư; collab đặt trần 9 MiB để báo sớm, BE là nơi quyết định);
   * `elementsMax` do BE đếm từ Yjs mỗi lần nhận state (`WB_007`). `concurrentEditorsMax`/`awarenessHzServerMax` áp ở service `collab/` (BE trả `maxConnections` qua
   * `GET /internal/whiteboards/:id/access`). Chưa có khoá SystemConfig `limits.whiteboard` (kế hoạch p6-02 không đòi) — đọc thẳng hằng số này.
   */
  whiteboard: {
    nameMax: 120,
    elementsMax: 5000,
    stateMaxBytes: 8 * MiB,
    perWorkspaceMax: 200,
    collaboratorsMax: 50,
    concurrentEditorsMax: 30,
    /** Awareness client gửi tối đa (lần/giây) và ngưỡng server bỏ tin (lần/giây) — collab đọc `WB_AWARENESS_MAX_HZ`; BE chỉ giữ hằng để app/collab đối chiếu. */
    awarenessHzClient: 30,
    awarenessHzServerMax: 60,
    /** Số bản AUTO giữ lại (cron mỗi giờ, chỉ khi có thay đổi). */
    snapshotsAuto: 20,
    snapshotsManualMax: 100,
    /** Số bản PRE_RESTORE (tự tạo trước mỗi lần khôi phục) giữ lại. */
    preRestoreKeep: 10,
    /** Collab token dùng chung TTL với tài liệu (`LIMITS.document.collabTokenTtlSeconds`); giới hạn xin token/người/phút. */
    collabTokenPerMinute: 30,
    /** Bảng/lượt chụp AUTO xử lý mỗi lô của cron `collab.snapshot-hourly`. */
    snapshotBatch: 200,
    /** Trần từng phần tử (schema `contracts/whiteboard-elements.schema.json`): ký tự chữ, số toạ độ nét tự do. */
    elementTextMax: 2000,
    freehandPointsMax: 1000,
  },
  /** Phase 2 (p2-04) — canonical p0-07 be.md §3 `limits.meeting` (remindersMax ≤3, attendeesMax ≤200, joinWindowMinutes 0–60, maxParticipants ≤50, maxMinutes ≤480). */
  meeting: {
    // p2-04 (README §7, D-18): 240 phút / 200 người / cửa sổ vào 10 phút (placeholder p0-07 trước đó: 180 / 100 / 15).
    maxMinutes: 240,
    recordingRetentionDays: 90,
    remindersMax: 3,
    attendeesMax: 200,
    joinWindowMinutes: 10,
    maxParticipants: 50,
    titleMax: 255,
    agendaMax: 2000,
    locationMax: 255,
    reminderOptionsMinutes: [5, 10, 15, 30, 60, 1440] as readonly number[],
    coHostsMax: 10,
    scheduleMaxDurationMinutes: 1440,
    restartWindowMinutes: 60,
    rangeMaxDays: 62,
    rangeListMax: 500,
    createPerHour: 30,
    invitePerHour: 50,
    resolvePerMinute: 30,
    /** Cho phép đặt lịch lùi tối đa số giây (đồng hồ thiết bị lệch) — quá thì `MEET_004`. */
    startAtSkewSeconds: 60,
    /** Cron `meeting.reminder-reconcile` quét cuộc họp bắt đầu trong khoảng này (giờ). */
    reminderReconcileHorizonHours: 25,
    // ── p2-05 phòng họp (be.md §9) — hằng nội bộ, KHÔNG nằm trong registry `limits.meeting` (admin chỉ chỉnh 8 khoá của p2-04) ──
    /** LiveKit `emptyTimeout`: phòng trống quá số giây này thì đóng → `room_finished` → cuộc họp `ENDED/EMPTY`. */
    emptyRoomTimeoutSeconds: 300,
    /** Cảnh báo "sắp tự kết thúc" trước giờ tự đóng (phút). */
    closingWarningMinutes: 5,
    /** TTL hàng đợi phòng chờ (lobby) trên Redis (giờ). */
    lobbyTtlHours: 4,
    /** Người được duyệt phải gọi `join` lại trong số giây này, quá hạn phải xin vào lại. */
    admittedTtlSeconds: 600,
    /** Bị từ chối: chặn xin vào lại trong số giây này (chống spam). */
    deniedTtlSeconds: 600,
    /** Phòng đã khoá: người từng vào phiên này rớt mạng vẫn vào lại được trong số giây này. */
    rejoinAfterLockSeconds: 300,
    /** Người từng vào phiên này vào lại không phải qua phòng chờ nếu chưa quá số giây này kể từ lần rời cuối. */
    lobbyRejoinSeconds: 3600,
    /** Phiên họp bắt đầu lại sát hạn `endAt + restartWindow` vẫn chạy tối thiểu số phút này trước khi tự đóng. */
    minRestartRunMinutes: 15,
    /** Slot dự phòng cho `maxParticipants` của phòng LiveKit (chủ trì/đồng chủ trì luôn vào được kể cả khi đầy). */
    roomSpareSlots: 2,
    /** Tần suất tự sửa cuộc họp LIVE lệch với cuộc gọi (phút) — cron `meeting.room-reconcile`. */
    roomReconcileEveryMinutes: 2,
    /** Số thao tác host mỗi phút (mute/remove/lock…) để chặn lạm dụng. */
    hostActionPerMinute: 60,
    startPerMinute: 10,
    joinPerMinute: 20,
  },
  /** Lịch lặp lại (P1, p2-04). */
  meetingSeries: { windowDays: 60, occurrencesMax: 50 },
  /**
   * (p2-07 be.md §9) Vận hành gọi & họp toàn nền tảng — hằng CỐ ĐỊNH, không ghi đè qua `SystemConfig`. `statsRangeMaxDays`: trần khoảng thống kê
   * (`ADMIN_MEDIA_001`); `healthTimeoutMs`: trần mỗi phần của `/admin/media/health`; `*CacheSeconds`: cache Redis; `listLimitMax`: trần dòng/trang.
   * `setupSuccessSeconds`: ngưỡng "kết nối thành công" (JOINING → CONNECTED ≤ 20 s). `overviewCacheSeconds`: KPI dashboard.
   */
  adminMedia: {
    statsRangeMaxDays: 92,
    statsCacheSeconds: 300,
    healthTimeoutMs: 3000,
    healthCacheSeconds: 15,
    listLimitMax: 50,
    setupSuccessSeconds: 20,
    overviewCacheSeconds: 60,
    webhookSilentMinutes: 5,
    turnProbeStaleMinutes: 10,
    egressFailedDegradedCount: 3,
    callsQueueWaitingDegraded: 50,
    emitThrottleMs: 1000,
  },
  /** p6-03 README §7 — Mentor Connect (bảng tin tìm cố vấn, đợt cố vấn = khách có hạn). */
  mentor: {
    postsOpenPerWorkspace: 3,
    titleMin: 5,
    titleMax: 120,
    descriptionMin: 20,
    descriptionMax: 3000,
    skillsMax: 10,
    skillMax: 40,
    commitmentHoursMax: 20,
    mentorsNeededMax: 3,
    expiresInDays: { min: 3, max: 60 },
    applicationsPendingPerUser: 10,
    applyPerHour: 10,
    messageMin: 20,
    messageMax: 1000,
    durationDays: { min: 7, max: 60, default: 30 },
    totalDaysMax: 90,
    channelsMax: 10,
    includeMembersMax: 20,
    endingSoonDays: 3,
    /** Số đợt/bài tối đa mỗi lượt cron (`mentor.expire`, `mentor.ending-soon`, `mentor.post-expire`). */
    cronBatch: 200,
  },
  /** (p6-05 README §7) In ấn O2O & địa điểm — module `o2o`. */
  o2o: {
    radiusDefaultM: 2000,
    radiusMinM: 100,
    radiusMaxM: 10_000,
    nearLimit: 50,
    orderPagesMax: 500,
    copiesMax: 50,
    pinAttemptsMax: 5,
    pinLockMinutes: 15,
    pendingExpireHours: 24,
    readyExpireDays: 7,
    /** READY còn ≤ ngần này giờ tới hạn → nhắc `print-order.expiring` một lần. */
    expiringNoticeHours: 24,
    /** DRAFT/QUOTED bỏ dở quá ngần này giờ → cron chuyển CANCELLED (dọn đơn nháp). */
    draftExpireHours: 72,
    /** Tiệm còn tải được tệp ngần này giờ sau khi đơn kết thúc (PICKED_UP/CANCELLED/EXPIRED/REJECTED). */
    fileAccessGraceHours: 24,
    /** ⚠ URL ký thực tế bị chặn bởi `upload.signedUrlTtlMaxSeconds` (60 s) của module `assets` — xem README p6-05 §2. */
    fileUrlTtlSeconds: 600,
    /** Tệp in (PDF) tối đa — cũng là `upload.scopeRestrict.PRINT`. */
    fileMaxBytes: 25 * MiB,
    reviewCommentMax: 500,
    photosMax: 8,
    openHoursMax: 14,
    submitPerHour: 10,
    rejectReasonMin: 3,
    rejectReasonMax: 200,
    cronBatch: 200,
    timezone: "Asia/Ho_Chi_Minh",
    /** Tâm mặc định khi người dùng không cấp quyền vị trí (khuôn viên — Hà Nội). */
    defaultCenter: { lat: 21.0285, lng: 105.8542 },
    amenities: ["wifi_fast", "power_outlets", "quiet_zone", "ac", "open_late", "group_tables", "printer", "parking"] as const,
  },
  /**
   * p6-07 Portfolio một chạm (README §7). Độ dài đếm theo grapheme ở cả client lẫn server. `htmlMaxBytes` = trần trang HTML dựng ra (vượt → build FAILED);
   * `slugReserveDays` = số ngày giữ slug cũ để chuyển hướng 301; `purgeDelayMinutes` = trễ xoá object build sau khi Unpublish/thay bằng build mới (trần nginx 5 phút
   * + dư); `staleBuildMinutes` = build BUILDING/QUEUED quá hạn này bị cron `portfolio.stale-build-reaper` chuyển FAILED.
   */
  portfolio: {
    projectsMax: 12,
    slugMin: 3,
    slugMax: 30,
    displayNameMin: 2,
    displayNameMax: 60,
    headlineMax: 120,
    bioMax: 600,
    linksMax: 6,
    linkLabelMax: 30,
    linkUrlMax: 300,
    projectTitleMin: 2,
    projectTitleMax: 80,
    summaryMax: 500,
    roleMax: 60,
    highlightsMax: 3,
    highlightMax: 160,
    namedTeammatesMax: 10,
    refreshPerHour: 10,
    publishPerHour: 20,
    slugCheckPerMinute: 60,
    htmlMaxBytes: 2 * MiB,
    slugReserveDays: 30,
    buildTimeoutSec: 60,
    purgeDelayMinutes: 10,
    staleBuildMinutes: 5,
    /** Bản ghi `PortfolioSlugReservation` hết hạn xoá mỗi lượt cron (trần an toàn). */
    reservationCleanupBatch: 500,
    /** `SystemConfig portfolio.bannedSlugTerms`: tối đa số từ và độ dài mỗi từ. */
    bannedTermsMax: 500,
    bannedTermMax: 30,
  },
  /**
   * p6-08 Recruiter board (README §7). `expiresDays` = lời mời SENT/READ quá ngần này ngày tự EXPIRED; `perRecruiterPerHour` = trần gửi lời mời/HR/giờ (`scopeLimiter`);
   * `threadMessagesPerDay` = trần tin/ngày/lời mời (theo cửa sổ 24 giờ cố định); `listPageMax` = trần trang danh sách lời mời/thành viên.
   */
  offer: {
    messageMax: 2000,
    messageMin: 20,
    titleMin: 3,
    titleMax: 120,
    locationMax: 60,
    expiresDays: 30,
    perRecruiterPerHour: 20,
    threadMessageMax: 2000,
    threadMessagesPerDay: 50,
    listPageMax: 50,
    jdMaxBytes: 5 * MiB,
  },
  /** `searchCacheSeconds` = TTL cache kết quả tìm (trần "biến mất khỏi kết quả" ≤ 1 phút, cả cache); `indexDebounceSeconds` = trễ job dựng lại index; `reconcileStaleDays` = index cũ hơn ngần này ngày bị dựng lại ở cron đối soát. */
  talent: {
    searchPageMax: 50,
    filterSkillsMax: 10,
    profileViewsPerDay: 300,
    indexDebounceSeconds: 60,
    searchCacheSeconds: 60,
    reconcileStaleDays: 7,
    reconcileBatch: 500,
    displayedSkillsMax: 6,
    headlineMax: 120,
    locationMax: 60,
    preferredRolesMax: 5,
    preferredRoleMax: 40,
    keywordMax: 100,
  },
  /** Doanh nghiệp tuyển dụng (p6-08). `registrationsPerUserPerDay` = trần `POST /companies`/người/ngày; `logoMaxBytes` = trần logo (scope `COMPANY`, ảnh). */
  company: {
    nameMax: 120,
    descriptionMax: 2000,
    industryMax: 60,
    membersMax: 20,
    registrationsPerUserPerDay: 3,
    logoMaxBytes: 2 * MiB,
    /** Doanh nghiệp/trang ở danh sách vận hành. */
    adminPageMax: 100,
    /** Khoảng thống kê tối đa (`GET /admin/recruiter/stats`). */
    statsMaxDays: 366,
    /** Hạn mức lời mời/tháng theo gói — mặc định của `SystemConfig recruiter.offerQuotaByTier` (ghi đè từng công ty bằng `Company.offerQuotaOverride`). */
    offerQuotaByTier: { FREE: 5, PRO: 50, ENTERPRISE: 500 },
    /** Phiên bản chính sách dữ liệu sinh viên mặc định (`SystemConfig recruiter.consentVersion`) — sinh viên đồng ý phiên bản này khi bật Open to work. */
    defaultConsentVersion: "v1",
  },
  deletion: { graceDays: 7 },
  auth: {
    sessionsMax: 10,
    /**
     * Đếm lần nhập SAI mật khẩu/mã xác minh theo TÀI KHOẢN (`PasswordAttemptGuard`,
     * bổ sung cho `authLimiter` theo IP): sai `failedAttemptsMax` lần trong
     * `windowSeconds` ⇒ khoá `lockSeconds`.
     */
    passwordAttempts: { failedAttemptsMax: 5, windowSeconds: 900, lockSeconds: 900 },
    biometric: {
      credentialMaxAgeDays: 90,
      failedAttemptsMax: 5,
      perUserMax: 5,
      secretBytes: 32,
      loginRate: { max: 10, windowSeconds: 900 },
      /** `auth.biometric-cleanup` (cron tuần) xoá bản ghi REVOKED quá hạn này. */
      revokedRetentionDays: 180,
    },
    appLock: { lockAfterBackgroundSeconds: { default: 300, min: 60, max: 3600 } },
  },
  ai: { inputTokensMax: 120_000, jobsPerUserPerHour: 30, assistantTurnsMax: 20 }, // ⏸ D-13
  outbox: { retentionDays: 7, failedRetentionDays: 30, maxAttempts: 10 },
  /** `core/permission` (p0-02) — cache Redis theo version + timeout gọi resolver. */
  permission: { cacheTtlSeconds: 60, resolverTimeoutMs: 2000 },
  /** p1-06 be.md §9 — `Thread.lastReplierIds` tối đa 3 người, ngưỡng cảnh báo fan-out theo dõi thread. */
  thread: { lastRepliersMax: 3, subscribersMax: 2000 },
  /** p1-06 be.md §9 — `@all` tối đa 5 lần/giờ/người/hội thoại nhóm; gợi ý mentionables tối đa 20 kết quả. */
  mention: { allPerHour: 5, mentionablesLimit: 20, roleMentionsPerHour: 5 },
  /**
   * p1-08 be.md §9 — báo cáo/kiểm duyệt. `contentContextSize` = số tin TRƯỚC/SAU
   * tin bị báo cáo khi moderator xem nội dung riêng tư (D-06 "±3 tin");
   * `privateViewGraceHours` = quyền xem còn hiệu lực bao lâu sau khi đóng báo cáo.
   */
  report: {
    descriptionMax: 1000,
    /** `OTHER` bắt buộc mô tả tối thiểu bấy nhiêu ký tự (be.md §3). */
    otherDescriptionMin: 10,
    ratePerHour: 20,
    contentContextSize: 3,
    privateViewGraceHours: 24,
    /** Số báo cáo tối đa quét một lần khi gộp theo `groupKey` (hàng đợi phạm vi/admin) — chặn tải, xem README p1-08 §10. */
    groupScanMax: 2000,
    /** Cron `reports.stale-reminder` (be.md §7): báo cáo còn OPEN quá số giờ này → nhắc người xử lý (mỗi nhóm/ngày một lần). */
    staleReminderHours: 72,
  },
  /** p1-08 be.md §9 — chặn người dùng: tối đa 500 người/chủ, cache Redis `block:{userId}` 5 phút. */
  block: { max: 500, cacheSeconds: 300 },
  /**
   * Ví nhóm (p6-04 README §7). Tiền là SỐ NGUYÊN đồng. `defaultReminderCron`/`defaultTz` là
   * mặc định khi tạo ví — registry `SystemConfig` chưa có kind chuỗi nên không override runtime.
   */
  wallet: {
    expenseMax: 100_000_000,
    participantsMax: 50,
    descriptionMax: 200,
    settlementNoteMax: 200,
    balanceUsersMax: 200,
    categories: ["FOOD", "PRINTING", "SERVER", "TRANSPORT", "MATERIAL", "OTHER"] as const,
    paymentProfilesMax: 3,
    remindNowPerHour: 1,
    settlementCreatePerHour: 20,
    reminderMinDebt: 10_000,
    reminderMinDebtMax: 1_000_000,
    defaultReminderCron: "0 9 * * 5",
    defaultTz: "Asia/Ho_Chi_Minh",
    /** Settlement PENDING quá số giờ này → nhắc người nhận 1 lần (`wallet.settlement-stale`). */
    settlementStaleHours: 48,
    /** TTL Asset CSV xuất (ngày). */
    exportTtlDays: 7,
  },
  /**
   * Kinh tế ảo Coins (p7-02 README §7). Xu là SỐ NGUYÊN ẢO — KHÔNG quy đổi tiền thật, khác hẳn `wallet` (ví chi tiêu nhóm). `dailyEarnCap` = trần xu nhận từ SỰ KIỆN mỗi ngày (theo múi giờ
   * người dùng; thưởng nhiệm vụ ngày nhận chủ động KHÔNG tính vào trần này); `adjustMax` = trần MỘT lần admin điều chỉnh; `balanceMax` < Int32 của Mongo để cộng không tràn (cộng vượt →
   * `COIN_009`). Admin chỉ HẠ được `dailyEarnCap`/`adjustMax` (registry `limits.coins`). `*PerMinute/*PerHour` = `scopeLimiter` theo người dùng (chống tự động hoá mua/nhận/điều chỉnh).
   */
  coins: {
    dailyEarnCap: 200,
    adjustMax: 100_000,
    balanceMax: 1_000_000_000,
    /** Trần cấu hình của admin: xu mỗi sự kiện (luật) / mỗi lần nhận nhiệm vụ. */
    ruleCoinsMax: 1_000,
    questCoinsMax: 1_000,
    questTargetMax: 100,
    questTitleMax: 80,
    questDescriptionMax: 300,
    /** Bộ nhớ đệm luật/nhiệm vụ trong tiến trình (giây) — sửa luật có hiệu lực ≤ ngần này, không hồi tố. */
    ruleCacheSeconds: 60,
    /** Khoảng thống kê tối đa của `GET /admin/economy/overview` (ngày) — mỗi ngày một truy vấn gộp nên chặn trần. */
    overviewMaxDays: 31,
    overviewDefaultDays: 7,
    txNoteMax: 500,
    buyPerMinute: 10,
    claimPerMinute: 20,
    equipPerMinute: 30,
    adminAdjustPerHour: 60,
    /** Số dòng sổ cái tối đa mỗi lần đối soát (`economy.reconcile`) một trang. */
    reconcileBatch: 200,
  },
  /** Cửa hàng vật phẩm hồ sơ (p7-02 README §7 `LIMITS.shop`). */
  shop: {
    priceMax: 10_000,
    nameMax: 60,
    codeMax: 40,
    emojiPackMax: 30,
  },
  /**
   * Chợ tài liệu (p7-02 be.md §9, phần P1 — chưa build API/service, chỉ khai trần). Bán bằng Coins nội bộ, KHÔNG phải tiền thật.
   * `priceMin/priceMax` = giá niêm yết; `listingsPerUserMax` = số tin ĐANG hoạt động (PENDING_REVIEW/ACTIVE) một người được có;
   * `refundWindowDays` = số ngày sau khi mua mà admin ẩn tin vẫn còn hoàn được cho người mua; `autoHideReports` = số lượt báo cáo
   * (Report p1-08 targetType LISTING) khiến tin tự động chuyển HIDDEN chờ admin xử lý.
   */
  marketplace: {
    priceMin: 1,
    priceMax: 5_000,
    listingsPerUserMax: 50,
    refundWindowDays: 7,
    autoHideReports: 3,
  },
  /**
   * Burnout radar / sức khoẻ học tập (p7-03 README §7) — dữ liệu SỨC KHOẺ TINH THẦN, mặc định TẮT, chỉ người bật (opt-in) mới bị thu thập. `lateNight` = khung "khuya" theo múi giờ CỦA NGƯỜI DÙNG
   * và cũng là ranh giới ngày wellbeing (ngày mới bắt đầu lúc `lateNight.end`; hoạt động 00:00–05:00 tính vào ngày hôm trước để một buổi thức khuya không bị cắt làm đôi). `bucketMinutes`: chỉ ghi
   * "khe 15 phút có hoạt động", không ghi từng nhịp. `continuousGapMinutes`: khoảng trống ≤ ngần này giữa hai khe vẫn coi là làm liên tục. `anonymityMin`/`cellMin` = ngưỡng k-anonymity của số liệu admin
   * (tổng ≥ 20 người; mỗi ô/nhóm ≥ 5). `alertCooldownHours` = tối đa MỘT cảnh báo mỗi 24 giờ; `alertCooldownGraceMinutes` = job chạy hằng ngày cùng giờ nhưng lệch vài giây/phút giữa các ngày, cho phép lệch
   * ngần này để cảnh báo không lúc có lúc không. Bộ luật chấm điểm nằm ở `SystemConfig burnout.rules` (`core/constants/burnout.ts`), KHÔNG ở đây. P1: `sharePerHour` giới hạn PUT/DELETE
   * `/me/wellbeing/shares/:workspaceId`; `breakPerDay`/`breakDurationSeconds*` cho `POST /me/wellbeing/break` (không có model riêng — chỉ đếm qua rate limiter, không ảnh hưởng điểm rủi ro).
   */
  wellbeing: {
    alertCooldownHours: 24,
    alertCooldownGraceMinutes: 30,
    retentionDays: 90,
    lateNight: { start: "23:00", end: "05:00" },
    bucketMinutes: 15,
    continuousGapMinutes: 20,
    /** Số ngày có dữ liệu tối thiểu trong cửa sổ thì mới chấm điểm (ít hơn → "cần thêm vài ngày"). */
    minDailiesForAssessment: 3,
    anonymityMin: 20,
    cellMin: 5,
    /** Bucket Redis theo giờ sống bấy nhiêu ngày (đủ để job hằng ngày bắt kịp sau sự cố ngắn). */
    bucketTtlDays: 3,
    /** Khoá chống đếm trùng một sự kiện khi job giao lại (giây). */
    eventDedupeTtlSeconds: 86_400,
    /** Bộ nhớ đệm múi giờ người dùng trong tiến trình (giây) — đổi múi giờ có hiệu lực ≤ ngần này. */
    timezoneCacheSeconds: 300,
    /** Cỡ lô quét người đã bật mỗi lượt của job hằng giờ. */
    scanBatch: 500,
    /** Trần cứng của bộ luật (khớp `burnoutRuleSetSchema`). */
    rulesMax: 20,
    ruleLabelMax: 120,
    windowDaysMax: 30,
    preferredBreak: { workMinutesMin: 15, workMinutesMax: 180, breakMinutesMin: 1, breakMinutesMax: 60 },
    /** Số ngày nhìn lại của màn hình người dùng. */
    assessmentDays: [7, 30] as const,
    /** Admin: số tuần tối đa của biểu đồ cảnh báo, và cửa sổ ngày để xác định "mức hiện tại" của mỗi người trong phân bố mức. */
    overviewMaxWeeks: 12,
    levelDistributionDays: 3,
    /** Số ngày nhìn lại để tìm "đánh giá mới nhất" + cảnh báo chưa bấm ở `GET /me/wellbeing`. */
    recentAlertDays: 3,
    /** Rate limit theo người dùng (`scopeLimiter`): bật/tắt/sửa cài đặt, ack cảnh báo, xoá dữ liệu. */
    settingPerHour: 20,
    ackPerMinute: 20,
    deleteDataPerHour: 10,
    /** P1 — chia sẻ mức rủi ro với trưởng nhóm: PUT/DELETE `/me/wellbeing/shares/:workspaceId`. */
    sharePerHour: 20,
    /** P1 — `POST /me/wellbeing/break` (nút nghỉ 1 phút): khớp be.md §4 "30/ngày"; thời lượng hợp lý cho một lượt nghỉ ngắn (không phải Pomodoro). */
    breakPerDay: 30,
    breakDurationSecondsMin: 10,
    breakDurationSecondsMax: 600,
  },
  /**
   * Quét trùng lặp nội bộ (p7-05 README §7 / be.md §9) — AI tạm dừng (D-13), chỉ so khớp NỘI BỘ workspace bằng k-gram +
   * winnowing, không gọi mô hình/API ngoài. `targetsMax` = số tệp đích một lượt quét; `scansPerWorkspacePerDay`/
   * `concurrentScansPerWorkspace` = hạn mức tạo lượt quét; `fileBytesMax`/`charsMax` = trần tệp được lập chỉ mục;
   * `text`/`code` = tham số k-gram/window của thuật toán winnowing theo loại nội dung; `fingerprintsPerDocMax` = số hash
   * giữ lại mỗi tài liệu sau khi cắt; `candidateSourcesMax` = số nguồn ứng viên xét cho mỗi đích; `minPairPercent` =
   * containment tối thiểu để giữ một cặp; `minSectionTokens`/`mergeGapTokens`/`sectionsPerTargetMax` = tham số gộp đoạn
   * trùng; `excerptCharsMax`/`contextChars` = trần đoạn trích hiển thị; `commonDocFrequencyPercent`/`commonDocMinCount` =
   * ngưỡng coi một hash là "boilerplate phổ biến" để loại khỏi so khớp; `thresholds` = ngưỡng điểm LOW/MEDIUM/HIGH mặc định
   * (admin chỉnh qua `SystemConfig plagiarism`, không vượt trần này); `reportRetentionDays` = hạn lưu báo cáo trước khi
   * `EXPIRED`; `indexWaitMaxMinutes` = job quét chờ lập chỉ mục xong tối đa bao lâu trước khi `FAILED INDEX_TIMEOUT`;
   * `boilerplatePhrasesMax` = số cụm câu mẫu admin loại trừ được. Thay `plagiarism.targetsMax=50` của bản kế hoạch cũ —
   * giữ nguyên số.
   */
  plagiarism: {
    targetsMax: 50,
    scansPerWorkspacePerDay: 20,
    concurrentScansPerWorkspace: 2,
    fileBytesMax: 20 * 1024 * 1024,
    charsMax: 1_000_000,
    text: { k: 5, window: 4 },
    code: { k: 12, window: 8 },
    fingerprintsPerDocMax: 20_000,
    candidateSourcesMax: 50,
    minPairPercent: 5,
    minSectionTokens: 15,
    mergeGapTokens: 10,
    sectionsPerTargetMax: 200,
    excerptCharsMax: 2_000,
    contextChars: 200,
    commonDocFrequencyPercent: 30,
    commonDocMinCount: 5,
    thresholds: { medium: 20, high: 40 },
    reportRetentionDays: 180,
    indexWaitMaxMinutes: 15,
    boilerplatePhrasesMax: 50,
  },
  /**
   * Tích hợp bên thứ ba (p5-03 README §7 / be.md §9). `perWorkspaceMax` = số kết nối GitHub/GitLab/Figma/nhóm; `eventsLogRetentionDays` = ngày giữ payload
   * webhook (sau đó không phát lại được — `INT_006`), `eventsRowRetentionDays` = ngày giữ cả dòng log. `webhookBodyMaxBytes` = trần RAW body của
   * `POST /webhooks/:provider` (route không xác thực — chặn DoS). `commitsInMessageMax` = số commit hiện trong tin hệ thống. Mọi gọi ra nhà cung cấp
   * bị chặn bởi `providerTimeoutMs`. Admin chỉnh được qua `SystemConfig` (chỉ cờ bật/tắt provider, xem registry `integrations`), các số còn lại là trần cứng.
   */
  integration: {
    perWorkspaceMax: 10,
    reposPerIntegrationMax: 20,
    eventsLogRetentionDays: 30,
    eventsRowRetentionDays: 90,
    webhookBodyMaxBytes: 1024 * 1024,
    replayPerHour: 20,
    connectPerHour: 10,
    oauthStateTtlSeconds: 600,
    commitsInMessageMax: 5,
    /** Mốc làm mới token trước hạn (giây) — `tokenExpiresAt − 5 phút`. */
    tokenRefreshLeadSeconds: 300,
    providerTimeoutMs: 8000,
    /** Độ dài tối đa của tiêu đề/commit trong tin hệ thống (ký tự) — nội dung do người ngoài nhập nên luôn cắt. */
    titleMax: 200,
    commitMessageMax: 120,
    /** Số kết nối kiểm tra sức khoẻ mỗi lượt cron giờ. */
    healthCheckBatch: 50,
    /** Không có sự kiện quá số ngày này → cron giờ kiểm tra hook/cài đặt còn tồn tại. */
    healthCheckIdleDays: 30,
  },
  /** Realtime (p0-03) — be.md §9. `rateLimit.*` cụ thể hoá bucket theo event của be.md §5.7 (typing 2 token/1s, presence 1/10s, room 20/10s = roomJoinPerWindow/roomJoinWindowSeconds, auth:refresh 3/60s). */
  realtime: {
    clientEventMaxBytes: 16 * 1024,
    roomJoinPerWindow: 20,
    roomJoinWindowSeconds: 10,
    presenceThrottleSeconds: 5,
    presenceQueryMaxIds: 200,
    sessionExpiringLeadSeconds: 60,
    rateLimit: {
      typing: { capacity: 2, refillPerSecond: 1 },
      presence: { capacity: 1, refillPerSecond: 1 / 10 },
      room: { capacity: 20, refillPerSecond: 20 / 10 },
      authRefresh: { capacity: 3, refillPerSecond: 3 / 60 },
      /** p5-01 — `quiz:answer`: mỗi câu chỉ một đáp án (Lua), bucket chỉ chặn bão gói tin. */
      quizAnswer: { capacity: 5, refillPerSecond: 2 },
    },
  },
} as const;

export type Limits = typeof LIMITS;
