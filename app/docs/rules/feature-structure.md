# Cấu trúc feature

```
src/features/{ten-feature}/
├── api/
│   ├── {ten}.api.ts          # đường dẫn endpoint (hằng số)
│   ├── {ten}.service.ts      # hàm async — bọc apiClient, bóc response
│   ├── {ten}.types.ts        # kiểu DTO của backend
│   └── index.ts
├── queries/
│   └── {ten}.queries.ts      # hook React Query (use…)
├── hooks/                    # hook gộp nghiệp vụ
├── components/               # UI trong feature
│   └── {NhomCon}/            # feature nhiều mảng → chia theo mảng
├── screens/                  # màn hình, được route trỏ tới
├── schemas/ · constants/ · types/ · utils/
└── index.ts                  # barrel — mặt tiền công khai của feature
```

**`screens/` = "pages" của web.** Màn hình được `app/**` trỏ tới.

## Luật

- ⛔ **Không gọi API trực tiếp trong component** → qua hook trong `queries/`.
- ⛔ **Không đặt logic nghiệp vụ trong component** → tách ra `hooks/`.
- ⛔ **Không import chéo feature.** Cần dùng chung → đưa lên `@/shared`,
  `@/core` hoặc `@/shell`. Import chéo là con đường ngắn nhất tới import vòng,
  mà import vòng trên RN hiện ra lúc chạy dưới dạng
  `undefined is not a function` ở một file KHÔNG liên quan. Hai lớp chặn:
  ESLint `import/no-cycle` bắt VÒNG, còn **`npm run check:imports`** bắt import
  MỘT CHIỀU `A → B` (kể cả `export … from`, `import()` và đường tương đối chui
  sang thư mục feature khác) — trừ cặp khai trong `scripts/feature-boundaries.json`
  kèm `why`. Import trong chú thích và trong file test không tính.
- File route trong `app/` phải **mỏng** — chỉ `import` và `return`. Nội dung
  nằm trong `features/*/screens/`. Nhờ vậy `app/` đọc lướt là ra bản đồ màn hình,
  và màn hình test được mà không phải dựng cả bộ điều hướng.

## Ba tầng gọi API

```
api.ts       → hằng số đường dẫn. `grep` một lần là thấy hết mặt tiếp xúc backend.
service.ts   → async, bọc apiClient, CHUẨN HOÁ tên trường của backend.
queries.ts   → hook React Query: cache, trạng thái tải, thử lại, làm mới.
```

Tách ba tầng để khi backend đổi tên trường (`access_token` → `accessToken` — đã
xảy ra) thì **chỉ `service.ts` phải sửa**. Xem `src/core/api/auth/` làm mẫu.

## Ngoại lệ: `chat` là feature NỀN (p1-04)

`src/features/chat/` (engine tin nhắn — `<ChatRoom scope={...} />`) là ngoại lệ
DUY NHẤT đã xác nhận cho luật "không import chéo feature" ở trên. Nó không có
route riêng (app.md p1-04 §1) — bản thân nó chỉ được các feature CÓ route
(`channels` — p1-03, `conversations` — p1-05, `threads` — p1-06) ghép vào màn
hình của chính chúng, kiểu `<ChatRoom scope={{scopeType:'CHANNEL', scopeId}} header={...} capabilities={...} />`.

- **Được phép:** `channels`/`conversations`/`threads` import `@/features/chat`
  (và `@/features/chat/store/reset-chat-stores` từ `shell/session/useLogout.ts`,
  cùng cách `shell` đã import `@/features/members/store/pending-invite`).
  Ngoài ba feature đó còn hai nơi dùng `chat`, cũng khai ở
  `scripts/feature-boundaries.json`: `discovery` (kiểu `MessageView` + hàm thuần
  `previewText`/`mentionsToPlainText` để dựng trích đoạn tin đã lưu/đã ghim) và
  `meeting-room` (`MeetingChatSheet` ghép `<ChatRoom>` cho cuộc họp). Cặp NGOÀI
  danh sách đó là đỏ ở `check:imports`.
- **Cấm ngược:** `chat` KHÔNG BAO GIỜ import `channels`/`conversations`/`threads`
  — nhận mọi thứ đặc thù scope (header, banner, `capabilities.canWrite`/`readOnlyReason`)
  qua PROPS từ màn hình cha, giống hệt cách backend `messages` (p1-04 be.md §1)
  không import `channels`/`conversations` mà dùng registry `MessageScope`.
- Lý do đặt ở `src/features/chat/` thay vì `src/shared/chat/`: nó có state
  nghiệp vụ thật (outbox, draft, optimistic send) và một mặt API riêng — đúng
  hình dạng một feature, chỉ khác ở chỗ không sở hữu route.
- **Nối kênh ↔ luồng (p1-06):** `channels` và `threads` KHÔNG biết nhau. `threads`
  chỉ import `chat`; màn kênh mở luồng qua `ChatRoom.onOpenThread` (tự đẩy route
  bằng đường dẫn typed — cần `wsId` mà `chat` không có), và route
  `channels/[chId]/thread/[messageId].tsx` trỏ thẳng `threads/screens/ThreadScreen`.
  Danh sách luồng của kênh cùng cách: route `channels/[chId]/threads.tsx` trỏ `threads/screens/ChannelThreadsScreen`,
  điểm vào là mục "Luồng" (chỉ kênh chữ) trong menu `ChannelHeader` — chỉ đẩy route typed, `channels` vẫn không import `threads`.
  Cần dữ liệu của feature khác (tên kênh, danh bạ) thì gọi THẲNG endpoint bằng service
  của mình — cùng mẫu `channelsService.searchWorkspaceMembers` — chứ không import.
- **Tính năng phụ trong tin nhắn (p5-04 "Xác nhận đã đọc"):** `chat` KHÔNG import `announcements` (cũng không import bất kỳ
  feature nào) mà mở ba KHE ở `@/shared/message-extensions` — `bubbleFooter` (hàng phụ dưới bong bóng), `actionRows` (dòng
  trong menu nhấn giữ) và `roomHost` (dựng MỘT lần mỗi phòng: tải dữ liệu, nghe socket, tấm/hộp thoại). Feature nguồn đăng
  ký renderer (hàm trả `ReactNode`, không phải component — `react-hooks/static-components`) bằng
  `registerMessageBubbleFooter` / `registerMessageActionRows` / `registerChatRoomHost`; nơi lắp ráp import
  `@/features/announcements/register` (side-effect) TRƯỚC khi danh sách tin vẽ lần đầu — hiện ở
  `app/(app)/workspaces/[wsId]/channels/[chId]/_layout.tsx`. Dữ kiện ĐẶC THÙ KÊNH (`canManage`, `postingPolicy`,
  `workspaceId`) do màn cha nạp qua `ChatRoom.extension`, `chat` không tự suy. Chưa đăng ký renderer nào (cờ tắt, test) thì
  khe không vẽ gì. Cùng mẫu với `registerSystemMessageRenderer` (tin hệ thống), `@/shared/calls` và `@/shared/profile`.
