/**
 * Page-header sub-widget — token + `tv()` recipe riêng.
 *
 * ⛔ TÁCH KHỎI `header.theme.ts` theo `clean-code-standards.md §3` (file
 *    `*.theme.ts` trần 250 dòng → "tách theo sub-widget"). Vỏ thanh + logo +
 *    khối user ở `header.theme.ts`; mọi thứ do PAGE bơm vào nằm ở đây.
 *
 * Thang 6 bậc bề rộng + bậc `touch:` — đọc docblock đầu `header.theme.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⛔ CHIP CỦA PAGE KHÔNG CÓ `border` — ĐỌC TRƯỚC KHI THÊM LẠI
 * ─────────────────────────────────────────────────────────────────────────
 * Chip là HÌNH BÌNH HÀNH cắt bằng `clip-path` (xem `PageHeaderChip.CLIP`), mà
 * `clip-path` CẮT MẤT cả `border` lẫn `box-shadow` của chính phần tử. Viền 1px
 * vì thế dựng bằng HAI LỚP chồng nhau — `edge` (nền sáng, `inset-0`) bị `face`
 * (`inset-px`) phủ lên chỉ chừa đúng 1px — còn quầng sáng dùng
 * `filter: drop-shadow` trên wrapper để bám đúng hình đã clip.
 *
 * Bản trước dựng chip bằng `border border-primary-5/20` + đổi độ mờ viền theo
 * state (`hover:border-primary-5/50`, `active → border-primary-5/70`). Ba lỗi
 * cùng lúc, đều THẤY ĐƯỢC trên màn:
 *
 *  1. HOVER ĐÈ ACTIVE. `hover:*` nằm cùng slot với class của `active`, mà
 *     modifier khác nhau nên tailwind-merge KHÔNG loại nhau: rê chuột lên chip
 *     BẤT KỲ là nó nhận viền 50% + `bg-nav-hover-bg`, còn rê lên chính chip
 *     ĐANG MỞ thì viền TỤT từ 70% xuống 50% và chữ mất luôn `text-primary-5`.
 *     Kết quả trên ảnh chụp: chip dưới con trỏ (vd "Nghiệm thu") có khung xanh
 *     rõ, còn chip thật sự đang mở ("Gói thầu") thì phẳng — đọc ra như tab
 *     active bị nhảy sang chip khác.
 *  2. VIỀN LÀ TÍN HIỆU DUY NHẤT. Idle 20% trên nền header gần như vô hình nên
 *     cả dải đọc ra "không có tab", chỉ trơ đúng một khung chữ nhật lạc lõng.
 *  3. KHUNG CHỮ NHẬT SAI NGÔN NGỮ. Ô vuông + viền là ngôn ngữ của cụm UTILITY
 *     toàn cục vế phải (`HEADER_ICON_BUTTON_CLASS`); trộn vào đây là thanh
 *     header có hai loại "nút" mà user không đọc ra khác biệt.
 *
 * Cách sửa ĐÚNG: state phân cấp bằng NỀN + ĐỘ MỜ CỦA CẢ HÌNH (`surface`), và
 * hover chỉ được nâng chip IDLE lên — nhánh `active: false` mới mang
 * `group-hover:opacity-100`, nhánh `true` đã ở 100% nên hover không còn gì để
 * đổi. Nhờ vậy hover KHÔNG BAO GIỜ vượt mặt active được nữa.
 */
import { tv } from 'tailwind-variants';

import { twMergeFontExtend } from '@/shared/utils/style/cn';

const TV = { twMergeConfig: twMergeFontExtend } as const;

/**
 * Chiều cao chip của page = ĐÚNG NỬA chiều cao thanh (22px trên thanh 44px →
 * 28px trên thanh 56px). Cố ý KHÁC `HEADER_CONTROL_HEIGHT`: chip page tụt sát
 * mép dưới như dải tab mọc lên từ ray đáy — việc neo đáy do CỤM làm
 * (`pageHeaderStyles.cluster` → `[&_[data-header-chip]]:self-end`), KHÔNG phải
 * chip tự neo.
 */
export const PAGE_CHIP_HEIGHT = 'h-5.5 wide:h-7';

// ── Bảng tên module + cụm tâm ──────────────────────────────────────────────
export const pageHeaderStyles = tv(
  {
    slots: {
      /**
       * Cụm tâm: [ô nav trái] ⟨bảng tên⟩ [ô nav phải].
       *
       * ⛔ Selector neo đáy là HẬU DUỆ (`&_`), KHÔNG phải CON TRỰC TIẾP (`&>`).
       *    Dải chip nằm trong ô `navCell`, không còn là con trực tiếp của cụm —
       *    bản trước để `[&>[data-header-chip]]:self-end` nên luật này KHÔNG BAO
       *    GIỜ khớp và chip chỉ tình cờ nằm đúng chỗ nhờ `items-end` của ô.
       */
      cluster: [
        'pointer-events-auto flex h-full min-w-0 items-center justify-center',
        'gap-1 wide:gap-1.5',
        '[&_[data-header-chip]]:self-end',
      ],
      /**
       * Ô chứa MỘT cụm nav, đặt hai bên bảng tên.
       *
       * ⛔ `flex-1 basis-0` LÀ THỨ GIỮ BẢNG TÊN ĐÚNG TÂM — đừng gỡ. Bản trước
       *    xếp phẳng `[nav][bảng tên][nav]` nên thứ được canh giữa là CẢ CỤM,
       *    còn bảng tên lệch khỏi tâm đúng `(rộng trái − rộng phải) / 2`. Hai ô
       *    cùng `flex-grow` + cùng `flex-basis: 0` thì LUÔN rộng bằng nhau ⇒
       *    bảng tên nằm chính giữa bất kể hai cụm nav dài ngắn ra sao. Vì thế
       *    `PageHeader` render CẢ HAI ô kể cả khi một bên rỗng.
       *
       * `justify-*` (variant `side`) cho chip ÔM SÁT bảng tên, phần dôi của ô nở
       * ra phía mép thanh.
       *
       * ⛔ `items-center` + `h-full`, KHÔNG phải `items-end`: việc tụt chip
       *    xuống ray đáy do `[&_[data-header-chip]]:self-end` của cụm lo. Đặt
       *    `items-end` cho cả ô thì control neo GIỮA của trang (nút quay lại
       *    `anchor="center"`) cũng bị kéo xuống đáy theo.
       *
       * ⛔ KHÔNG đặt `overflow-x-auto` ở đây. Vùng cuộn ngang của cụm tâm nay
       *    nằm ở `headerStyles.center` (giống bản gốc). Thêm một vùng cuộn nữa
       *    ở đây là cuộn LỒNG NHAU, và `overflow-x: auto` còn ép `overflow-y`
       *    tính ra `auto` nên nó CẮT quầng `drop-shadow` của chip đang bật ở
       *    mép trên/dưới, đồng thời XÉN CỤT nhãn tab (đã thấy "Tiến độ" bị cắt
       *    còn "Tiến").
       *
       * ⛔ Sàn bề rộng chép ĐÚNG bản gốc: `min-w-0` ở màn rộng (còn chỗ nên ô
       *    không cần sàn), nhưng `touch:min-w-fit max-lg:min-w-fit` ở máy chạm và
       *    dưới 1024px — nơi thật sự chật — để flex KHÔNG bóp ô xuống dưới bề
       *    rộng nội dung. Tab là ĐƯỜNG ĐI giữa các màn, chật thì CUỘN chứ không
       *    được xén chữ (`ipad-responsive.md §4`) — việc cuộn do `center` lo.
       */
      navCell: [
        'flex h-full min-w-0 flex-1 basis-0 items-center gap-1 wide:gap-1.5',
        'touch:min-w-fit max-lg:min-w-fit',
      ],
      /**
       * Bảng tên module — dải FULL-BLEED cao trọn thanh, cắt vát hai vai
       * (keystone). ⛔ `h-full` là cố ý: nhờ vậy hairline đáy của bảng tên nối
       * liền `rail` đáy header. Đừng gán `HEADER_CONTROL_HEIGHT` vào đây, bảng
       * tên KHÔNG phải một "nút".
       *
       * `--plate-cut` = độ vát HAI VAI, đọc bởi `clipPath` trong
       * `PageHeaderTitle`. Vát phải co theo đệm mép, nếu không vai cắt vào cánh
       * vạch chéo: 8px → 16px → 20px.
       *
       * HAI CON SỐ LÀM HAI VIỆC KHÁC NHAU, đừng chỉnh chung nhịp:
       *  · `px-*` = đệm MÉP  → khoảng giữa vai vát và cánh `///`. Giữ SIẾT.
       *  · `gap-*` = khe TRONG → khoảng giữa cánh `///` và CHỮ. Khe là thứ DUY
       *    NHẤT tách hai lớp nghĩa đó; hẹp quá thì vạch chéo đọc ra như một ký
       *    tự lạ mọc thêm đầu tiêu đề.
       */
      plate: [
        'pointer-events-auto relative isolate flex h-full min-w-0 items-center justify-center',
        'gap-1 px-1.5 md:gap-2 md:px-2 xl:gap-2.5 wide:gap-3 wide:px-3',
        '[--plate-cut:8px] md:[--plate-cut:16px] wide:[--plate-cut:20px]',
      ],
      /** Nền vát (trapezoid) — vẽ riêng để hairline đáy không bị clip cắt mất. */
      plateBg: 'pointer-events-none absolute inset-0 -z-10',
      /** Hairline đáy — nối tiếp ngôn ngữ `rail` của header. */
      plateRail: 'pointer-events-none absolute inset-x-0 bottom-0 h-px',
      /**
       * Cánh 3 vạch chéo nhạt dần hai bên bảng tên — nét nhận diện của keystone.
       * Ẩn dưới `md` (điện thoại): ở đó thanh chỉ còn ~390px, mọi pixel phải
       * dành cho nội dung. `md:` là ranh giới DUY NHẤT của cánh.
       */
      wing: 'relative hidden shrink-0 items-center gap-0.5 md:flex xl:gap-[3px] wide:gap-1',
      /**
       * Một vạch chéo trong cánh. ⛔ CHIỀU NGHIÊNG do variant `side` quyết định,
       * KHÔNG đặt cứng ở đây: hai cánh phải ĐỐI XỨNG GƯƠNG, đúng hướng hai vai
       * vát của nền bảng tên — vai TRÁI `/`, vai PHẢI `\`. Để cả hai cùng một
       * chiều nghiêng là cả cụm đọc ra như bị lệch một bên.
       */
      wingBar: 'h-2.5 w-0.5 xl:h-3 xl:w-[3px] wide:h-3.5 wide:w-1',
      /** Cột chữ: [tiêu đề] trên, [dòng phụ] dưới. Luôn render để DOM một đường. */
      titleBlock: 'relative flex min-w-0 flex-col items-center justify-center leading-none',
      /**
       * ⛔ `min-w-0` + `truncate` là cặp bắt buộc — thiếu `min-w-0` thì flex item
       *    không co dưới min-content và `truncate` không bao giờ chạy.
       */
      title: 'relative block min-w-0 truncate text-center',
      /**
       * DÒNG PHỤ — ngữ cảnh của bản ghi đang mở (ngày · trạng thái…). CHỈ MỘT
       * HÀNG, LUÔN `truncate`: bảng tên cao trọn thanh (44/56px) và tiêu đề đã
       * ăn hết phần trên. Cỡ chữ cố ý bé hơn hẳn tiêu đề để phân cấp rõ.
       */
      subtitle: [
        'flex w-full min-w-0 items-center justify-center gap-1 truncate',
        'text-caption-10-medium leading-[1.3]! text-fg-on-nav-subtle',
        'max-md:hidden',
      ],
    },
    variants: {
      /**
       * `left`/`right` dùng chung cho CÁNH vạch chéo và cho `navCell`: ô nav
       * TRÁI dồn chip về mép PHẢI của ô (ôm sát bảng tên), ô PHẢI dồn về mép
       * TRÁI. Phần dôi nở ra phía mép thanh.
       */
      side: {
        left: {
          // `ms-*` = lùi khỏi mép TRÁI. Cùng số với `me-*` của cánh phải, nếu
          // không hai cánh lệch tâm.
          wing: 'flex-row-reverse md:ms-1 wide:ms-1',
          wingBar: '-skew-x-[20deg]',
          /**
           * ⛔ `-safe` (= `justify-content: safe flex-end`) LÀ BẮT BUỘC, không
           *    phải `justify-end` trơn. Ô này là VÙNG CUỘN; canh `flex-end`
           *    thường đẩy phần tràn ra NGOÀI mép start, mà trình duyệt chỉ sinh
           *    vùng cuộn về phía end ⇒ chip đầu dải bị cắt và KHÔNG có cách nào
           *    vuốt tới (đúng lỗi `ipad-responsive.md §4` cấm). Canh `safe` tự
           *    rơi về `start` ĐÚNG LÚC tràn, nên khi còn chỗ chip vẫn ôm sát
           *    bảng tên, còn khi hết chỗ thì cuộn được đủ cả dải.
           * Ô PHẢI không cần: `justify-start` vốn đã cùng chiều cuộn.
           */
          navCell: 'justify-end-safe',
        },
        right: {
          wing: 'md:me-1 wide:me-1',
          wingBar: 'skew-x-[20deg]',
          navCell: 'justify-start',
        },
      },
      /**
       * Cụm tâm có HAI Ô BÊN hay chỉ có mỗi bảng tên.
       *
       * ⛔ `w-full` là mắt xích cuối của việc canh giữa: ô bên là `flex-1
       *    basis-0`, mà `flex-grow` chỉ chia được phần DÔI — cụm phải rộng đúng
       *    bằng slot thì mới có phần dôi để chia đều hai bên.
       *
       * ⛔ SÀN bề rộng bảng tên CHỈ bật ở đây. Hai ô bên có hệ số co thực tế
       *    `shrink × basis = 1 × 0 = 0` ⇒ 100% phần co dồn vào bảng tên (flex
       *    item duy nhất còn `basis:auto`). Không có sàn thì tiêu đề teo còn "…"
       *    trong khi dải tab hai bên vẫn nguyên bề rộng. Sàn là mức CHỐNG SẬP,
       *    không phải bề rộng mong muốn — để cao là tiêu đề ngắn bị ép rộng ra.
       */
      sided: {
        true: {
          cluster: 'w-full',
          titleBlock: 'min-w-[48px] md:min-w-[56px] xl:min-w-[64px] wide:min-w-[88px]',
          title: 'max-w-[9rem] xl:max-w-[13rem] wide:max-w-[20rem]',
        },
        false: { title: 'max-w-[12rem] xl:max-w-[20rem] wide:max-w-[30rem]' },
      },
      size: {
        /** Tiêu đề TĨNH của module — chuỗi ngắn do hệ thống đặt. */
        md: {
          title: [
            'text-body-14-bold tracking-[0.01em]',
            'md:text-body-16-bold md:tracking-[0.02em]',
            'xl:text-body-18-bold xl:tracking-[0.03em]',
            'wide:text-h3-bold wide:tracking-[0.05em]',
          ],
        },
        /**
         * Tiêu đề ĐỘNG của trang chi tiết (TÊN BẢN GHI do user đặt, dài tuỳ ý).
         *
         * ⛔ PHẢI ĐÈ `--plate-cut` Ở BẬC GỐC: biến thể này hạ đệm xuống `px-1`
         *    (4px) mà bậc gốc lại là bậc CÁNH BỊ ẨN (`wing` là `hidden md:flex`)
         *    — không có cánh thì vai vát cắt thẳng vào ô chữ. Kế thừa vát 8px là
         *    ăn lẹm ~2px vào chính tên bản ghi.
         */
        sm: {
          plate: 'gap-1 px-1 md:gap-1.5 md:px-2 xl:gap-2 wide:gap-2.5 wide:px-3 [--plate-cut:3px]',
          title: [
            'text-caption-12-bold tracking-[0.01em]',
            'md:text-body-14-bold',
            // ⛔ 14" (`xl`) GIỮ 14px: cụm tâm ở bậc này chỉ còn ~590px sau khi
            //    trừ hai mép. To thêm một bậc là mất ~12% số ký tự đọc được.
            'xl:tracking-[0.02em]',
            '2xl:text-body-16-bold',
            'wide:text-body-16-bold wide:tracking-[0.03em]',
          ],
        },
      },
      /**
       * Có dòng phụ → bảng tên thành 2 hàng trong đúng 44/56px chiều cao thanh.
       *
       * ⛔ `pt-*` = HẠ CẢ RUỘT BẢNG TÊN XUỐNG CHO KHỚP RAY ĐÁY. Đừng gỡ, và đừng
       *    đổi sang `items-end`.
       *
       * `plate` là dải full-bleed `h-full items-center` nên ruột canh giữa
       * THANH; chip của trang thì `self-end`, cao đúng NỬA thanh. Một hàng chữ
       * thì hai cách neo đó nhìn ra vẫn cùng hàng; HAI hàng thì khối chữ cao
       * ~29px, tâm nó ở GIỮA thanh trong khi tâm dải chip ở 3/4 chiều cao ⇒ bảng
       * tên đọc ra như bị đẩy LÊN. Mốc canh: DÒNG PHỤ ngang tâm dải chip.
       *
       * ⚠️ `items-end` + `pb-*` ra đúng con số ấy nhưng neo CÁNH `///` theo mép
       *    dưới khối chữ ⇒ cánh tụt xuống ngang dòng phụ. `pt-*` dịch CẢ CỤM
       *    (cánh + cột chữ) như một khối nên giữ nguyên tương quan đã cân.
       *
       * ⛔ Gate `md:` vì `subtitle` là `max-md:hidden` — dưới `md` không có hàng
       *    thứ hai thì cũng không được hạ ruột xuống.
       *
       * ⚠️ Nền vát (`plateBg`) và hairline đáy (`plateRail`) là `absolute` nên
       *    KHÔNG nhúc nhích: dải vẫn full-bleed, ray đáy vẫn nối liền.
       */
      withSubtitle: {
        true: {
          plate: 'md:pt-1.5 wide:pt-2.5',
          title: 'w-full text-center leading-[1.15]!',
        },
        false: {},
      },
    },
    defaultVariants: { side: 'left', sided: false, size: 'md', withSubtitle: false },
  },
  TV,
);

// ── Chip của page (tab · back · action) ────────────────────────────────────
/**
 * MỘT recipe cho CẢ dải chip lẫn từng chip — chip tab, chip action và nút
 * icon-only phải trông y hệt nhau, chỉ khác state. Tách làm hai recipe là kiểu
 * gì cũng lệch nhau một bậc padding hoặc một nấc cỡ chữ.
 *
 * ⛔ MÀU CHIP LUÔN `primary` ở MỌI MODULE — KHÔNG bám `tone` của bảng tên. Chip
 *    là control BẤM ĐƯỢC nên phải cùng hệ màu với nút icon / nút action của
 *    header; tone module chỉ dành cho bảng tên (thứ KHÔNG bấm được).
 */
export const pageNavStyles = tv(
  {
    slots: {
      /** Dải chip — hàng ngang, neo đáy do cụm cha lo (`data-header-chip`). */
      root: 'flex shrink-0 items-center gap-0.5 md:gap-1 wide:gap-1.5',
      item: [
        // `group` cho `group-hover` của `surface`; `isolate` giữ `-z-10` của
        // surface nằm trong chính chip chứ không tụt xuống dưới nền header.
        'group relative isolate inline-flex shrink-0 items-center',
        // Hộp bấm ĐÚNG BẰNG hình vẽ ra (`surface` là `inset-0`) nên mép dưới hộp
        // = mép dưới chip: `self-end` là chip nằm sát ray đáy, không hở khe.
        PAGE_CHIP_HEIGHT,
        // Độ vát của hình bình hành — `PageHeaderChip.CLIP` đọc biến này.
        // Vát phải ≤ đệm ngang, nếu không chữ đâm vào phần vát.
        '[--chip-cut:4px] md:[--chip-cut:6px] wide:[--chip-cut:8px]',
        // Hai mép vát ĐỀU NHAU nên đệm hai bên bằng nhau. Ở giữa chiều cao, mép
        // chỉ ăn vào `--chip-cut / 2` (2 → 3 → 4px) nên 6/10/14px đủ thoáng.
        'gap-0.5 px-1.5 md:gap-1 md:px-2.5 wide:gap-1.5 wide:px-3.5',
        'cursor-pointer select-none whitespace-nowrap outline-none',
        /**
         * ⛔ VÙNG CHẠM NỚI BẰNG LỚP `::after` TRONG SUỐT — KHÔNG PHÓNG TO CHIP.
         *    Máy tính bảng dùng CHUNG mọi con số hình học với laptop; lớp này
         *    kéo hộp NHẬN CHẠM từ 22px lên 32px mà không đổi một pixel HÌNH nào.
         * ⛔ CHỈ NỚI LÊN TRÊN (`-top-2.5` + `bottom-0`): chip dính ĐÁY thanh,
         *    nới xuống là lớp trong suốt tràn vào nội dung trang và nuốt cú chạm
         *    của thứ nằm ngay dưới header.
         * ⛔ CHỈ NỚI DỌC (`inset-x-0`): hai chip cạnh nhau chỉ cách 4px, nới
         *    ngang là hai vùng chạm chồng nhau → bấm ra nhầm tab.
         * ⛔ `content-['']` BẮT BUỘC — thiếu nó pseudo-element không được sinh ra
         *    và cả khối này im lặng thành vô tác dụng.
         */
        "touch:after:absolute touch:after:inset-x-0 touch:after:-top-2.5 touch:after:bottom-0 touch:after:content-['']",
        // Chip tab KHÔNG có icon, nhưng action đứng cạnh nó thì có → ép cỡ icon
        // ngay tại đây để hai loại nút không lệch. `!` bắt buộc vì `SystemIcon`
        // set width/height bằng INLINE STYLE (thắng class thường).
        // ⛔ KHÔNG thêm bậc `touch:`: chip trên máy tính bảng cao 22px y như
        //    laptop, icon to lên là chật khung và cả dải đọc ra như bị phóng to.
        '[&>svg]:size-3! md:[&>svg]:size-3.5! wide:[&>svg]:size-4!',
        // ⛔ SÀN: cỡ chữ KHÔNG hạ dưới 10px ở bất kỳ bậc màn nào — `uppercase`
        //    dưới 10px trên nền gradient là đọc không ra. Hết chỗ thì CUỘN
        //    (`pageHeaderStyles.navCell`), không thu chữ.
        'text-caption-10-medium uppercase tracking-[0.01em] md:tracking-[0.03em]',
        'wide:text-caption-12-medium wide:tracking-[0.06em]',
        // ⛔ CHỈ transition `color` + `transform`. Nền/viền nằm ở `surface` và
        //    đổi bằng OPACITY — thấy chú thích đầu file về việc hover từng đè
        //    active khi state chạy qua `border-color`.
        'transition-[color,transform] duration-200 ease-out',
        'active:scale-[0.97]',
        // ⛔ KHÔNG `ring-offset` (bản gốc có, base thì không): `--tw-ring-offset-color`
        //    mặc định là TRẮNG và project không override nó ⇒ offset vẽ một vành
        //    trắng quanh chip ở dark theme. Cùng lý lẽ đã ghi ở `Checkbox.tsx`,
        //    và khớp luôn với `HEADER_ICON_BUTTON_CLASS`.
        'focus-visible:ring-2 focus-visible:ring-ring-focus/60',
      ],
      /**
       * Wrapper hình khối — mang `drop-shadow` (quầng sáng bám đúng hình đã clip).
       *
       * ⛔ `inset-0`, KHÔNG thụt vào: chip phải chạm ĐÚNG mép dưới hộp thì mới
       *    dính được ray đáy header. Muốn chip thấp/cao hơn thì sửa
       *    `PAGE_CHIP_HEIGHT` — thụt `inset-y` ở đây là hình tách khỏi đáy mà
       *    vùng chạm vẫn nguyên, nhìn ra một khe hở vô nghĩa.
       */
      surface: 'pointer-events-none absolute inset-0 -z-10 transition-opacity duration-200',
      /** Lớp đóng vai VIỀN: nền `primary` sáng, bị `face` phủ lên chỉ chừa 1px. */
      edge: 'absolute inset-0',
      /** Mặt chip: thụt đúng 1px so với `edge`. */
      face: 'absolute inset-px',
      label: 'relative min-w-0 truncate',
      /**
       * Cặp nhãn ĐẦY ĐỦ / RÚT GỌN — chỉ dùng khi call-site khai `shortLabel`.
       * Render CẢ HAI, để CSS chọn theo bề rộng: chip phải có đúng nhãn ngay từ
       * khung hình đầu tiên, không nháy lúc mount và không nháy khi xoay máy.
       *
       * ⛔ GATE BẰNG CẢ `max-lg:` LẪN `touch:` — hai ca khác nhau, thiếu vế nào
       *    cũng sót (`ipad-responsive.md §8.1`):
       *  · `max-lg:` (< 1024px) — chuyện HẾT CHỖ thuần tuý. iPad dọc CẮM CHUỘT
       *    (`pointer: fine`) vẫn hết chỗ y hệt nên KHÔNG gate được bằng `touch:`.
       *  · `touch:` — iPad NẰM NGANG (1180 · 1366px) đều > 1024px nên `max-lg:`
       *    không với tới, trong khi vùng chạm đã nới làm hai cụm mép phình thêm.
       * Cả hai KHÔNG BAO GIỜ khớp laptop (hẹp nhất 1280px, luôn có con trỏ).
       */
      labelFull: 'relative min-w-0 truncate max-lg:hidden touch:hidden',
      labelShort: 'relative hidden min-w-0 truncate max-lg:inline touch:inline',
    },
    variants: {
      /**
       * HƯỚNG NGHIÊNG của hình bình hành (đỉnh trên đổ về phía tiêu đề), KHÔNG
       * phải "chip nằm bên nào". Variant không mang class — nó tồn tại vì `side`
       * là thứ quyết định `clipPath` bên `ChipSurface`, và vì hai mép vát song
       * song đối xứng qua tâm nên chữ tự nằm giữa với ĐÚNG MỘT bộ padding.
       */
      side: { start: {}, end: {} },
      active: {
        /**
         * Chip BẬT: nền loang tone từ đáy lên (xem `PageHeaderChip.ACTIVE_FACE`)
         * + chữ `fg-on-nav` như bảng tên module.
         *
         * ⛔ KHÔNG dùng màu trắng cứng. Nền TRONG DẦN về phía trên nên nửa trên
         *    chip gần như là nền header — mà `fg-on-nav` ở light theme là NAVY
         *    ĐẬM. Ép chữ trắng là nửa trên chip biến mất ở theme sáng.
         *    `text-shadow` tối giữ lại để tách chữ khỏi nền xanh ở theme tối.
         */
        true: {
          // Bóng tối qua TOKEN `black-5` (đen 50%), KHÔNG `rgb(0 0 0 / .45)`
          // hardcode như bản gốc — `color-system.md` cấm màu viết cứng.
          item: 'text-fg-on-nav [text-shadow:0_1px_2px_var(--color-black-5)]',
          surface: 'opacity-100',
        },
        /**
         * Chip IDLE: mờ hẳn để chip đang mở là thứ DUY NHẤT "sáng" trong cụm;
         * hover thì sáng lên đủ 100% + chữ đặc lại.
         *
         * ⛔ NHÁNH `false` LÀ BẮT BUỘC, KHÔNG ĐƯỢC BỎ TRỐNG. Toàn bộ `hover:`
         *    của chip nằm ở ĐÂY chứ không ở slot `item` — đó là thứ bảo đảm
         *    hover KHÔNG BAO GIỜ vượt mặt active (xem docblock đầu file). Bỏ
         *    nhánh này là cả hàng chip đọc ra như đang bật hết, và hover lại
         *    quay về đè lên chip đang mở.
         */
        false: {
          item: 'text-fg-on-nav-muted hover:text-fg-on-nav',
          surface: 'opacity-60 group-hover:opacity-100',
        },
      },
      /**
       * Bậc COMPACT — chip PHỤ TRỢ của page (quay lại · lối đi hạng mục), dùng
       * khi cả cụm control của trang bám sát dải tab.
       *
       * ⛔ CHỈ SIẾT BỀ NGANG. Chiều cao GIỮ NGUYÊN `PAGE_CHIP_HEIGHT` — mọi thứ
       *    trên dải đáy cao bằng nhau. Đừng thêm `h-*` vào đây.
       * ⛔ PADDING nằm ở `compoundVariants`, KHÔNG ở đây: chip CÓ CHỮ còn chỗ để
       *    siết, chip CHỈ CÓ ICON thì không (đã ở sàn so với `--chip-cut`). Đặt
       *    thẳng vào variant này thì một trong hai ca luôn sai — và `iconOnly`
       *    khai SAU nên nó còn ghi đè mất.
       */
      compact: { true: {}, false: {} },
      /**
       * Chip CHỈ CÓ ICON (quay lại · action phụ). Đệm hẹp hơn chip có chữ, nếu
       * không một icon 14px nằm giữa ô rộng gần 90px đọc ra như nút bị lỗi.
       *
       * ⛔ SÀN = `--chip-cut` + 4px. Hai cạnh chip VÁT nên ở giữa chiều cao mỗi
       *    mép đã ăn vào `--chip-cut / 2` (2 → 3 → 4px); hẹp hơn nữa là icon đọc
       *    ra như bị ép vào cạnh xiên.
       */
      iconOnly: {
        true: { item: 'justify-center px-1.5 md:px-2 wide:px-2.5' },
        false: {},
      },
    },
    compoundVariants: [
      /**
       * CHỈ chip có chữ mới siết được. Chip icon-only KHÔNG có mục compound —
       * cố ý: đệm của nó đã ở sàn (xem `iconOnly`), siết thêm là icon chạm cạnh
       * vát. `compact` với chip icon-only vì thế là no-op, và đó là đúng.
       */
      {
        compact: true,
        iconOnly: false,
        class: { item: 'gap-0.5 px-1.5 md:px-2 wide:gap-1 wide:px-2.5' },
      },
    ],
    defaultVariants: { side: 'start', active: false, iconOnly: false, compact: false },
  },
  TV,
);
