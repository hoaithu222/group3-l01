# super-app

Ứng dụng mobile trong `app/`, trang quản trị web trong `admin/`, backend trong
`be/`. Đặc tả sản phẩm trong [`docs/notes.md`](docs/notes.md) và
[`docs/modules/`](docs/modules/); kế hoạch triển khai trong
[`docs/development-plan.md`](docs/development-plan.md).

Codex: đọc [`AGENTS.md`](AGENTS.md). Cách mở dự án, kiểm tra rules và dùng
chung với Claude: [`docs/codex-setup.md`](docs/codex-setup.md).

Triển khai Android lên Firebase App Distribution và backend lên Railway:
[`docs/deploy-firebase-railway.md`](docs/deploy-firebase-railway.md).
Chạy `./scripts/deploy.ps1 -CheckOnly -SkipCheck` để kiểm tra kết nối/cấu hình;
`./scripts/deploy.ps1 -DryRun` để xem lệnh mà không triển khai.
Bản iOS (EAS Build, TestFlight hoặc ad hoc): [`app/docs/build-ios-eas.md`](app/docs/build-ios-eas.md).



Tôi đã đối chiếu tài liệu kế hoạch với mã thật của cả 57 module. Nhiều ô trạng thái trong docs/plans/README.md không còn đúng, nên tôi dùng trạng thái theo mã thật ở dưới.

Mức kiểm chứng: 7 agent đọc mã ở be/, app/, admin/ và không chạy build hay test. Tôi tự kiểm lại 5 điểm quan trọng và cả 5 đều khớp:
- AVAILABLE_MODULES = [PUSH].
- Route app/app/m/[id].tsx đã tồn tại.
- threads và mentions có 0 file test.
- Schema chưa có model Call, Meeting, Board, Task, Report, ReadState, Resource…
- Chưa có dependency livekit, expo-notifications, sentry.

Các chi tiết còn lại là kết quả của agent, tôi chưa kiểm từng dòng. Repo không bị sửa file nào.

1. Phần nào đã xong

Không module nào đóng hẳn 100%, vì còn test thiết bị, tài liệu hoặc test trên hạ tầng thật. Trạng thái theo mã:

┌──────────────────┬────────┬────────┬────────┬─────────────────────────────────┐
│       Nhóm       │   BE   │  App   │ Admin  │             Ghi chú             │
├──────────────────┼────────┼────────┼────────┼─────────────────────────────────┤
│ p0-02 access     │        │        │ không  │ Gần đóng nhất; còn test ACL-06  │
│ control          │ xong   │ xong   │ áp     │ với 2 instance                  │
│                  │        │        │ dụng   │                                 │
├──────────────────┼────────┼────────┼────────┼─────────────────────────────────┤
│ p0-01 bảo mật    │ gần    │ xong   │ xong   │ Còn avatar, changeRole chưa     │
│                  │ xong   │        │        │ ngắt socket, docs               │
├──────────────────┼────────┼────────┼────────┼─────────────────────────────────┤
│ p0-03 realtime   │ xong   │ xong   │ một    │ RT-09 chỉ chạy một server, chưa │
│                  │        │        │ phần   │  phải hai instance              │
├──────────────────┼────────┼────────┼────────┼─────────────────────────────────┤
│ p0-04            │ xong   │ không  │        │                                 │
│ jobs/outbox      │ lõi    │ áp     │ chưa   │ Thiếu tab jobs của admin        │
│                  │        │ dụng   │        │                                 │
├──────────────────┼────────┼────────┼────────┼─────────────────────────────────┤
│ p0-05 tệp/media  │ xong   │ xong   │ chưa   │ Thiếu tab storage của admin     │
├──────────────────┼────────┼────────┼────────┼─────────────────────────────────┤
│ p0-06 thông      │ xong   │ chưa   │ chưa   │ App chưa có expo-notifications  │
│ báo/push         │        │        │        │                                 │
├──────────────────┼────────┼────────┼────────┼─────────────────────────────────┤
│ p0-07 system     │ xong   │ chưa   │ chưa   │ Admin vẫn là placeholderPage    │
│ config           │        │        │        │                                 │
├──────────────────┼────────┼────────┼────────┼─────────────────────────────────┤
│ p0-13 sinh trắc  │ xong   │ xong   │ chưa   │ Chưa đo trên thiết bị thật      │
│                  │        │ code   │        │                                 │
├──────────────────┼────────┼────────┼────────┼─────────────────────────────────┤
│                  │        │        │        │ Có 40 file integration BE, 91   │
│ p0-10 kiểm thử   │ một    │ một    │ một    │ test app, 28 test admin; thiếu  │
│                  │ phần   │ phần   │ phần   │ Playwright, Maestro, k6,        │
│                  │        │        │        │ coverage                        │
├──────────────────┼────────┼────────┼────────┼─────────────────────────────────┤
│ p0-11 quan       │ một    │ chưa   │ chưa   │ Thiếu Sentry, nginx, deploy/,   │
│ sát/triển khai   │ phần   │        │        │ .well-known                     │
├──────────────────┼────────┼────────┼────────┼─────────────────────────────────┤
│ p0-12 nền client │ –      │ thấp   │ chưa   │ Package vẫn tên base-android    │
├──────────────────┼────────┼────────┼────────┼─────────────────────────────────┤
│ p0-08 LiveKit,   │ chưa   │ chưa   │ chưa   │ Chưa bắt đầu                    │
│ p0-09 hợp đồng   │        │        │        │                                 │
├──────────────────┼────────┼────────┼────────┼─────────────────────────────────┤
│                  │ xong   │ xong   │        │                                 │
│ p1-01…p1-05      │ P0     │ phần   │ xong   │ Test client gần như bằng 0      │
│                  │        │ lớn    │        │                                 │
├──────────────────┼────────┼────────┼────────┼─────────────────────────────────┤
│ p1-06            │ xong   │        │        │                                 │
│ thread/mention   │ lõi, 0 │ chưa   │ –      │ Bảng README vẫn ghi ☐           │
│                  │  test  │        │        │                                 │
├──────────────────┼────────┼────────┼────────┼─────────────────────────────────┤
│ p1-07 / 08 / 09  │ chưa   │ chưa   │ chưa   │ p1-08 chỉ có UserBlock; p1-09   │
│                  │        │        │        │ đã có danh sách ghim từ p1-04   │
├──────────────────┼────────┼────────┼────────┼─────────────────────────────────┤
│ Phase 2 → 7      │ 0 mã   │ 0 mã   │ 0 mã   │ Chỉ có khung: cờ, LIMITS, tên   │
│                  │        │        │        │ queue, placeholder              │
└──────────────────┴────────┴────────┴────────┴─────────────────────────────────┘

Chỉ p0-13 và p1-01…p1-05 đã có mã phía app và admin ở mức dùng được. Phase 2 đến Phase 7 chưa có model, module hay dependency nào.

2. Việc cần biết trước khi chia làm song song

1. Cờ communication chưa mở.
   - Toàn bộ route của workspaces, members, channels, messages, conversations, threads, mentions dùng requireFeature(COMMUNICATION).
   - Vì AVAILABLE_MODULES chỉ có PUSH, các route này bị từ chối ở môi trường thật. Test chạy được nhờ jest.mock.
   - Hai README ghi điều kiện mở khác nhau: p1-01 ghi "khi p1-01..p1-04 merge", p1-04 ghi "p1-01..p1-07".
   - Đây là quyết định của bạn, tôi chưa đổi gì.
2. Cơ chế outbox chỉ có một consumer cho mỗi cặp (queue, jobName).
   - Hợp đồng Phase 4 mô tả một dedupeKey chung cho nhiều consumer, không khớp mã hiện tại.
   - Cách đang dùng là producer ghi nhiều dòng outbox trong cùng transaction. Cần chốt quy ước này trước khi p3-02 viết producer.
3. Đồ thị phụ thuộc trong README tổng chưa đúng.
   - Không module Phase 6 nào tham chiếu Phase 2 hoặc Phase 5.
   - Module Phase 7 không đọc gì từ Phase 6.
   - Cổng thật của nhóm nghề nghiệp và mentor là Phase 3 cộng p1-08.
4. Ba chỗ xung đột phải chốt trước khi viết mã:
   - Route /m/: đang là hội thoại (m/[id], p1-05), trong khi p0-12 và p2-04 định dùng cho mã họp.
   - Mã lỗi p3-04 (INV_006..009, WS_010..012, CH_009) trùng mã đã dùng ở Phase 1 với nghĩa khác, nên phải đánh số lại.
   - LIMITS.call và LIMITS.meeting trong mã lệch README (ví dụ token 3600 so với 600).

3. Các chuỗi phải làm tuần tự

- p1-07 (ReadState → fan-out → push) chặn thông báo, đã đọc, huy hiệu chưa đọc, màn Hoạt động và việc mở cờ communication.
- p0-08 BE chặn p2-01 #7, p2-03, p2-05, p2-06 và p5-02.
- p2-01 → p2-02 và p2-03. p2-04 → p2-05 → p2-06.
- p3-02 → p3-03 → p4-04, p4-05, p4-06.
- p4-01 → p4-02 và p5-01.
- p6-06 → p6-07 → p6-08 (nửa Talent). p6-01 → p6-02.
- p3-04 + p1-08 → p6-03.

4. Việc làm song song được ngay

Các việc sau độc lập với nhau và không cần tài khoản hay thiết bị ngoài. Xếp theo mức mở khoá được nhiều việc khác.

Admin (hiệu quả nhất)
- p0-07 Admin #9–10 (trang system-config): mở khoá luôn p0-04 #8, p0-05 #11 và p0-06 #12.
- p0-12 Admin audit-log: BE cần thêm actor, vì AuditTrailPanel đang đọc sai field.
- p0-13 Admin #13, p1-08 admin moderation, khung p2-07.

BE

┌───────┬────────────────────────────┬───────────────────────────────────────────┐
│ Nhánh │            Việc            │                  Ghi chú                  │
├───────┼────────────────────────────┼───────────────────────────────────────────┤
│ 1     │ p1-07 #1–3                 │ Đường găng                                │
├───────┼────────────────────────────┼───────────────────────────────────────────┤
│ 2     │ p1-08 blocks + Report      │ Độc lập với p1-07                         │
├───────┼────────────────────────────┼───────────────────────────────────────────┤
│ 3     │ p1-09 SavedMessage +       │ Độc lập với p1-07                         │
│       │ search                     │                                           │
├───────┼────────────────────────────┼───────────────────────────────────────────┤
│ 4     │ p1-06: test và summaries() │ Trả nợ chất lượng                         │
├───────┼────────────────────────────┼───────────────────────────────────────────┤
│ 5     │ p0-08 #3–5                 │ SDK, token, webhook; dùng LiveKit Cloud   │
│       │                            │ dev                                       │
├───────┼────────────────────────────┼───────────────────────────────────────────┤
│ 6     │ p0-09 #1–2, #4             │ Sinh openapi.json và contracts/           │
├───────┼────────────────────────────┼───────────────────────────────────────────┤
│ 7     │ p0-11 #1–2                 │ Sentry, log JSON, /health/live            │
├───────┼────────────────────────────┼───────────────────────────────────────────┤
│ 8     │ p2-01 BE                   │ Dùng port media giả                       │
├───────┼────────────────────────────┼───────────────────────────────────────────┤
│ 9     │ p2-04 BE + ICS             │ Module Phase 2 sạch nhất                  │
├───────┼────────────────────────────┼───────────────────────────────────────────┤
│ 10    │ p3-01, p3-02, p3-04        │ Ba nhánh riêng; đóng băng schema          │
│       │                            │ Workspace/ChannelGrant/Task sớm           │
├───────┼────────────────────────────┼───────────────────────────────────────────┤
│ 11    │ p4-01 → p4-02, p4-03       │ p4-03 dùng sự kiện giả; làm phần thuần    │
│       │                            │ trước                                     │
├───────┼────────────────────────────┼───────────────────────────────────────────┤
│ 12    │ p5-03 (GitHub), p5-04      │ Độc lập                                   │
├───────┼────────────────────────────┼───────────────────────────────────────────┤
│       │ p6-01, p6-04, p7-04        │                                           │
│ 13    │ (poll), p7-01 R1–R4, p7-03 │ Chỉ cần Phase 0/1                         │
│       │  lõi                       │                                           │
└───────┴────────────────────────────┴───────────────────────────────────────────┘

App
- p0-06 #9 (expo-notifications, kênh Android, đăng ký token FCM): không cần Apple.
- p1-06 #7–9 (MentionPicker, màn thread), p0-07 #11, p0-13 #12.
- Nối cancelUploadsByScope; nút "Nhắn tin" trong MemberCardSheet; restore-account.
- p0-12 #1–4, #6.
- p2-01 và p2-04 App; spike PDF và kéo thả Kanban (p3); spike WebView+Tiptap+Yjs (p6-01).

Trả nợ chất lượng (song song hoàn toàn, rủi ro thấp)
- Test còn thiếu: WS-06/07/09, MSG-03/09/10/11/12, CH-09, SEC-01, SEC-07.
- Test client cho workspaces, members, channels.
- Đồng bộ mã lỗi: thêm MSG_001..021 và CFG_* vào admin, và MSG_018..021 vào app.

5. Việc bị chặn ngoài, cần bạn chuẩn bị

┌──────────────────────────────────────────────────┬─────────────────────────────┐
│                       Cần                        │          Chặn việc          │
├──────────────────────────────────────────────────┼─────────────────────────────┤
│ Firebase, khoá APNs .p8, tài khoản Apple         │ p0-06 VoIP, p2-02           │
│ Developer                                        │                             │
├──────────────────────────────────────────────────┼─────────────────────────────┤
│ LiveKit server + TURN, VM staging, DNS/cert      │ p0-08 ops, p0-11,           │
│                                                  │ p2-03/05/06                 │
├──────────────────────────────────────────────────┼─────────────────────────────┤
│ ≥2 Android + 1 iPhone thật                       │ Toàn bộ kịch bản "Thiết bị" │
├──────────────────────────────────────────────────┼─────────────────────────────┤
│ Sentry DSN                                       │ p0-11                       │
├──────────────────────────────────────────────────┼─────────────────────────────┤
│ GitHub App, OAuth GitLab/Figma/Google, domain    │ p5-03                       │
│ HTTPS                                            │                             │
├──────────────────────────────────────────────────┼─────────────────────────────┤
│ Chính sách dữ liệu sinh viên, duyệt pháp lý      │ p6-07, p6-08, p6-03         │
└──────────────────────────────────────────────────┴─────────────────────────────┘

6. Điểm chạm file chung (dễ conflict khi song song)

- be/prisma/schema.prisma: một file cho tất cả. Mỗi người giữ block riêng, và nên có một PR "enum trước" cho AssetScope, AssetLinkTarget, ReportTargetType, SystemMessageType, MessageKind.
- Các file mỗi module thêm một dòng: register-jobs.ts, limits.ts, error.codes.ts, router.ts, socket.events.ts.
- core/permission/* và ScopeType: nên gộp một PR cho COMPANY, DOCUMENT, WHITEBOARD, BOARD.
- WorkspaceDetailPage.tsx (admin): p2-04, p2-07, p3-01, p3-02, p3-04 cùng thêm tab vào một file.
- app/package.json: mỗi native dependency mới buộc cả nhóm rebuild dev-client.
- Chưa tồn tại dù nhiều plan dựa vào: shared/events/domain-events.ts và modules/auth/services/data-permissions.ts.

7. Vấn đề thật, không chỉ là lệch tài liệu

- Xoá tài khoản: Agent p0-01..06 báo BE thu hồi phiên và trả AUTH_012 sau delete-request, trong khi app coi như người dùng vẫn dùng bình thường và chưa có restore-account. Tôi chưa tự kiểm lại điểm này.
- Test được ghi xanh nhưng không tồn tại:
  - SEC-01 và SEC-07 trong p0-01 ghi ✅ nhưng không tìm thấy test.
  - WS-06/07/09 không có test dù DoD của p1-01 ghi xanh.
  - error-codes-sync của admin đang đỏ sẵn (thiếu MSG_*, CFG_*).
- Nợ hợp đồng tăng dần: Phase 1 viết bằng kiểu chép tay trước khi p0-09 xong.
- p1-06 không có test nào.

8. Tài liệu cần đồng bộ

- Bảng docs/plans/README.md: p1-06 ghi ☐ nhưng BE đã có mã. Bảng Phase 0 lệch README module (p0-01, p0-02…).
- Số liệu cũ: p0-10 ghi "0 integration test", thực tế có 40 file. p0-11 ghi "metrics chưa commit", thực tế đã commit.
- README p1-03 (#5, #10), p1-04 (#7) và các điểm mở đã hết chặn.
- Đồ thị phụ thuộc P4/P5 → P6 → P7 ở mục 2 cần vẽ lại.
- Bảng "Đồng bộ chéo còn mở" cần thêm: domain-events.ts, quy ước fan-out outbox, ReportTargetType (MENTOR_POST, STUDY_SET…), tên AssetScope recap/ghi hình.

Tôi chưa sửa tài liệu vì bạn chỉ yêu cầu phân tích. Nếu muốn, tôi sẽ cập nhật bảng trạng thái và đồ thị phụ thuộc theo mã thật, chỉ sửa Markdown. Tôi cũng có thể gom báo cáo này thành một trang HTML để chia sẻ.
# group3-l01
