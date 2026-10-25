import { tv } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

/**
 * Công thức style + số đo của `BottomSheet`.
 *
 * Tách khỏi `BottomSheet.tsx` vì mỗi slot ở đây đều phải kèm số đo Figma và lý
 * do — để chung một file thì phần JSX đọc được bị chôn dưới 70 dòng chú thích,
 * và file vượt trần 200 dòng của `src/shared/ui/AGENTS.md`.
 *
 * Nguồn: Figma "BIDV SmartBanking v2.0" — section `Bottom sheet` (259:94850).
 */
export const bottomSheet = tv(
  {
    slots: {
      /* Token `overlay` ĐÃ pha sẵn alpha (`Opacity/Ink/Op80` = 80%). ⛔ Đừng
         thay bằng màu đen thô kèm modifier độ trong: họ `black` không có bậc
         DEFAULT nên class đó không sinh ra CSS nào, và modifier độ trong cũng
         vô tác dụng với token vốn đã mang alpha. Đậm/nhạt chỉnh ở TẦNG TOKEN
         (`src/styles/colors/colors.json`), không chỉnh ở đây. */
      backdrop: 'absolute inset-0 bg-overlay',
      /* Figma: bo trên 24 (`border/bo24`), nền `background/white/default` ⇒
         token vai trò nền hộp thoại (trắng ở chế độ sáng, #232E2C ở chế độ tối),
         khoảng cách 16 giữa đầu — thân — đáy.
         ⚠️ Tên token trong bảng màu ĐÃ bắt đầu bằng hai chữ “bg”, mà tiện ích
         nền cũng thêm tiền tố “bg” — nên class đúng lặp lại hai lần. Viết một
         lần là class chết: không sinh ra CSS, NativeWind bỏ qua âm thầm. */
      /*
         ── Trần bề rộng từ máy tính bảng ─────────────────────────────────────
         ⛔ Tấm KHÔNG được kéo hết 1000dp trên máy tính bảng: vùng nút ở đáy tấm
         khi đó dài bằng cả màn, nút "Xác nhận" nằm tận mép phải và ngón cái
         không với tới — trong khi mắt vẫn phải quét hết bề ngang mới đọc được
         danh sách lựa chọn. Kẹp `max-w-content` (720dp) rồi canh giữa, đúng
         token trần nội dung của `Screen` nên tấm thẳng cột với màn hình phía sau.
         ⚠️ `w-full` ở đầu chuỗi là thứ giữ cho `tablet:self-center` không bóp
         tấm lại: `alignSelf` đổi bề rộng mặc định từ "kéo giãn" sang "vừa nội
         dung", bỏ `w-full` đi là tấm co lại ôm sát dòng chữ dài nhất. */
      sheet:
        'w-full gap-md overflow-hidden rounded-t-md bg-bg-dialog tablet:max-w-content tablet:self-center',
      /** Đệm do biến thể `padded` quyết — xem bảng bên dưới. */
      body: '',
      /* ⚠️ `shrink` bắt buộc: `ScrollView` mặc định `flexShrink: 0` nên KHÔNG
         co theo `maxHeight` của tấm — nội dung dài tràn khỏi mép dưới màn và
         mấy dòng cuối không cuộn tới được. */
      scrollBody: 'shrink',
      /* Figma (`content BT/list checkbox`): nội dung kết thúc ở y=228 và
         `Bottom nav` bắt đầu ĐÚNG y=228, `Bottom nav` tự có đệm trên 12 ⇒ khe
         thật là 12. `-mt-md` triệt tiêu `gap-md` của `sheet` (16) để không cộng
         thành 28 và đẩy vùng nút xuống thấp hơn thiết kế 16dp. */
      footer: '-mt-md px-4 pt-sm',
      /* Lớp neo tấm xuống đáy, nằm TRONG vùng né bàn phím. */
      anchor: 'flex-1 justify-end',
    },
    variants: {
      /**
       * Đệm mặc định của vùng nội dung.
       *
       * `true` (mặc định) = `content BS` của Figma: đệm ngang 16, khối cách nhau
       * 8 — đúng `List Bank`, `Has input`, `Has text and button`.
       * `false` = TRÀN VIỀN, dành cho 4 `Type` dạng danh sách (`Danh sách chọn`,
       * `List thao tác`, `List Chức năng`, `List checkbox`): Figma vẽ row rộng
       * đủ 375, khe 0, và row TỰ lo đệm ngang 16 của nó để dải nhấn lúc bấm
       * chạy hết bề ngang màn hình.
       */
      padded: {
        true: { body: 'gap-xs px-4' },
        /**
         * ⚠️ Tấm tràn viền còn kéo khe TIÊU ĐỀ ↔ NỘI DUNG từ 16 xuống **12**.
         *
         * Figma đo được: `content BT/list select` (`259:94887`) header kết thúc
         * ở y=24 và `content BS` bắt đầu ở y=36 ⇒ 12; `content BT/list checkbox`
         * cũng 12. Còn `has description text & button` (`259:94916`) — tấm dạng
         * THÔNG TIN, tức nhánh `padded` — thì 16. Bản thiết kế không nhất quán
         * giữa hai KIỂU tấm, nên khe đi theo đúng kiểu tấm thay vì chọn một số
         * cho cả hai.
         *
         * ⛔ `footer` phải đổi cùng: nó dùng lề âm để TRIỆT TIÊU khe của `sheet`
         * (xem chú thích ở slot đó). Để `-mt-md` với `gap-sm` là dư 4dp âm và
         * vùng nút bị kéo tụt lên đè vào nội dung.
         */
        false: { body: 'gap-0 px-0', footer: '-mt-sm', sheet: 'gap-sm' },
      },
    },
    defaultVariants: { padded: true },
  },
  { twMergeConfig },
);

/** Figma ghi "MAX HEIGHT: 742PX" trên khung 812 — giữ theo TỈ LỆ để máy nào cũng đúng. */
export const SHEET_MAX_HEIGHT_RATIO = 742 / 812;

/**
 * Figma ghi HAI mốc chiều cao tối thiểu, không phải một:
 *   · **200** — "Bottom sheet dạng list thao tác, chức năng" ⇒ đúng bốn `Type`
 *     tràn viền mà biến thể `padded={false}` dựng.
 *   · **229** — "Bottom sheet dạng list thông tin" ⇒ `content BS` (List Bank,
 *     Has input, Has text and button), tức biến thể `padded` mặc định.
 *
 * ⚠️ Repo trước đây có cả hai số nhưng ở hai file khác nhau (`TooltipSheet`
 * dùng 229) và `BottomSheet` khoá cứng 200 cho mọi ca. Nay suy từ `padded`, và
 * prop `minHeight` của `BottomSheet` vẫn đè được khi bản vẽ của màn nói khác.
 */
const SHEET_MIN_HEIGHT = 200;

/** Tấm dạng LIST THÔNG TIN — xem chú thích của `SHEET_MIN_HEIGHT`. */
const SHEET_MIN_HEIGHT_INFO = 229;

/** Mốc tối thiểu suy từ KIỂU tấm (`padded`) — xem `SHEET_MIN_HEIGHT`. */
export const sheetMinHeight = (padded: boolean) =>
  padded ? SHEET_MIN_HEIGHT_INFO : SHEET_MIN_HEIGHT;
