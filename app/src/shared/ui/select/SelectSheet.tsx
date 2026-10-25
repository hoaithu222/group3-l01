import { useEffect, useMemo } from 'react';

import { matchesSearch } from '@/shared/utils/format/string.utils';

import { BottomSheet } from '../bottom-sheet/BottomSheet';
import { EmptyState } from '../empty-state/EmptyState';
import { SearchInput } from '../search/SearchInput';
import { useSearchInput } from '../search/use-search-input';
import { SelectOptionRow } from './SelectOptionRow';
import type { SelectSheetProps } from './select.types';

/**
 * Tấm trượt đáy chọn MỘT giá trị — cặp bài trùng của `Select`.
 *
 * ── ⛔ Đây là lớp bọc MỎNG, không phải một tấm trượt thứ hai ─────────────────
 * Ba luật của slide quy định (`193:25636`, `193:25705`) đã nằm sẵn trong
 * `BottomSheet`, ⛔ tuyệt đối không dựng lại:
 *  · **max-height 742 / min-height 200** — `SHEET_MAX_HEIGHT_RATIO = 742/812` và
 *    `SHEET_MIN_HEIGHT = 200` trong `bottom-sheet.styles.ts`. Giữ theo TỈ LỆ nên
 *    máy nào cũng chừa đúng dải nền mờ phía trên.
 *  · **header dính, footer dính, giữa cuộn** — `SheetHeader` và vùng `footer`
 *    nằm NGOÀI `ScrollView`; `scrollable` bật `ScrollView` cho phần giữa.
 *  · **khe dưới header 16** — `gap-md` của slot `sheet`.
 *
 * Việc còn lại của file này đúng ba thứ: chọn bộ prop, lọc danh sách, và quyết
 * định lúc nào thì đóng.
 *
 * ── ⛔ `padded` MẶC ĐỊNH (16dp), KHÔNG phải tràn viền ───────────────────────
 * ⚠️ Bản trước ở đây ghi ngược: nó chép luật của bốn `Type` "list thao tác /
 * chức năng" trong trang design system (row rộng đủ 375, tràn viền) rồi áp cho
 * tấm CHỌN. Đã mở Figma đo lại hai màn thật mà component này sinh ra để phục
 * vụ, và cả hai đều KHÔNG tràn viền:
 *  · `700:27216` (chọn Tỉnh/Thành) — `container` ở x=**16**, rộng 343; mỗi
 *    `content row` rộng 343 và TỰ có đệm 16 bên trong (khối chữ 311 ở x=16).
 *  · `365:30369` (chọn cửa hàng) — cùng bố cục, row cao 76 vì có dòng địa chỉ.
 *
 * Đọc thẳng điểm ảnh trên bản render 375dp của `700:27218`: dải nền của dòng
 * đang chọn chạy từ **x=16 tới x=358** rồi trả về trắng, và chữ "Hà Nội" bắt
 * đầu ở **x=33** — tức 16 (đệm tấm) + 16 (đệm row). Frame trong bản vẽ cũng
 * tên đúng là `content BS`, chính là kiểu mà `padded` mặc định dựng.
 *
 * ⛔ Nên KHÔNG được bỏ `px-4` của `selectOptionStyles.root`: hai lớp đệm này
 * cộng lại mới ra 32dp của bản vẽ. Bỏ một lớp là chữ dính sát mép dải tint.
 *
 * ── ⚠️ `bodyClassName="gap-0"` — khe 8 mặc định của `padded` là SAI ở đây ────
 * `padded: true` kèm `gap-xs` (8) cho những tấm mà mỗi khối là một cái thẻ
 * rời. Danh sách chọn thì các dòng DÍNH nhau và ngăn nhau bằng kẻ: ở
 * `703:28897` các row nằm ở y = 0 · 56 · 112 · 168… đúng bước 56, khe 0. Để
 * nguyên khe 8 thì kẻ phân cách và dòng kế tiếp hở ra một dải trắng, và 63 mục
 * tỉnh/thành dài thêm 8 × 62 = 496dp phải cuộn thêm.
 *
 * ── ⛔ Danh sách dựng bằng `.map()`, KHÔNG phải `FlatList` ──────────────────
 * `scrollable` của `BottomSheet` đã là một `ScrollView`; lồng `FlatList` vào
 * trong là lồng hai vùng cuộn cùng chiều — React Native cảnh báo
 * "VirtualizedLists should never be nested", cử chỉ cuộn tranh nhau và trên
 * Android danh sách trong thường không cuộn nổi. Danh sách dài nhất của bản vẽ
 * là 63 tỉnh/thành, dựng thẳng vẫn nhẹ.
 */
export function SelectSheet({
  closeOnSelect,
  emptyMessage = 'Không tìm thấy lựa chọn phù hợp.',
  footer,
  options,
  searchable = false,
  searchPlaceholder = 'Tìm kiếm',
  title,
  value,
  visible,
  onChange,
  onClose,
}: SelectSheetProps) {
  /**
   * ⛔ Ô tìm kiếm UNCONTROLLED. `<TextInput value={query}>` bị ghi đè ngay giữa
   * lúc bộ gõ Telex ghép dấu ⇒ trên Android chữ MẤT DẤU hoặc con trỏ nhảy về
   * đầu; người dùng gõ "Đà Nẵng" ra "Da Nang" rồi kết luận app hỏng. `useSearchInput`
   * giữ ô nhập tự quản chữ của nó và chỉ mang RA một bản sao cho tầng lọc.
   *
   * `delay: 0` — danh sách nằm sẵn trong bộ nhớ (≤ 63 mục), không có lượt gọi
   * mạng nào để mà chờ; nhịp trễ 300ms ở đây chỉ làm danh sách có cảm giác đơ.
   */
  const { clear, inputProps, value: query } = useSearchInput({ delay: 0 });

  /**
   * ⛔ Đóng tấm là phải xoá từ khoá. Tấm KHÔNG bị tháo khỏi cây khi đóng (nó chỉ
   * đổi `visible`), nên state từ khoá sống tiếp; mở lại thì ô tìm kiếm hiện ra
   * TRỐNG (uncontrolled, `defaultValue=''`) trong khi danh sách vẫn đang lọc
   * theo từ khoá cũ. Người dùng thấy "mất mục" mà không có gì giải thích.
   */
  useEffect(() => {
    if (!visible) clear();
  }, [clear, visible]);

  /**
   * ⛔ `matchesSearch` chứ không phải `toLowerCase().includes()`: hàm này BỎ DẤU
   * (kể cả `đ` → `d`) nên gõ "da nang" ra "Đà Nẵng". ESLint chặn cứng lối viết
   * kia — kết quả rỗng ở ô tìm kiếm bị đọc thành "app hỏng", không ai đoán ra là
   * phải gõ đủ dấu.
   *
   * ⚠️ `useMemo` bắt buộc: không có nó thì mỗi phím gõ lọc lại cả danh sách
   * TRONG lượt vẽ, và ô nhập giật trên máy yếu.
   */
  const rows = useMemo(
    () => options.filter((option) => matchesSearch(query, option.label, option.description)),
    [options, query],
  );

  /** Không có nút xác nhận ⇒ bấm một dòng là xong. Xem chú thích prop trong `select.types.ts`. */
  const shouldClose = closeOnSelect ?? footer === undefined;

  const handleSelect = (next: string) => {
    onChange(next);
    if (shouldClose) onClose();
  };

  return (
    <BottomSheet
      bodyClassName="gap-0"
      footer={footer}
      scrollable
      search={
        searchable ? <SearchInput {...inputProps} placeholder={searchPlaceholder} /> : undefined
      }
      title={title}
      visible={visible}
      onClose={onClose}
    >
      {rows.length === 0 ? (
        /* ⛔ Chỉ khai đệm DỌC: đệm ngang 16 đã do `padded` của vùng nội dung lo.
           Thêm `px-4` nữa là câu "không tìm thấy" thụt vào 32dp, lệch hẳn so với
           tiêu đề tấm và với ô tìm kiếm ngay phía trên nó. */
        <EmptyState
          className="py-lg"
          description={emptyMessage}
          icon="search"
          size="compact"
          tone="neutral"
        />
      ) : (
        rows.map((option, index) => (
          <SelectOptionRow
            key={option.value}
            /**
             * ⚠️ Kẻ phân cách là số đo thật, không phải trang trí thêm vào:
             * trên bản render của `700:27218` có một đường 1px màu #F6F6F6 ở
             * ĐÁY mỗi dòng, chạy hết bề ngang dòng (x=16..358).
             *
             * ⛔ Hai ca KHÔNG kẻ, và cả hai đều đọc được từ bản vẽ:
             *  · dòng CUỐI — kẻ ở đáy dòng cuối thành một gạch chân lửng lơ
             *    ngay trên vùng nút "Tiếp tục";
             *  · dòng ĐANG CHỌN — bản vẽ cho dải tint kết thúc gọn ở y=271 rồi
             *    sang trắng luôn, không có kẻ nào. Kẻ chồng lên mép dải tint
             *    làm nó trông như bị cắt hụt.
             */
            divider={index < rows.length - 1 && option.value !== value}
            option={option}
            selected={option.value === value}
            onSelect={handleSelect}
          />
        ))
      )}
    </BottomSheet>
  );
}
