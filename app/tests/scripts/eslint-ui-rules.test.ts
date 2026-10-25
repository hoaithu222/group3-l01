import { spawnSync } from 'node:child_process';
import path from 'node:path';

/**
 * Ba luật ESLint `no-restricted-syntax` về UI mà `tsc`, test và mọi script `check:*` đều không thấy:
 *
 *  · #6 — `<Screen footer={<View|Button …/>}>`: `Screen` KHÔNG đệm vùng an toàn cho khe `footer`, nên nút/khối trần đặt ở
 *    đó đè lên vạch gạt ngang của iPhone (hệ điều hành nuốt cú chạm);
 *  · #7 — `onRefresh` trần trên `FlatList`/`FlashList`/`SectionList`: React Native dựng vòng quay MẶC ĐỊNH không theo token,
 *    ở chế độ tối gần như biến mất;
 *  · #8 — `Toggle`/`Checkbox`/`Radio`/`Stepper`/`Select`/`DatePicker`/`Input`/`FormInput`/`FormSelect` không có `label` lẫn
 *    `accessibilityLabel`: trình đọc màn hình chỉ xướng "công tắc, bật" mà không nói bật CÁI GÌ.
 *  · #12 — vùng cuộn thiếu `showsHorizontalScrollIndicator={false}` / `showsVerticalScrollIndicator={false}`: app không hiện
 *    thanh cuộn ở đâu cả, mà mặc định của React Native là BẬT (xem `docs/rules/mobile-ux.md`, mục "Thanh cuộn").
 *
 * ── Vì sao có test cho một luật lint ─────────────────────────────────────────
 * Hàng rào DUY NHẤT của các lỗi trên là selector `esquery`, và selector là loại mã hỏng ÂM THẦM y như cái nó canh: sửa
 * một dấu `>` là nó ngừng bắt được gì mà vẫn im lặng. Nên cho nó chạy lên mẫu có lỗi cố ý và đòi nó đỏ.
 *
 * ── Ba luật này CHỈ áp cho mã nguồn, không áp cho test ───────────────────────
 * Test của chính `Screen` đặt `<Text>` thẳng vào `footer`, test của `Toggle`/`Stepper` dựng control trần để kiểm hành vi.
 * Khối cấu hình dành cho test chỉ nhận các selector chung — nhóm `test` bên dưới khoá điều đó lại, không thì luật mới
 * làm đỏ `npm run lint` ở đúng những test hợp lệ.
 *
 * ── Vì sao chạy ESLint ở TIẾN TRÌNH CON ──────────────────────────────────────
 * ESLint nạp `eslint.config.js` bằng `import()` động, mà Jest không cho `import()` nếu thiếu `--experimental-vm-modules`
 * (lỗi "A dynamic import callback was invoked without --experimental-vm-modules"). Cùng lối với `check-gates.test.ts`:
 * cho tiến trình Node thật chạy. Và dùng ESLint THẬT với cấu hình của repo, không chép selector vào test, để test và cấu
 * hình không thể lệch nhau.
 */
const ROOT = path.join(__dirname, '..', '..');
const SOURCE_PATH = path.join(ROOT, 'src', 'features', 'sample', 'Sample.tsx');
const TEST_PATH = path.join(ROOT, 'tests', 'ui', 'sample.test.tsx');
const SHARED_UI_PATH = path.join(ROOT, 'src', 'shared', 'ui', 'sample', 'Sample.tsx');

/** Chạy trong tiến trình con: đọc `{nhóm: {tên: mã}}` từ stdin, in `{nhóm: {tên: [thông điệp no-restricted-syntax]}}`. */
const RUNNER = `
const { ESLint } = require('eslint');
let raw = '';
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', async () => {
  const groups = JSON.parse(raw);
  const paths = { source: process.env.SOURCE_PATH, sharedUi: process.env.SHARED_UI_PATH, test: process.env.TEST_PATH };
  const eslint = new ESLint({ cwd: process.env.ROOT, overrideConfigFile: process.env.ROOT + '/eslint.config.js' });
  const out = {};
  for (const [group, cases] of Object.entries(groups)) {
    out[group] = {};
    for (const [name, code] of Object.entries(cases)) {
      const [result] = await eslint.lintText(code, { filePath: paths[group] });
      out[group][name] = result.messages.filter((m) => m.ruleId === 'no-restricted-syntax').map((m) => m.message);
    }
  }
  process.stdout.write(JSON.stringify(out));
});
`;

const SOURCE_CASES = {
  // ── #6 Screen footer ───────────────────────────────────────────────────────
  bareButton: 'export const A = () => <Screen footer={<Button label="Lưu" />}>x</Screen>;',
  bareView:
    'export const A = () => <Screen footer={<View><Button label="Lưu" /></View>}>x</Screen>;',
  condView:
    'export const A = ({ ok }: { ok: boolean }) => <Screen footer={ok ? <View /> : undefined}>x</Screen>;',
  andView:
    'export const A = ({ ok }: { ok: boolean }) => <Screen footer={ok && <View />}>x</Screen>;',
  bar: 'export const A = () => <Screen footer={<BottomActionBar><View><Button label="Lưu" /></View></BottomActionBar>}>x</Screen>;',
  condBar:
    'export const A = ({ ok }: { ok: boolean }) => <Screen footer={ok ? <BottomActionBar><Button label="Lưu" /></BottomActionBar> : undefined}>x</Screen>;',
  sheet: 'export const A = () => <BottomSheet footer={<Button label="Lưu" />}>x</BottomSheet>;',
  dialog: 'export const A = () => <Dialog footer={<View><Button label="Lưu" /></View>}>x</Dialog>;',
  // ── #7 onRefresh trần trên danh sách ───────────────────────────────────────
  flashRefresh:
    'export const A = () => <FlashList data={[]} refreshing={false} renderItem={f} onRefresh={g} />;',
  flatRefresh:
    'export const A = () => <FlatList data={[]} refreshing={false} renderItem={f} onRefresh={g} />;',
  sectionRefresh:
    'export const A = () => <SectionList sections={[]} refreshing={false} renderItem={f} onRefresh={g} />;',
  listControl: 'export const A = () => <FlashList data={[]} refreshControl={c} renderItem={f} />;',
  screenRefresh: 'export const A = () => <Screen refreshing={false} onRefresh={g}>x</Screen>;',
  // ── #8 control thiếu nhãn ──────────────────────────────────────────────────
  toggleBare: 'export const A = () => <Toggle value={v} onChange={f} />;',
  toggleLabel: 'export const A = () => <Toggle label="Ghim kênh" value={v} onChange={f} />;',
  toggleA11y: 'export const A = () => <Toggle accessibilityLabel="Ghim kênh" value={v} />;',
  checkboxBare: 'export const A = () => <Checkbox checked={c} onChange={f} />;',
  radioBare: 'export const A = () => <Radio value="a" />;',
  inputPlaceholderOnly:
    'export const A = () => <Input placeholder="Nhắn tin…" value={v} onChangeText={f} />;',
  inputLabel: 'export const A = () => <Input label="Tên nhóm" value={v} onChangeText={f} />;',
  inputA11y:
    'export const A = () => <Input accessibilityLabel="Lý do xoá" placeholder="Lý do xoá" value={v} />;',
  formInputBare: 'export const A = () => <FormInput control={c} name="email" />;',
  selectBare: 'export const A = () => <Select options={o} value={v} />;',
  // Có `{...props}` thì không đọc tĩnh được nhãn nằm trong đó ⇒ không báo (tránh báo nhầm).
  inputSpread: 'export const A = (p: P) => <Input {...p} />;',
  // `label=` nằm SÂU trong prop khác không phải nhãn của control.
  nestedLabelOnly:
    'export const A = () => <Select options={o} trailing={<Button label="Xoá" />} value={v} />;',
  // Control không có nhãn tích hợp — không thuộc luật này.
  buttonNoLabel: 'export const A = () => <Button iconOnly iconLeft="cancel" onPress={f} />;',
  // ── #9 định dạng theo ICU của máy ──────────────────────────────────────────
  toLocaleString: 'export const A = (n: number) => n.toLocaleString("vi-VN");',
  toLocaleDateString: 'export const A = (d: Date) => d.toLocaleDateString("vi-VN");',
  toLocaleTimeString: 'export const A = (d: Date) => d.toLocaleTimeString();',
  newNumberFormat: 'export const A = (n: number) => new Intl.NumberFormat("vi-VN").format(n);',
  callNumberFormat: 'export const A = (n: number) => Intl.NumberFormat("vi-VN").format(n);',
  // Đọc MÚI GIỜ của máy (không định dạng ra màn hình) là ca hợp lệ ⇒ không chặn `Intl.DateTimeFormat`.
  timeZoneRead: 'export const A = () => Intl.DateTimeFormat().resolvedOptions().timeZone;',
  formatNumberOk: 'export const A = (n: number) => formatNumber(n, { unit: "XP" });',
  // ── #10 <ActivityIndicator> trần ───────────────────────────────────────────
  activityBare: 'export const A = () => <ActivityIndicator />;',
  activityColored: 'export const A = () => <ActivityIndicator color="red" size="small" />;',
  loadingMoreOk: 'export const A = () => <LoadingMore />;',
  // ── #12 vùng cuộn hiện thanh cuộn ──────────────────────────────────────────
  scrollBare: 'export const A = () => <ScrollView>x</ScrollView>;',
  scrollOnlyVertical:
    'export const A = () => <ScrollView showsVerticalScrollIndicator={false}>x</ScrollView>;',
  scrollBoth:
    'export const A = () => <ScrollView showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>x</ScrollView>;',
  listTrueAndBare:
    'export const A = () => <FlatList data={[]} renderItem={f} showsHorizontalScrollIndicator showsVerticalScrollIndicator={true} />;',
  listVariable:
    'export const A = () => <FlashList data={[]} renderItem={f} showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={show} />;',
  flashGeneric: 'export const A = () => <FlashList<number> data={[]} renderItem={f} />;',
  keyboardAware: 'export const A = () => <KeyboardAwareScrollView>x</KeyboardAwareScrollView>;',
  animatedMember: 'export const A = () => <Animated.ScrollView>x</Animated.ScrollView>;',
  animatedAlias: 'export const A = () => <AnimatedFlatList data={[]} renderItem={f} />;',
  webView: 'export const A = () => <WebView source={s} />;',
  pdf: 'export const A = () => <Pdf source={s} />;',
  // Prop nằm SÂU trong prop khác (ScrollView của `ListHeaderComponent`) không tính cho danh sách ngoài.
  nestedOnly:
    'export const A = () => <FlatList data={[]} ListHeaderComponent={<ScrollView showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false} />} renderItem={f} />;',
  spreadThenBoth:
    'export const A = (p: P) => <ScrollView {...p} showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false} />;',
  // Component bọc riêng tự tắt bên trong — nơi dùng không phải khai.
  wrapperOk: 'export const A = () => <InvertedVirtualList data={[]} renderItem={f} />;',
} as const;

const SHARED_UI_CASES = {
  // Bộ component chung được dựng vòng quay (LoadingMore, Button loading…).
  activityBare: 'export const A = () => <ActivityIndicator />;',
  // …nhưng luật thanh cuộn VẪN áp: chính `Screen`/`BottomSheet` là nơi đặt mặc định cho cả app.
  scrollBare: 'export const A = () => <ScrollView>x</ScrollView>;',
} as const;

const TEST_CASES = {
  // Cùng mã lỗi cố ý, nhưng đặt trong file test ⇒ KHÔNG được báo.
  footerText: 'export const A = () => <Screen footer={<Text>Tiếp tục</Text>}>x</Screen>;',
  toggleBare: 'export const A = () => <Toggle value={v} onChange={f} />;',
  inputBare: 'export const A = () => <Input value={v} onChangeText={f} />;',
  flashRefresh:
    'export const A = () => <FlashList data={[]} refreshing={false} renderItem={f} onRefresh={g} />;',
  // Luật CHUNG vẫn áp cho test: `<Modal>` thiếu `supportedOrientations`, và `toLocaleString` (#9).
  modalNoOrientation: 'export const A = () => <Modal visible>x</Modal>;',
  toLocaleString: 'export const A = (n: number) => n.toLocaleString("vi-VN");',
  // Test dựng danh sách/ScrollView trần để kiểm hành vi ⇒ luật thanh cuộn (#12) KHÔNG áp.
  scrollBare: 'export const A = () => <ScrollView>x</ScrollView>;',
} as const;

type SourceName = keyof typeof SOURCE_CASES;
type SharedUiName = keyof typeof SHARED_UI_CASES;
type TestName = keyof typeof TEST_CASES;

interface Results {
  sharedUi: Record<SharedUiName, string[]>;
  source: Record<SourceName, string[]>;
  test: Record<TestName, string[]>;
}

function lintAll(): Results {
  const run = spawnSync(process.execPath, ['-e', RUNNER], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ROOT, SHARED_UI_PATH, SOURCE_PATH, TEST_PATH },
    input: JSON.stringify({ sharedUi: SHARED_UI_CASES, source: SOURCE_CASES, test: TEST_CASES }),
  });
  if (run.status !== 0) throw new Error(`ESLint tiến trình con lỗi:\n${run.stderr}${run.stdout}`);
  return JSON.parse(run.stdout) as Results;
}

const results = lintAll();
const hits = (group: 'sharedUi' | 'source' | 'test', name: string, marker: string): number =>
  ((results[group] as Record<string, string[]>)[name] ?? []).filter((m) => m.includes(marker))
    .length;

const footerHits = (name: SourceName) => hits('source', name, '<Screen footer>');
const refreshHits = (name: SourceName) => hits('source', name, '`onRefresh` trần');
const labelHits = (name: SourceName) => hits('source', name, 'Control thiếu nhãn');
const localeHits = (name: SourceName) => hits('source', name, 'phụ thuộc ICU của Hermes');
const spinnerHits = (group: 'sharedUi' | 'source', name: string) =>
  hits(group, name, '<ActivityIndicator> trần');
const scrollbarHits = (group: 'sharedUi' | 'source' | 'test', name: string) =>
  hits(group, name, 'đang hiện thanh cuộn');

describe('ESLint — <Screen footer> không được là <View>/<Button> trần', () => {
  it('đỏ khi footer là <Button> trần', () => {
    expect(footerHits('bareButton')).toBe(1);
  });

  it('đỏ khi footer là <View> trần (dù bên trong có nút)', () => {
    expect(footerHits('bareView')).toBe(1);
  });

  it('đỏ khi <View> trần nằm trong nhánh điều kiện — `cond ? <View/> : …` và `cond && <View/>`', () => {
    expect(footerHits('condView')).toBe(1);
    expect(footerHits('andView')).toBe(1);
  });

  it('xanh khi footer là <BottomActionBar> — kể cả có <View>/<Button> bên trong, kể cả trong nhánh điều kiện', () => {
    expect(footerHits('bar')).toBe(0);
    expect(footerHits('condBar')).toBe(0);
  });

  it('⛔ KHÔNG chặn `footer` của BottomSheet/Dialog — chúng tự đệm vùng an toàn', () => {
    expect(footerHits('sheet')).toBe(0);
    expect(footerHits('dialog')).toBe(0);
  });
});

describe('ESLint — danh sách không được `onRefresh` trần (dùng useListRefreshControl)', () => {
  it('đỏ với FlashList, FlatList và SectionList', () => {
    expect(refreshHits('flashRefresh')).toBe(1);
    expect(refreshHits('flatRefresh')).toBe(1);
    expect(refreshHits('sectionRefresh')).toBe(1);
  });

  it('xanh khi danh sách nhận `refreshControl` từ hook', () => {
    expect(refreshHits('listControl')).toBe(0);
  });

  it('⛔ KHÔNG chặn `onRefresh` của <Screen> — Screen tự dựng vòng quay theo token (useScreenRefreshControl)', () => {
    expect(refreshHits('screenRefresh')).toBe(0);
  });
});

describe('ESLint — control có nhãn tích hợp phải có nhãn (label hoặc accessibilityLabel)', () => {
  it('đỏ với công tắc, ô chọn, ô nhập và ô chọn danh sách KHÔNG có nhãn', () => {
    expect(labelHits('toggleBare')).toBe(1);
    expect(labelHits('checkboxBare')).toBe(1);
    expect(labelHits('radioBare')).toBe(1);
    expect(labelHits('formInputBare')).toBe(1);
    expect(labelHits('selectBare')).toBe(1);
  });

  it('đỏ khi ô nhập chỉ có `placeholder` — placeholder biến mất khi gõ và KHÔNG phải nhãn', () => {
    expect(labelHits('inputPlaceholderOnly')).toBe(1);
  });

  it('xanh khi có `label` hoặc `accessibilityLabel`', () => {
    expect(labelHits('toggleLabel')).toBe(0);
    expect(labelHits('toggleA11y')).toBe(0);
    expect(labelHits('inputLabel')).toBe(0);
    expect(labelHits('inputA11y')).toBe(0);
  });

  it('xanh khi có `{...props}` — không đọc tĩnh được nhãn nằm trong đó, thà bỏ sót còn hơn báo nhầm', () => {
    expect(labelHits('inputSpread')).toBe(0);
  });

  it('một `label=` nằm SÂU trong prop khác (trailing={<Button label/>}) không được tính là nhãn của control', () => {
    expect(labelHits('nestedLabelOnly')).toBe(1);
  });

  it('⛔ KHÔNG bám control không có nhãn tích hợp (Button iconOnly do `tsc` ép nhãn, không phải luật này)', () => {
    expect(labelHits('buttonNoLabel')).toBe(0);
  });
});

describe('ESLint — không định dạng số/ngày bằng ICU của máy (toLocale*String, Intl.NumberFormat)', () => {
  it('đỏ với toLocaleString, toLocaleDateString, toLocaleTimeString', () => {
    expect(localeHits('toLocaleString')).toBe(1);
    expect(localeHits('toLocaleDateString')).toBe(1);
    expect(localeHits('toLocaleTimeString')).toBe(1);
  });

  it('đỏ với Intl.NumberFormat — cả `new Intl.NumberFormat()` lẫn gọi không `new`', () => {
    expect(localeHits('newNumberFormat')).toBe(1);
    expect(localeHits('callNumberFormat')).toBe(1);
  });

  it('⛔ KHÔNG chặn Intl.DateTimeFormat (đọc MÚI GIỜ của máy) và không chặn hàm định dạng của repo', () => {
    expect(localeHits('timeZoneRead')).toBe(0);
    expect(localeHits('formatNumberOk')).toBe(0);
  });
});

describe('ESLint — ba luật #6–#8 CHỈ áp cho mã nguồn, không áp cho file test', () => {
  it('test của Screen đặt <Text> vào footer, test của control dựng nó trần, test danh sách có onRefresh ⇒ không đỏ', () => {
    expect(hits('test', 'footerText', '<Screen footer>')).toBe(0);
    expect(hits('test', 'toggleBare', 'Control thiếu nhãn')).toBe(0);
    expect(hits('test', 'inputBare', 'Control thiếu nhãn')).toBe(0);
    expect(hits('test', 'flashRefresh', '`onRefresh` trần')).toBe(0);
  });

  it('nhưng luật CHUNG vẫn áp cho test: <Modal> thiếu supportedOrientations và toLocaleString vẫn đỏ', () => {
    expect(hits('test', 'modalNoOrientation', 'supportedOrientations')).toBe(1);
    expect(hits('test', 'toLocaleString', 'phụ thuộc ICU của Hermes')).toBe(1);
  });
});

describe('ESLint — <ActivityIndicator> trần chỉ được nằm trong src/shared/ui (dùng LoadingMore)', () => {
  it('đỏ ở mã nguồn feature/shell — kể cả khi đã truyền màu (vẫn không có nhãn trợ năng)', () => {
    expect(spinnerHits('source', 'activityBare')).toBe(1);
    expect(spinnerHits('source', 'activityColored')).toBe(1);
  });

  it('xanh khi dùng <LoadingMore />', () => {
    expect(spinnerHits('source', 'loadingMoreOk')).toBe(0);
  });

  it('⛔ KHÔNG chặn trong src/shared/ui — đó là nơi LoadingMore/Button dựng vòng quay', () => {
    expect(spinnerHits('sharedUi', 'activityBare')).toBe(0);
  });
});

describe('ESLint — vùng cuộn phải tắt CẢ HAI thanh cuộn (#12)', () => {
  it('đỏ khi thiếu cả hai, hoặc chỉ tắt một chiều', () => {
    expect(scrollbarHits('source', 'scrollBare')).toBe(1);
    expect(scrollbarHits('source', 'scrollOnlyVertical')).toBe(1);
  });

  it('đỏ khi prop là `true`, viết trần, hay là biến — phải ghi thẳng `={false}`', () => {
    expect(scrollbarHits('source', 'listTrueAndBare')).toBe(1);
    expect(scrollbarHits('source', 'listVariable')).toBe(1);
  });

  it('bắt FlashList có tham số kiểu, KeyboardAwareScrollView, Animated.*, biến Animated…, WebView, Pdf', () => {
    expect(scrollbarHits('source', 'flashGeneric')).toBe(1);
    expect(scrollbarHits('source', 'keyboardAware')).toBe(1);
    expect(scrollbarHits('source', 'animatedMember')).toBe(1);
    expect(scrollbarHits('source', 'animatedAlias')).toBe(1);
    expect(scrollbarHits('source', 'webView')).toBe(1);
    expect(scrollbarHits('source', 'pdf')).toBe(1);
  });

  it('xanh khi đủ cả hai `={false}` — kể cả đặt sau `{...props}`', () => {
    expect(scrollbarHits('source', 'scrollBoth')).toBe(0);
    expect(scrollbarHits('source', 'spreadThenBoth')).toBe(0);
  });

  it('prop của ScrollView lồng trong `ListHeaderComponent` không được tính cho danh sách ngoài', () => {
    expect(scrollbarHits('source', 'nestedOnly')).toBe(1);
  });

  it('⛔ KHÔNG bám component bọc riêng (InvertedVirtualList…) — chúng tự tắt bên trong', () => {
    expect(scrollbarHits('source', 'wrapperOk')).toBe(0);
  });

  it('áp cả trong src/shared/ui (nơi đặt mặc định cho cả app), không áp cho file test', () => {
    expect(scrollbarHits('sharedUi', 'scrollBare')).toBe(1);
    expect(scrollbarHits('test', 'scrollBare')).toBe(0);
  });
});
