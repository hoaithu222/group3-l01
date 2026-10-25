/**
 * ESLint flat config.
 *
 * Nền là `eslint-config-expo/flat` (đã gồm react, react-hooks, import,
 * @typescript-eslint và bộ globals của React Native). Bên trên chồng thêm:
 *
 *   · quy ước sắp xếp prop JSX — giống hệt base web `base-projects`;
 *   · chặn import vòng;
 *   · 12 selector `no-restricted-syntax` bắt những lỗi ĐÃ GÂY BUG THẬT trên
 *     máy người dùng (hoặc một quyết định sản phẩm áp cho CẢ app, như #12). Mỗi selector có ghi chú vì sao.
 *     Bảy cái (#1–#5, #9 và #11, `RESTRICTED_SYNTAX`) áp cho cả test; bốn cái (#6–#8 và #12, `SOURCE_ONLY_SYNTAX`:
 *     `Screen footer` trần, `onRefresh` trần, control thiếu nhãn, vùng cuộn hiện thanh cuộn) chỉ áp cho mã nguồn; #10 (`ACTIVITY_INDICATOR_SYNTAX`, `<ActivityIndicator>`
 *     trần) áp cho mã nguồn NGOÀI `src/shared/ui/**` — test của chính
 *     `Screen`/danh sách/control dựng chúng trần có chủ ý. (Số thứ tự theo thời điểm thêm vào.)
 *
 * ⛔ Đừng tắt bằng `eslint-disable`. Cần ngoại lệ thì sửa rule kèm lý do trong PR.
 */
const js = require('@eslint/js');
const { defineConfig, globalIgnores } = require('eslint/config');
const expoFlat = require('eslint-config-expo/flat');
const perfectionist = require('eslint-plugin-perfectionist');
const globals = require('globals');
const tseslint = require('typescript-eslint');

const RESTRICTED_SYNTAX = [
  // ── 1. <Modal> thiếu `supportedOrientations` ────────────────────────
  // <Modal> của React Native dựng một view controller RIÊNG trên iOS. Không
  // khai `supportedOrientations` thì view controller đó rơi về PORTRAIT, và
  // vì nó nằm trên cùng nên CẢ APP hết xoay được chừng nào modal còn mở.
  // Triệu chứng khó lần: người dùng mở bộ lọc, xoay ngang, không có gì xảy
  // ra, đóng bộ lọc thì xoay lại được.
  {
    selector:
      'JSXOpeningElement[name.name="Modal"]:not(:has(JSXAttribute[name.name="supportedOrientations"]))',
    message:
      '<Modal> thiếu `supportedOrientations` ⇒ iPhone khoá màn ở portrait suốt lúc modal mở. Thêm supportedOrientations={["portrait","landscape"]}.',
  },

  // ── 2. So khớp chuỗi KHÔNG bỏ dấu ──────────────────────────────────
  // `x.toLowerCase().includes(y)` không bỏ dấu tiếng Việt: gõ "met khoi"
  // KHÔNG ra "Mét khối", gõ "da nang" không ra "Đà Nẵng". Người dùng kết
  // luận là "tìm kiếm hỏng" chứ không đoán được là phải gõ đủ dấu.
  {
    selector:
      "CallExpression[callee.property.name='includes'][callee.object.callee.property.name='toLowerCase']",
    message:
      '`x.toLowerCase().includes(y)` KHÔNG bỏ dấu — gõ "met khoi" không ra "Mét khối". Dùng `includesSearch` / `matchesSearch` từ `@/shared/utils/format/string.utils`.',
  },

  // ── 3. Ô tìm kiếm controlled ────────────────────────────────────────
  // `<TextInput value={search} onChangeText={setSearch}>` mà state đi qua
  // một nhịp bất đồng bộ (debounce, cập nhật từ query, setState trong
  // effect) sẽ ghi ĐÈ lại ô nhập ngay giữa lúc bộ gõ đang ghép dấu. Trên
  // Android + Telex, đúng lúc đó là mất dấu hoặc nhảy con trỏ về đầu.
  // Cách đúng: ô nhập uncontrolled (`defaultValue`), debounce ở tầng lọc.
  {
    selector:
      "JSXOpeningElement[name.name=/^(TextInput|Input|SearchInput)$/] > JSXAttribute[name.name='value'] > JSXExpressionContainer > Identifier[name=/^(search|searchTerm|searchText|searchValue|searchQuery|query|keyword|filterText)$/i]",
    message:
      'Ô tìm kiếm controlled (`value={search}`) làm mất dấu khi gõ tiếng Việt trên Android. Dùng `{...inputProps}` từ `useSearchInput` (@/shared/ui/search) — ô nhập uncontrolled, debounce ở tầng lọc.',
  },

  // ── 4. Cỡ chữ số cứng, đi vòng qua hệ token ────────────────────────
  // Thang chữ sinh từ `src/styles/typography/typography.json` và được KIỂM
  // lineHeight theo số đo thật của font (xem scripts/generate-typography.mjs).
  // `text-[17px]` bỏ qua toàn bộ khâu đó: không ai kiểm lineHeight, và
  // Android cắt dấu `Ẳ`/`Ộ` mà không có lỗi nào báo.
  {
    selector: "JSXAttribute[name.name='className'] Literal[value=/(^|\\s)(text|leading)-\\[/]",
    message:
      'Cỡ chữ/line-height số cứng (`text-[17px]`, `leading-[20px]`) bỏ qua hệ token và khâu kiểm lineHeight cho dấu tiếng Việt. Dùng vai trò có sẵn: text-display|text-header-lg|text-header-md|text-header-sm|text-body-lg|text-body-md|text-label-lg|text-label-md|text-label-sm|text-label-xs|text-caption-lg|text-caption-sm|text-link-lg|text-link-md|text-overline. Cần cỡ mới thì thêm vào src/styles/typography/typography.json rồi `npm run generate:typography`.',
  },

  // ── 5. `className` trên `Animated.*` ────────────────────────────────
  // NativeWind chỉ gắn được `className` vào những thẻ nó ĐÃ đăng ký
  // (`View`, `Text`, `Pressable`…). Thẻ của Reanimated không nằm trong
  // danh sách: prop bị NUỐT — không lỗi, không cảnh báo, chỉ là thẻ không
  // có style nào. Bẫy này đã hỏng thật ở đây và đang được cảnh báo bằng
  // văn xuôi ở BỐN chỗ (`Skeleton.tsx`, `Toggle.tsx`, `BottomSheet.tsx`,
  // `TooltipSheet.tsx`) — bốn lời cảnh báo cho cùng một bẫy nghĩa là văn
  // xuôi không đủ, phải có hàng rào.
  //
  // ✅ Cách đúng đã dùng trong repo: đăng ký một lần rồi gán vào BIẾN —
  //    `const AnimatedView = cssInterop(Animated.View, { className: 'style' });`
  //    Lúc đó tên thẻ JSX là `AnimatedView` (một JSXIdentifier), không
  //    còn là `Animated.View` (JSXMemberExpression), nên selector bám
  //    theo tên là đủ để cho ca đúng đi qua.
  // ✅ Cách đúng thứ hai, cũng đang dùng: để `className` ở `<View>` bọc
  //    ngoài và chỉ đưa `style={animatedStyle}` cho `Animated.View`.
  //
  // ⚠️ Đi kèm một bẫy nữa mà ESLint không thấy được: `height`/`width` phải
  // nằm TRONG animated style. Reanimated ghi đè cả object `style`, khoá
  // nào worklet không trả thì mất.
  {
    selector:
      "JSXOpeningElement[name.type='JSXMemberExpression'][name.object.name='Animated']:has(JSXAttribute[name.name='className'])",
    message:
      '`className` trên `Animated.*` bị NUỐT âm thầm — NativeWind chưa đăng ký thẻ của Reanimated, prop biến mất mà không có lỗi nào báo. Đăng ký một lần rồi dùng biến: `const AnimatedView = cssInterop(Animated.View, { className: "style" })` (xem src/shared/ui/skeleton/Skeleton.tsx), hoặc để `className` ở `<View>` bọc ngoài và chỉ truyền `style={animatedStyle}` cho `Animated.View` (xem src/shared/ui/bottom-sheet/BottomSheet.tsx).',
  },

  // ── 9. `toLocaleString()` / `toLocaleDateString()` / `Intl.NumberFormat` ─────────
  // Hermes (máy JS của React Native) cắt bớt ICU: `Intl` có mặt nên code chạy, nhưng dữ liệu ngôn ngữ KHÁC NHAU giữa Android
  // và iOS ⇒ CÙNG MỘT số tiền / ngày hiện ra hai kiểu trên hai máy (`1.234,5` vs `1,234.5`; `3/4` là mùng 3 tháng 4 hay
  // ngược lại), không lỗi nào báo. Cả repo đã có hàm cố định dấu phân cách và thứ tự ngày-tháng — dùng chúng.
  // (`Intl.DateTimeFormat` KHÔNG bị chặn: nó còn dùng để ĐỌC múi giờ của máy, không để định dạng ra màn hình.)
  {
    selector:
      "CallExpression[callee.type='MemberExpression'][callee.property.name=/^toLocale(Date|Time)?String$/], :matches(NewExpression, CallExpression)[callee.type='MemberExpression'][callee.object.name='Intl'][callee.property.name='NumberFormat']",
    message:
      '`toLocaleString()`/`toLocaleDateString()`/`Intl.NumberFormat` phụ thuộc ICU của Hermes — cùng một số/ngày ra hai kiểu trên Android và iOS, không lỗi nào báo. Dùng `formatNumber`/`formatCurrency`/`formatFileSize` (`@/shared/utils/format/currency.utils`, `file-size.utils`) và `formatDate`/`formatDateTime`/`formatTime` (`date.utils`). Xem docs/rules/screen-layout.md, mục "Tiền".',
  },

  // ── 11. Mảng `style` trên `Animated.*` thiếu `cssInterop={false}` ───
  // `cssInterop(Animated.View, …)` (Skeleton, Reveal) đăng ký TOÀN CỤC: từ đó
  // MỌI `<Animated.View>` trong app đi qua NativeWind, kể cả thẻ không có
  // `className`. NativeWind gộp mảng `[style tĩnh, handle useAnimatedStyle]`
  // thành MỘT object; Reanimated thấy khoá `viewDescriptors` liền coi cả object
  // là handle và chỉ giữ phần hoạt ảnh — phần tĩnh (kích thước, vị trí,
  // `absoluteFill`, `flex`) rơi mất, không lỗi nào báo. Đã hỏng thật: thẻ ôn tập
  // co thành một đường ngang, dấu tích rơi khỏi vòng hoàn thành. Luật #5 không
  // thấy ca này vì thẻ KHÔNG có `className`.
  //
  // ✅ `cssInterop={false}`: NativeWind bỏ qua thẻ (xoá prop rồi dựng đúng
  //    component gốc), mảng `style` tới tay Reanimated nguyên vẹn.
  // ⚠️ Chỉ bắt mảng viết THẲNG trong `style={[…]}` (kể cả `cond ? […] : …` và
  // `cond && […]`). Mảng đi qua biến thì không đọc tĩnh được — người review bắt.
  // ⚠️ Viết bằng đường dẫn thuộc tính (`[value.expression.type=…]`), KHÔNG bằng
  // `:has(> JSXAttribute > JSXExpressionContainer > ArrayExpression)`: esquery 1.7
  // neo `>` đầu của `:has` vào tầng CUỐI của chuỗi ⇒ chuỗi nhiều tầng không bao
  // giờ khớp (đã thử: 0 kết quả trên cả repo, im lặng).
  {
    selector:
      "JSXOpeningElement[name.type='JSXMemberExpression'][name.object.name='Animated']:not(:has(> JSXAttribute[name.name='cssInterop'])):has(> JSXAttribute[name.name='style']:matches([value.expression.type='ArrayExpression'], [value.expression.type='ConditionalExpression']:matches([value.expression.consequent.type='ArrayExpression'], [value.expression.alternate.type='ArrayExpression']), [value.expression.type='LogicalExpression']:matches([value.expression.left.type='ArrayExpression'], [value.expression.right.type='ArrayExpression'])))",
    message:
      'Mảng `style` trên `Animated.*` thiếu `cssInterop={false}` ⇒ NativeWind (đã đăng ký `Animated.View` toàn cục) gộp mảng thành MỘT object, Reanimated thấy `viewDescriptors` chỉ giữ phần hoạt ảnh — phần tĩnh (kích thước/vị trí/`absoluteFill`/`flex`) rơi mất âm thầm. Thêm `cssInterop={false}` vào thẻ (và không đặt `className` lên nó). Xem docs/rules/styling-nativewind.md, mục "Cạm bẫy".',
  },
];

/**
 * Ba selector CHỈ áp cho mã nguồn (`src/`, `app/`), KHÔNG áp cho test (khối test ở cuối file chỉ nhận
 * `RESTRICTED_SYNTAX`). Chúng ràng cách MÀN HÌNH dùng `Screen`/danh sách/control, mà test của chính `Screen`
 * (`tests/ui/screen.test.tsx` đặt `<Text>` thẳng vào `footer`), của danh sách, của từng control
 * (`tests/ui/toggle.test.tsx`, `tests/ui/stepper.test.tsx`…) cố ý dựng chúng trần để kiểm hành vi.
 *
 * ── 8. Control có nhãn KHÔNG có nhãn ────────────────────────────────────────────
 * `<Toggle value onChange />` không `label`/`accessibilityLabel` ⇒ trình đọc màn hình xướng mỗi chữ "công tắc, bật":
 * người dùng khiếm thị không biết mình đang bật CÁI GÌ. Ô nhập chỉ có `placeholder` cũng vậy — placeholder biến mất
 * khi gõ và không phải nhãn (iOS đọc nó như GIÁ TRỊ của ô). Đã gặp thật: hai công tắc "Cài đặt nhóm" ở
 * `GroupInfo` tự dựng nhãn bằng một `<Text>` đứng cạnh (không nối với công tắc), và sáu ô nhập chỉ có placeholder
 * hoặc không có gì.
 *
 * Chỉ bám các control có prop `label`/`accessibilityLabel` (`Toggle`, `Checkbox`, `Radio`, `Stepper`, `Select`,
 * `DatePicker`, `Input`, `FormInput`, `FormSelect`). `:has(> …)` (con TRỰC TIẾP của thẻ mở) để một `label=` nằm sâu
 * trong prop khác (`trailing={<Button label="…" />}`) không bị tính nhầm là nhãn của control. Có `{...props}` thì
 * bỏ qua (không đọc tĩnh được nhãn nằm trong đó).
 */
/**
 * #10 — `<ActivityIndicator>` trần ngoài `src/shared/ui/**`. Vòng quay của React Native nhận màu THÔ (không nhận `className`): không
 * truyền `color` thì iOS vẽ xám cố định còn Android lấy màu nhấn của hệ điều hành — xanh đậm, gần như biến mất trên nền tối; và
 * nó không có nhãn trợ năng nên trình đọc màn hình im lặng. `LoadingMore` (`@/shared/ui/progress`) lo cả hai; tải LẦN ĐẦU là việc của
 * `Skeleton*`, vòng quay trong nút là `Button loading`. Khối riêng cho `src/shared/ui/**` (nơi `LoadingMore`/`Button` dựng nó) bỏ luật này.
 */
const ACTIVITY_INDICATOR_SYNTAX = [
  {
    selector: "JSXOpeningElement[name.name='ActivityIndicator']",
    message:
      '<ActivityIndicator> trần: màu THÔ theo hệ điều hành (biến mất trên nền tối) và KHÔNG có nhãn trợ năng. Tải thêm ở chân danh sách → <LoadingMore /> (@/shared/ui/progress); tải lần đầu → Skeleton*; trong nút → <Button loading>.',
  },
];

const SOURCE_ONLY_SYNTAX = [
  // ── 6. `<Screen footer>` là `<View>`/`<Button>` trần ────────────────
  // `Screen` KHÔNG đệm vùng an toàn cho khe `footer` (xem JSDoc của prop):
  // chính thanh đáy phải tự lo cả `bottom` lẫn `left`/`right`. Một `<View>`
  // hay `<Button>` trần đặt vào đó nằm ĐÈ lên vạch gạt ngang của iPhone /
  // thanh cử chỉ Android (hệ điều hành nuốt cú chạm vào nút), và xoay ngang
  // thì tai thỏ ăn mất một đầu nút. `tsc`/test/`check:*` đều xanh — chỉ lộ
  // trên máy có vạch gạt. `BottomActionBar` có sẵn đủ ba chiều vùng an toàn.
  //
  // Chỉ bắt được ca viết THẲNG trong `footer={…}` (kể cả `cond ? <View/> : …`
  // và `cond && <View/>`). Footer đi qua biến hay component riêng thì không
  // đọc tĩnh được — ca đó phải người review bắt, hoặc component đó tự bọc
  // `BottomActionBar` bên trong. `BottomSheet`/`Dialog` cũng có prop `footer`
  // nhưng tự đệm vùng an toàn nên KHÔNG bị chặn: selector chỉ bám `<Screen>`.
  {
    selector:
      "JSXOpeningElement[name.name='Screen'] > JSXAttribute[name.name='footer'] > JSXExpressionContainer > JSXElement[openingElement.name.name=/^(View|Button|LinkButton|Pressable|Text)$/], JSXOpeningElement[name.name='Screen'] > JSXAttribute[name.name='footer'] > JSXExpressionContainer > :matches(ConditionalExpression, LogicalExpression) > JSXElement[openingElement.name.name=/^(View|Button|LinkButton|Pressable|Text)$/]",
    message:
      '`<Screen footer>` chứa `<View>`/`<Button>` trần ⇒ nút đè lên vạch gạt ngang / thanh cử chỉ (Screen KHÔNG đệm vùng an toàn cho footer). Bọc trong `<BottomActionBar>` (`@/shared/ui/navigation`) — nó tự lo `insets.bottom/left/right`, lề 16 và trần bề rộng máy tính bảng. Xem docs/rules/ui-components.md §5.',
  },

  // ── 7. `onRefresh` trần trên FlatList/FlashList/SectionList ─────────
  // Danh sách có `onRefresh` mà không có `refreshControl` thì React Native tự dựng vòng quay MẶC ĐỊNH — màu xám của
  // iOS / xanh Material của Android, không đi qua token. Ở chế độ tối nó gần như biến mất (vòng xanh đậm trên nền
  // #070A0A). `Screen` đã chữa ca này bằng `useScreenRefreshControl`; danh sách tự cuộn (`scrollable={false}` + FlashList)
  // thì phải đi qua `useListRefreshControl` — cùng một nguồn màu. `tsc`/test không thấy: vòng quay vẫn hiện, chỉ sai màu.
  {
    selector:
      "JSXOpeningElement[name.name=/^(FlatList|FlashList|SectionList)$/] > JSXAttribute[name.name='onRefresh']",
    message:
      '`onRefresh` trần trên danh sách dựng vòng quay MẶC ĐỊNH không theo token (biến mất ở chế độ tối). Dùng `const refreshControl = useListRefreshControl({ onRefresh, refreshing })` (`@/shared/ui/screen`) rồi truyền `refreshControl={refreshControl}`. Xem docs/rules/styling-nativewind.md, mục "Khi prop KHÔNG nhận className".',
  },
  // ── 8. Control có nhãn KHÔNG có nhãn (chú thích đầy đủ ở khối JSDoc phía trên) ─────
  {
    selector:
      'JSXOpeningElement[name.name=/^(Toggle|Checkbox|Radio|Stepper|Select|DatePicker|Input|FormInput|FormSelect)$/]:not(:has(> JSXAttribute[name.name=/^(label|accessibilityLabel)$/])):not(:has(> JSXSpreadAttribute))',
    message:
      'Control thiếu nhãn ⇒ trình đọc màn hình chỉ xướng "công tắc/ô nhập" mà không nói là cái gì. Thêm `label="…"` (hiện ra) hoặc `accessibilityLabel="…"` (chỉ đọc lên, khi thiết kế không vẽ nhãn). `placeholder` KHÔNG phải nhãn. Xem docs/rules/ui-components.md §6.',
  },

  // ── 12. Vùng cuộn hiện VỆT CUỘN (thanh scroll) ──────────────────────
  // Quyết định sản phẩm (2026-10-01): app KHÔNG hiện thanh cuộn ở bất kỳ đâu. Mặc định của React Native là BẬT:
  // Android vẽ vệt dày, đục, nằm đè lên mép phải nội dung và lên dải gradient của `AppBar` — trông như lỗi vẽ hơn là
  // tín hiệu "còn nội dung" (cuộn là cử chỉ đã quen tay trên di động). Không có chỗ nào đặt mặc định TOÀN CỤC được:
  // `defaultProps` đã bị React 19 bỏ cho component hàm, còn vá `ScrollView` trong node_modules thì mỗi lần nâng RN là
  // mất. Nên MỖI vùng cuộn tự khai, và luật này là hàng rào để vùng cuộn mới không quên.
  //
  // ✅ Khai CẢ HAI, ghi THẲNG `={false}`: danh sách dọc vẫn có thể cuộn ngang (WebView, PDF, `horizontal={cond}`), và
  //    một luật "đủ cả hai" thì không ai phải nhớ ca nào cần cái nào. Biến/biểu thức (`={show}`) không đọc tĩnh được ⇒
  //    vẫn đỏ — thanh cuộn đã là quyết định chung, không phải tuỳ chọn của từng màn.
  // ✅ Bám tên thẻ của React Native/FlashList/keyboard-controller/WebView/PDF, kể cả `Animated.ScrollView` và biến
  //    `AnimatedFlatList` (`createAnimatedComponent`). Component bọc riêng (`InvertedVirtualList`, `EditorWebView`) tự
  //    khai bên trong — nơi dùng không phải lặp lại.
  // ⚠️ `{...props}` đứng SAU hai prop này thì nơi gọi vẫn bật lại được — luôn đặt chúng SAU spread.
  // ⚠️ Không tới được thanh cuộn của phần tử `overflow:auto` BÊN TRONG trang WebView — cái đó ẩn bằng CSS của trang.
  {
    selector: [
      "JSXOpeningElement[name.name=/^((Animated|Reanimated)?(ScrollView|FlatList|FlashList|SectionList|VirtualizedList)|KeyboardAwareScrollView|KeyboardAwareFlatList|KeyboardAwareSectionList|WebView|Pdf)$/]:not(:has(> JSXAttribute[name.name='showsVerticalScrollIndicator'][value.expression.value=false]))",
      "JSXOpeningElement[name.name=/^((Animated|Reanimated)?(ScrollView|FlatList|FlashList|SectionList|VirtualizedList)|KeyboardAwareScrollView|KeyboardAwareFlatList|KeyboardAwareSectionList|WebView|Pdf)$/]:not(:has(> JSXAttribute[name.name='showsHorizontalScrollIndicator'][value.expression.value=false]))",
      "JSXOpeningElement[name.type='JSXMemberExpression'][name.property.name=/^(ScrollView|FlatList|FlashList|SectionList|VirtualizedList)$/]:not(:has(> JSXAttribute[name.name='showsVerticalScrollIndicator'][value.expression.value=false]))",
      "JSXOpeningElement[name.type='JSXMemberExpression'][name.property.name=/^(ScrollView|FlatList|FlashList|SectionList|VirtualizedList)$/]:not(:has(> JSXAttribute[name.name='showsHorizontalScrollIndicator'][value.expression.value=false]))",
    ].join(', '),
    message:
      'Vùng cuộn đang hiện thanh cuộn (mặc định của React Native là BẬT). App KHÔNG hiện thanh cuộn ở đâu cả: thêm `showsHorizontalScrollIndicator={false}` VÀ `showsVerticalScrollIndicator={false}` — ghi thẳng `={false}`, đặt SAU `{...props}` nếu có. Xem docs/rules/mobile-ux.md, mục "Thanh cuộn".',
  },
];

module.exports = defineConfig([
  globalIgnores([
    'node_modules/**',
    'android/**',
    'ios/**',
    '.expo/**',
    '.typecheck/**',
    'dist/**',
    'coverage/**',
    'expo-env.d.ts',
    // File sinh tự động — sửa ở đây là vô nghĩa, lần sinh sau ghi đè.
    '**/*.generated.js',
    '**/*.generated.ts',
  ]),

  js.configs.recommended,
  ...expoFlat,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    plugins: { perfectionist },
    settings: {
      /**
       * Không có mục này thì `eslint-plugin-import` chỉ biết phân giải theo kiểu
       * Node — mọi import `@/…` thành "unresolved", và `import/no-cycle` bên dưới
       * lặng lẽ không kiểm được đường nào đi qua alias, tức là gần như KHÔNG kiểm
       * gì cả trong dự án này.
       */
      'import/resolver': {
        typescript: { project: './tsconfig.json' },
      },
    },
    rules: {
      /**
       * Import vòng làm module khởi tạo nửa chừng: một bên nhìn thấy `undefined`
       * thay vì hàm/hằng nó cần. Trên RN lỗi hiện ra ở tận runtime dưới dạng
       * "undefined is not a function", ở một file KHÔNG liên quan tới chỗ sai.
       *
       * `maxDepth: Infinity` để bắt cả vòng dài qua nhiều barrel — kiểu vòng
       * hay gặp nhất khi mỗi thư mục có một `index.ts`.
       *
       * (Base web dùng `madge` cho việc này. Ở đây gộp vào ESLint vì madge@8
       * chưa chạy được với TypeScript 6 — bớt một devDependency và lỗi hiện ngay
       * trong editor thay vì đợi tới lúc chạy script.)
       */
      'import/no-cycle': ['error', { maxDepth: Infinity, ignoreExternal: true }],

      /**
       * ⛔ TẮT có chủ đích, KHÔNG phải vì lười.
       *
       * Rule này cảnh báo khi đọc thuộc tính của một default import trùng tên
       * với một named export — `axios.create` là ví dụ chính xác. Nhưng với
       * axios thì `axios.create`/`axios.isAxiosError` LÀ cách dùng chính thức
       * và có trong tài liệu; đây là cảnh báo sai hoàn toàn. Để bật thì mọi thực
       * thể axios đều đỏ, và người ta sẽ quen mắt bỏ qua cảnh báo — mất luôn giá
       * trị của những cảnh báo thật.
       */
      'import/no-named-as-default-member': 'off',

      /** Khớp với `verbatimModuleSyntax` trong tsconfig. */
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      /** Dependency của hook là ERROR, không phải warn — thiếu deps là bug dữ liệu cũ. */
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',

      // Sắp xếp prop JSX a → z (tự sửa khi save).
      // `key`/`ref` luôn đứng đầu, handler `onXxx` dồn xuống cuối.
      'perfectionist/sort-jsx-props': [
        'warn',
        {
          type: 'alphabetical',
          order: 'asc',
          ignoreCase: true,
          groups: ['top', 'unknown', 'callback'],
          customGroups: [
            { groupName: 'top', elementNamePattern: '^(key|ref)$' },
            { groupName: 'callback', elementNamePattern: '^on[A-Z]' },
          ],
        },
      ],
    },
  },

  {
    files: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
    rules: {
      /**
       * ⛔ Global CHỈ CÓ Ở NODE — không tồn tại lúc chạy trên máy thật.
       *
       * `tsconfig.json` nạp `@types/node` cho toàn dự án (test và script cần),
       * mà TypeScript không phân vùng kiểu theo thư mục được. Nên nếu ai viết
       * `Buffer.from(...)` trong một màn hình thì `tsc` VẪN XANH, và app chỉ nổ
       * khi người dùng mở đúng màn hình đó — `ReferenceError: Buffer is not
       * defined`, trên máy thật, sau khi đã phát hành.
       *
       * Hàng rào đặt ở đây vì ESLint phân vùng theo thư mục được: `tests/`,
       * `scripts/` và `app.config.ts` KHÔNG bị rule này áp.
       *
       * `process` KHÔNG nằm trong danh sách: `process.env.EXPO_PUBLIC_*` là cách
       * đọc biến môi trường chính thức của Expo (Metro thay chuỗi lúc build) và
       * được dùng thật ở `src/core/config/env.config.ts`.
       */
      'no-restricted-globals': [
        'error',
        {
          name: 'Buffer',
          message:
            'Buffer chỉ có ở Node, KHÔNG có trên React Native. Cần xử lý base64 thì dùng @/shared/utils/jwt.utils, hoặc gói expo-crypto / js-base64.',
        },
        {
          name: '__dirname',
          message: '__dirname chỉ có ở Node. Đường dẫn tệp trên máy dùng expo-file-system.',
        },
        {
          name: '__filename',
          message: '__filename chỉ có ở Node.',
        },
        {
          name: 'global',
          message: 'Dùng globalThis thay cho global — global là biến riêng của Node.',
        },
        {
          name: 'setImmediate',
          message:
            'setImmediate không có trên Hermes. Dùng setTimeout(fn, 0), hoặc queueMicrotask khi cần chạy trước lượt vẽ kế.',
        },
      ],

      'no-restricted-syntax': [
        'error',
        ...RESTRICTED_SYNTAX,
        ...SOURCE_ONLY_SYNTAX,
        ...ACTIVITY_INDICATOR_SYNTAX,
      ],

      /**
       * ⛔ Không `console.*` trong mã app (p0-12, SHL-08) — dùng `logger` của `@/shared/utils/logger`.
       * `console` rải khắp nơi thì không có chỗ nào để tắt log ồn ở bản phát hành, đẩy dấu vết vào
       * Sentry hay soát rò rỉ token. Ngoại lệ: chính `logger.ts` (khối ngay dưới) và test/script
       * (các khối sau, vì test hay `jest.spyOn(console, …)` để giữ log sạch).
       */
      'no-console': 'error',
    },
  },

  {
    // `logger` LÀ chỗ duy nhất được chạm `console` — mọi nơi khác đi qua nó.
    files: ['src/shared/utils/logger.ts'],
    rules: { 'no-console': 'off' },
  },

  {
    // Bộ component chung DỰNG `<ActivityIndicator>` (LoadingMore, Button loading…) — luật #10 không áp ở đây.
    files: ['src/shared/ui/**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': ['error', ...RESTRICTED_SYNTAX, ...SOURCE_ONLY_SYNTAX] },
  },

  {
    /**
     * Script và file config chạy bằng Node (không phải runtime React Native),
     * nên cần globals của Node — thiếu thì `__dirname`, `process`, `require`
     * đều bị báo `no-undef`.
     */
    // `plugins/**/*.js` (p2-02): Expo config plugin — Expo tự nạp bằng `require()` của Node (chạy lúc `expo prebuild`,
    // không phải runtime React Native), viết ESM ở đây là plugin không nạp được.
    files: ['scripts/**/*.{js,mjs}', 'shims/**/*.js', 'plugins/**/*.js', '*.config.{js,ts}', 'jest.setup.js'],
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-restricted-syntax': 'off',
    },
  },

  {
    /**
     * File test + file dựng môi trường test được phép dùng globals của Jest.
     * `jest.setup.js` phải có mặt ở đây: nó chạy TRONG Jest nên `jest.mock()`
     * là hợp lệ, nhưng nó không khớp mẫu `*.test.*` nào.
     */
    files: ['tests/**/*.{ts,tsx}', '**/*.test.{ts,tsx}', 'jest.setup.js'],
    languageOptions: { globals: { ...globals.jest, ...globals.node } },
    // Rule có tuỳ chọn (không chỉ mức độ) thì khối sau THAY khối trước chứ không gộp: liệt kê lại các selector chung,
    // bỏ `SOURCE_ONLY_SYNTAX` — test của `Screen`/danh sách/control được dựng chúng trần.
    rules: { 'no-restricted-syntax': ['error', ...RESTRICTED_SYNTAX] },
  },
]);
