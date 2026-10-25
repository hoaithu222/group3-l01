import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { tv, type VariantProps } from 'tailwind-variants';

import { type ThemeColorKey } from '@/shared/theme';
import { twMergeConfig } from '@/shared/utils/style/cn';

import { DashedRule } from './DashedRule';

/**
 * Ba mức dày, lấy từ hai cỡ của Figma cộng một mức mảnh hơn cho màn hình thật.
 *
 * ⚠️ `hairline` là mặc định của nét LIỀN, không phải `thin` (=1dp, đúng số của
 * Figma). `StyleSheet.hairlineWidth` là 1 PIXEL VẬT LÝ — 0.5dp trên màn ×2,
 * 0.33dp trên ×3. Đặt cứng 1dp thì trên máy Android mật độ cao đường kẻ dày gấp
 * hai ba lần đường kẻ của chính hệ điều hành, và cả app trông thô ngay từ cái
 * nhìn đầu. Cần đúng con số Figma (bản vẽ web 1×) thì truyền `thickness="thin"`.
 *
 * ⚠️ Nét ĐỨT mặc định `thin` — xem chú thích ở chỗ tính `size` trong `Divider`.
 */
const THICKNESS = {
  hairline: StyleSheet.hairlineWidth,
  thin: 1,
  thick: 8,
} as const;

/**
 * Đường kẻ phân cách.
 *
 * Số đo lấy từ Figma "BIDV OMNI MB / Divider" (`259:97329`). Bộ đó có đúng sáu
 * biến thể, gộp lại thành ba trục prop:
 *   · `Horizontal|Vertical` × `Solid|Dash` ở cỡ **Small** — nét 1dp, gạch 2/2;
 *   · `Horizontal|Vertical` cỡ **Medium** — KHỐI ĐẶC dày 8dp, chỉ có nét liền.
 * Cỡ Medium không phải "đường kẻ dày" mà là thanh ngăn giữa hai NHÓM nội dung
 * (kiểu khoảng xám giữa các thẻ trong màn hình danh sách) ⇒ `thickness="thick"`.
 *
 * Figma không có bản Medium + nét đứt, nhưng API vẫn nhận: SVG vẽ được, và chặn
 * lại chỉ tạo ra một ngoại lệ phải nhớ.
 *
 * ⚠️ Đường DỌC không tự có chiều cao. Nó lấy chiều cao của hàng chứa nó
 * (`self-stretch`), nên đặt trong `<View className="flex-row">` là chạy; đặt
 * trong một cột thì cao 0 và bạn thấy… không gì cả. Cần chiều cao cố định thì
 * truyền qua `className="h-xl"`.
 */
const divider = tv(
  {
    slots: {
      root: 'w-full flex-row items-center gap-sm',
      line: 'flex-1',
      // "HOẶC" là NỘI DUNG (nó nói hai khối dưới là hai lựa chọn thay nhau),
      // không phải trang trí: `fg-4` chỉ 1.73:1 trên thẻ trắng và 1.57:1 trên
      // `bg-base`. `fg-2` cho 5.74:1 / 5.22:1 sáng, 8.42:1 / 11.04:1 tối.
      label: 'text-caption-sm font-medium text-fg-2',
    },
    variants: {
      orientation: {
        horizontal: {},
        vertical: { root: 'w-auto flex-col self-stretch' },
      },
      tone: {
        default: { line: 'bg-divider-1' },
        strong: { line: 'bg-divider-2' },
      },
    },
    defaultVariants: { orientation: 'horizontal', tone: 'default' },
  },
  { twMergeConfig },
);

type DividerVariants = VariantProps<typeof divider>;

export type DividerOrientation = NonNullable<DividerVariants['orientation']>;
export type DividerTone = NonNullable<DividerVariants['tone']>;
export type DividerThickness = keyof typeof THICKNESS;
export type DividerStyle = 'solid' | 'dashed';

/** Cùng một tông phải ra cùng một màu ở cả hai lối vẽ — nền `View` và `stroke` SVG. */
const TONE_TOKEN = {
  default: 'divider-1',
  strong: 'divider-2',
} as const satisfies Record<DividerTone, ThemeColorKey>;

export interface DividerProps {
  className?: string;
  /**
   * Thụt hai đầu, tính bằng dp. Trong Figma, divider của danh sách nằm ở x=16
   * trong thẻ rộng 343 ⇒ `inset={16}` là con số dùng lại nhiều nhất (343 − 32 = 311).
   *
   * ⛔ Cài bằng ĐỆM TRONG (`padding`), không phải LỀ NGOÀI (`margin`). Yoga theo
   * đúng box model của CSS: `w-full` là 100% bề rộng hộp NỘI DUNG của cha, còn
   * `margin` cộng THÊM ra ngoài con số đó ⇒ `marginHorizontal: 16` làm khối
   * chiếm 100% + 32dp và đường kẻ THÒ RA khỏi mép phải của cha 32dp — ngược hẳn
   * với ý "thụt vào". Cha có `overflow: hidden` thì chỉ thấy đường kẻ "bị lệch",
   * không thấy phần tràn, nên lỗi này rất tốn thời gian để lần ra.
   * `padding` thì trừ vào BÊN TRONG: `line` có `flex-1` nên tự co lại đúng 311.
   *
   * ⚠️ Nhánh DỌC dùng `self-stretch` (stretch có TRỪ margin) nên trước đây vô
   * tình đúng. Vẫn đổi sang `padding` cho hai hướng cùng một cơ chế — hai lối
   * tính khác nhau trong cùng một prop là chỗ người sau chắc chắn hiểu nhầm.
   */
  inset?: number;
  /**
   * Chữ giữa đường kẻ ("HOẶC"). ⚠️ MỞ RỘNG NGOÀI FIGMA — bộ Divider của ngân
   * hàng chưa có biến thể này, nên cỡ chữ (`text-caption-sm`) và khoảng cách
   * (`gap-sm`) là do đây tự chọn, chưa có bản vẽ đối chiếu.
   * Chỉ có tác dụng với đường NGANG: chữ xoay dọc thì không đọc được.
   *
   * ⚠️ Truyền CHUỖI thì kiểu chữ do component quyết (`text-caption-sm`) và
   * `className` của `Divider` không với tới được nó — nó đi vào lớp gốc. Cần cỡ
   * hay màu khác thì truyền thẳng phần tử: `label={<Text className="…">…</Text>}`.
   */
  label?: ReactNode;
  orientation?: DividerOrientation;
  /**
   * Bề dày. Mặc định `hairline` cho nét LIỀN và `thin` (1dp) cho nét ĐỨT — xem
   * chú thích ở chỗ đặt giá trị mặc định.
   */
  thickness?: DividerThickness;
  /**
   * Sắc độ đường kẻ.
   *
   * ⚠️ `strong` là ➕ MỞ RỘNG NGOÀI FIGMA: bộ Divider của ngân hàng chỉ có MỘT
   * màu `#EEEEEE` (= `divider-1` = `default`). `divider-2` (#E6E6E6) không xuất
   * hiện trong bản vẽ Divider nào — nó có ở đây cho những chỗ đường kẻ phải ăn
   * đứt nền xám, và ⛔ không có node Figma nào để đối chiếu.
   */
  tone?: DividerTone;
  variant?: DividerStyle;
}

export function Divider({
  className,
  inset = 0,
  label,
  orientation = 'horizontal',
  thickness,
  tone = 'default',
  variant = 'solid',
}: DividerProps) {
  const styles = divider({ orientation, tone });
  const vertical = orientation === 'vertical';
  /**
   * ⛔ Mặc định KHÁC NHAU giữa hai lối vẽ, không phải một hằng số duy nhất.
   *
   * Nét LIỀN mặc định `hairline` vì lý do ở khối `THICKNESS`: 1 pixel vật lý là
   * đúng độ mảnh mà hệ điều hành dùng.
   * Nét ĐỨT thì ngược lại — `StyleSheet.hairlineWidth` chỉ 0.33dp trên màn ×3,
   * và gạch `2 2` vẽ ở stroke 0.33 ra một chuỗi chấm mảnh gần như KHÔNG THẤY
   * (trên máy sáng ngoài trời thì mất hẳn). Nét đứt phải đủ dày mới đọc ra là
   * "đứt" chứ không phải "bẩn màn hình" ⇒ mặc định `thin` = 1dp, đúng con số
   * Figma. ⚠️ Nơi gọi vẫn đè được bằng prop `thickness`.
   */
  const size = THICKNESS[thickness ?? (variant === 'dashed' ? 'thin' : 'hairline')];
  /**
   * ⚠️ `false` và chuỗi rỗng cũng là KHÔNG CÓ NHÃN. Mẫu quen tay
   * `label={showLabel && 'HOẶC'}` truyền xuống `false`; chỉ loại `undefined` với
   * `null` thì `hasLabel` vẫn TRUE và divider vẽ HAI đoạn kẻ nửa bề rộng cách
   * nhau `gap-sm` mà giữa không có chữ nào — một khoảng hở không ai giải thích
   * được, và React không vẽ `false` nên cũng chẳng có lỗi nào báo.
   */
  const hasLabel =
    !vertical && label !== undefined && label !== null && label !== false && label !== '';

  const rule = () =>
    variant === 'dashed' ? (
      <DashedRule colorKey={TONE_TOKEN[tone]} thickness={size} vertical={vertical} />
    ) : (
      <View className={styles.line()} style={vertical ? { width: size } : { height: size }} />
    );

  return (
    <View
      /**
       * Đường kẻ là TRANG TRÍ thuần: nó chia nội dung bằng thị giác, còn trình
       * đọc màn hình đã có thứ tự đọc riêng. Không chặn thì người dùng khiếm
       * thị phải vuốt qua một phần tử trống sau mỗi mục danh sách.
       *
       * ⚠️ Phải khai CẢ HAI: `accessibilityElementsHidden` chỉ iOS nghe,
       * `importantForAccessibility` chỉ Android nghe. Bỏ một cái là hở một nền.
       *
       * Bản CÓ CHỮ thì không chặn — "HOẶC" là thông tin thật, mất nó thì người
       * dùng khiếm thị không biết hai khối bên dưới là hai lựa chọn thay thế
       * nhau. Hai đường kẻ hai bên vẫn im lặng vì `View` rỗng không được đọc.
       */
      accessibilityElementsHidden={!hasLabel}
      className={styles.root({ className })}
      importantForAccessibility={hasLabel ? 'auto' : 'no-hide-descendants'}
      // ⛔ `padding`, KHÔNG phải `margin` — xem chú thích ở prop `inset`.
      style={vertical ? { paddingVertical: inset } : { paddingHorizontal: inset }}
    >
      {rule()}
      {hasLabel ? (
        <>
          {typeof label === 'string' ? <Text className={styles.label()}>{label}</Text> : label}
          {rule()}
        </>
      ) : null}
    </View>
  );
}
