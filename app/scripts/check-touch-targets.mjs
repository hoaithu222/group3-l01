/**
 * Soát vùng chạm: mọi thẻ bấm được phải cao ≥ 44dp, hoặc phải có `hitSlop` bù
 * cho đủ.
 *
 * ── Vì sao phải là script TĨNH, không phải test ──────────────────────────────
 * NativeWind KHÔNG biên dịch class trong Jest: `expect(el).toHaveStyle(...)`
 * luôn thấy `style` rỗng, nên không test runtime nào đọc được chiều cao mà
 * `h-10` sinh ra (README và `docs/rules/testing.md` ghi rõ điều này). Repo có
 * ba test kiểm `hitSlop` — nhưng chúng chỉ khoá ba component ĐÃ ĐÚNG SẴN, và
 * không chặn được component thứ hai mươi lăm ship với ô chạm 32dp.
 *
 * Chiều cao lại nằm trong CHUỖI class, tức là đọc tĩnh được. Nên chỗ đúng để
 * đặt hàng rào là ở đây.
 *
 * ── Hai ca được soát ─────────────────────────────────────────────────────────
 *  1. Thẻ bấm được CÓ class chiều cao (`h-10`, `min-h-[44px]`, slot `tv()`).
 *  2. Nút CHỈ-ICON (Pressable có đúng một con là `<Icon>`) — không có class chiều
 *     cao nào để đọc, nên ca 1 không thấy. Vùng chạm ước = cỡ icon + 2 × đệm
 *     + `hitSlop`. Đây là ca người ta viết `hitSlop={8}` theo phản xạ: icon 18 +
 *     16 = 34dp, thiếu 10 (đã có 3 chỗ như vậy trong repo).
 *
 * ── Vì sao 44dp ──────────────────────────────────────────────────────────────
 * `docs/rules/mobile-ux.md`. Lỗi này đã gặp nhiều lần trong repo: tab 40dp,
 * chip, nút chỉ có icon 32/40dp, ô chạm stepper 26×24. Nó không bao giờ đỏ ở
 * đâu — chỉ là người dùng bấm trượt, rồi kết luận app giật.
 *
 * ── Ranh giới: cái này KHÔNG làm gì ──────────────────────────────────────────
 *  · Chiều cao lấy từ `className` viết thẳng trên thẻ, CỘNG với slot `tv()` gọi
 *    ngay tại đó (`className={styles.navButton()}`) — slot được tra trong chính
 *    file đó và trong các file nó nhập theo đường dẫn tương đối (`./x.styles`).
 *    Đi xa hơn thế thì không suy được: chấp nhận BỎ SÓT.
 *  · Không suy chiều cao từ `py-*` + cỡ chữ: đoán nội dung cao bao nhiêu là mở
 *    đường cho báo nhầm, mà một trình soát ồn ào thì không ai chạy.
 *  · ⛔ KHÔNG kiểm được `hitSlop` của hai control cạnh nhau có CHỒNG lên nhau
 *    không — đó là quan hệ bố cục lúc chạy. Vẫn phải người xem.
 *
 * Chạy: node check-touch-targets.mjs [thư-mục...]
 */
import path from 'node:path';
import fs from 'node:fs';

import { ROOT, listSourceFiles, parseSource, ts } from './lib/source-files.mjs';

const SCAN_DIRS = process.argv.slice(2).length ? process.argv.slice(2) : ['src', 'app'];

/** Ngưỡng của `docs/rules/mobile-ux.md` — cũng là ngưỡng của cả iOS lẫn Android. */
const MIN_TOUCH_DP = 44;

const layout = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'src/styles/layout/layout.json'), 'utf8'),
);

/**
 * Thẻ mà chỉ cần NHÌN TÊN đã biết là bấm được.
 *
 * Ngoài danh sách này, bất cứ thẻ nào có `onPress` cũng được tính — nhờ vậy
 * component tự viết (`<Tab>`, `<Chip>`) không lọt lưới.
 */
const PRESSABLE_TAGS = new Set([
  'Pressable',
  'TouchableHighlight',
  'TouchableNativeFeedback',
  'TouchableOpacity',
  'TouchableWithoutFeedback',
]);

/**
 * Tên bậc → số dp.
 *
 * Ba nguồn, đúng thứ tự `tailwind.config.js` dựng ra:
 *  · thang SỐ mặc định của Tailwind (`h-11` = 44) — config `extend` nên nó còn;
 *  · tên bậc giãn cách của thiết kế (`h-xl` = 24) — thêm vào `theme.spacing`;
 *  · chiều cao control (`h-control-md` = 48) — thêm vào `theme.height`.
 */
function scaleToDp(name) {
  if (/^\d+(\.\d+)?$/.test(name)) return Number(name) * 4;
  if (name === 'px') return 1;
  // Giá trị tuỳ ý — `min-h-[44px]` của `ListItem` là ca có thật trong repo.
  const arbitrary = /^\[(\d+(?:\.\d+)?)(?:px)?\]$/.exec(name);
  if (arbitrary) return Number(arbitrary[1]);
  const control = /^control-(.+)$/.exec(name);
  if (control) return layout.control[control[1]] ?? null;
  return layout.spacing[name] ?? null;
}

/**
 * Chiều cao suy được từ một danh sách class, hoặc `null`.
 *
 * `min-h-*` được tính NGANG với `h-*`: nó là sàn, và sàn dưới 44 thì ô chạm có
 * thể dừng đúng ở sàn. `size-*` đặt cả hai chiều nên cũng là chiều cao.
 *
 * ⛔ Bỏ qua bậc theo bề rộng màn (`tablet:h-12`): nó chỉ áp trên máy tính bảng,
 * lấy nó làm chiều cao chung là kết luận sai cho điện thoại.
 */
function heightOf(classes) {
  let smallest = null;
  for (const cls of classes) {
    if (cls.includes(':')) continue;
    const match = /^(?:h|min-h|size)-(.+)$/.exec(cls);
    if (!match) continue;
    const dp = scaleToDp(match[1]);
    if (dp === null) continue;
    if (smallest === null || dp < smallest) smallest = dp;
  }
  return smallest;
}

/**
 * Số dp mà `hitSlop` cộng thêm theo CHIỀU DỌC, hoặc `null` khi không đọc tĩnh
 * được (biến, hằng số nhập từ file khác).
 *
 * ⚠️ `hitSlop` nhận cả hai dạng và chúng cộng khác nhau:
 *   `hitSlop={8}`                        → 8 mỗi phía  ⇒ +16
 *   `hitSlop={{ top: 8, bottom: 8 }}`    → chỉ đúng hai khoá đó ⇒ +16
 *   `hitSlop={{ left: 8, right: 8 }}`    → nới ngang, KHÔNG giúp gì cho chiều cao
 * Trộn hai dạng là chỗ hay sai nhất: `{ vertical: 8 }` của RN mới cũng phải cộng
 * cả trên lẫn dưới.
 */
function verticalHitSlop(node) {
  if (ts.isNumericLiteral(node)) return Number(node.text) * 2;

  if (ts.isObjectLiteralExpression(node)) {
    let extra = 0;
    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop) || !ts.isNumericLiteral(prop.initializer)) return null;
      const key = prop.name.getText().replace(/['"]/g, '');
      const value = Number(prop.initializer.text);
      if (key === 'top' || key === 'bottom') extra += value;
      else if (key === 'vertical') extra += value * 2;
    }
    return extra;
  }

  return null;
}

/** Mọi chuỗi tĩnh trong `className` — kể cả khi bọc trong `cn(...)`. */
function classNamesOf(attribute) {
  const classes = [];
  const collect = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      classes.push(...node.text.split(/\s+/).filter(Boolean));
    else ts.forEachChild(node, collect);
  };
  if (attribute.initializer) collect(attribute.initializer);
  return classes;
}

/**
 * Tên các slot `tv()` được GỌI trong `className`.
 *
 * `styles.navButton()` → `['navButton']`;
 * `cn(buttonStyles({ fullWidth }).pressable(), className)` → `['pressable']`.
 *
 * ⚠️ Chỉ lấy tên hàm được GỌI, không lấy mọi thuộc tính đọc tới: `styles.root`
 * chưa gọi thì chưa ra chuỗi class nào.
 */
function slotCallsOf(attribute) {
  const slots = [];
  const collect = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression))
      slots.push(node.expression.name.text);
    ts.forEachChild(node, collect);
  };
  if (attribute.initializer) collect(attribute.initializer);
  return slots;
}

/**
 * Bảng "tên slot → những chuỗi class từng gán cho nó" của MỘT file.
 *
 * Lấy cả `slots` gốc lẫn phần ghi đè trong `variants`: chiều cao của control
 * trong repo này gần như luôn nằm ở biến thể `size` (`sm: { root: 'h-control-sm' }`),
 * không nằm ở slot gốc. Bỏ `variants` là bỏ đúng chỗ có số đo.
 *
 * Vét mọi object literal của file thay vì lần theo đúng cây `tv()`: đơn giản
 * hơn nhiều, và cái giá — vơ nhầm vài object không phải công thức style — vô
 * hại, vì bước sau chỉ đọc được class chiều cao thật.
 */
function slotClassesOf(source) {
  const table = new Map();
  (function visit(node) {
    if (ts.isObjectLiteralExpression(node)) {
      for (const prop of node.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        if (!ts.isStringLiteralLike(prop.initializer)) continue;
        const name = prop.name.getText().replace(/['"]/g, '');
        if (!table.has(name)) table.set(name, []);
        table.get(name).push(prop.initializer.text.split(/\s+/).filter(Boolean));
      }
    }
    ts.forEachChild(node, visit);
  })(source);
  return table;
}

/** `./date-picker.styles` cạnh file hiện tại → đường dẫn thật, hoặc `null`. */
function resolveRelativeImport(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')])
    if (fs.existsSync(candidate)) return candidate;
  return null;
}

/**
 * Cỡ icon (dp) của `<Icon size=…>`: số (`size={18}`), tên bậc (`size="sm"` → `layout.icon`), hoặc MẶC ĐỊNH 24 khi bỏ trống
 * (`docs/rules/ui-components.md`: `<Icon name="arrow-right" /> // 24dp`). Biểu thức khác (biến, hằng) → `null`: không đọc tĩnh được.
 */
function iconSizeOf(openingElement) {
  const attribute = openingElement.attributes.properties.find(
    (a) => ts.isJsxAttribute(a) && a.name.getText() === 'size',
  );
  if (!attribute) return 24;
  const init = attribute.initializer;
  if (!init) return null;
  if (ts.isStringLiteral(init)) return layout.icon[init.text] ?? null;
  if (ts.isJsxExpression(init) && init.expression) {
    if (ts.isNumericLiteral(init.expression)) return Number(init.expression.text);
    if (ts.isStringLiteralLike(init.expression)) return layout.icon[init.expression.text] ?? null;
  }
  return null;
}

/**
 * Pressable mà con DUY NHẤT là một `<Icon>` — nút chỉ-icon, ca hay hỏng nhất: không có chữ nào để "đẩy" hộp chạm lớn lên,
 * và người ta viết `hitSlop={8}` theo phản xạ (icon 18 + 16 = **34dp**, thiếu 10). Phần soát theo `className` ở trên KHÔNG thấy
 * ca này vì không có class chiều cao nào để đọc. Vùng chạm ước = cỡ icon + 2 × đệm (`p-*`/`py-*`) + hitSlop dọc.
 *
 * Trả `null` khi không áp dụng hoặc không đọc tĩnh được (thà bỏ sót còn hơn báo nhầm) — cùng nguyên tắc phần trên.
 */
function iconOnlyBox(element) {
  const opening = element.openingElement;
  const children = element.children.filter((c) => !(ts.isJsxText(c) && c.text.trim() === ''));
  if (children.length !== 1) return null;
  const only = children[0];
  const iconOpening = ts.isJsxElement(only)
    ? only.openingElement
    : ts.isJsxSelfClosingElement(only)
      ? only
      : null;
  if (!iconOpening || iconOpening.tagName.getText() !== 'Icon') return null;

  const size = iconSizeOf(iconOpening);
  if (size === null) return null;

  let padding = 0;
  let hitSlop;
  for (const attribute of opening.attributes.properties) {
    if (!ts.isJsxAttribute(attribute)) continue;
    const name = attribute.name.getText();
    if (name === 'hitSlop') hitSlop = attribute;
    if (name !== 'className') continue;
    const classes = classNamesOf(attribute);
    // Đã có chiều cao khai tường minh ⇒ phần soát theo class lo, không đo lại ở đây.
    if (heightOf(classes) !== null) return null;
    for (const cls of classes) {
      const match = /^p[y]?-(.+)$/.exec(cls);
      const dp = match ? scaleToDp(match[1]) : null;
      if (dp !== null && dp > padding) padding = dp;
    }
  }

  let slop = 0;
  if (hitSlop) {
    const expression =
      hitSlop.initializer && ts.isJsxExpression(hitSlop.initializer)
        ? hitSlop.initializer.expression
        : undefined;
    const extra = expression ? verticalHitSlop(expression) : null;
    if (extra === null) return null;
    slop = extra;
  }

  return { effective: size + 2 * padding + slop, hasHitSlop: Boolean(hitSlop), size };
}

// ── Quét ────────────────────────────────────────────────────────────────────

const files = listSourceFiles(SCAN_DIRS);
const problems = [];
let checked = 0;
let checkedIcons = 0;

/** Bảng slot của một file — dựng một lần rồi dùng lại. */
const slotCache = new Map();
const slotsFor = (file) => {
  if (!slotCache.has(file)) slotCache.set(file, slotClassesOf(parseSource(file).source));
  return slotCache.get(file);
};

for (const file of files) {
  const { source, where } = parseSource(file);

  /** Slot nhìn thấy được từ file này: của chính nó + của file nhập tương đối. */
  const visibleSlots = [slotsFor(file)];
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const specifier = statement.moduleSpecifier;
    if (!ts.isStringLiteral(specifier) || !specifier.text.startsWith('.')) continue;
    const target = resolveRelativeImport(file, specifier.text);
    if (target) visibleSlots.push(slotsFor(target));
  }

  /**
   * Chiều cao NHỎ NHẤT mà một slot từng nhận, `null` nếu không slot nào khai.
   *
   * Lấy nhỏ nhất vì chỉ cần MỘT biến thể tụt xuống 32dp là ô chạm hỏng ở đúng
   * biến thể đó — lấy trung bình hay lấy lớn nhất là bỏ qua đúng ca cần bắt.
   */
  const slotHeight = (names) => {
    let smallest = null;
    for (const name of names)
      for (const table of visibleSlots)
        for (const classes of table.get(name) ?? []) {
          const dp = heightOf(classes);
          if (dp !== null && (smallest === null || dp < smallest)) smallest = dp;
        }
    return smallest;
  };

  (function visit(node) {
    if (ts.isJsxElement(node) && PRESSABLE_TAGS.has(node.openingElement.tagName.getText())) {
      const box = iconOnlyBox(node);
      if (box) {
        checkedIcons++;
        if (box.effective < MIN_TOUCH_DP) {
          problems.push({
            where: where(node.getStart()),
            tag: node.openingElement.tagName.getText(),
            height: box.size,
            effective: box.effective,
            hasHitSlop: box.hasHitSlop,
            iconOnly: true,
          });
        }
      }
    }

    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText();

      let className = null;
      let hitSlop;
      let pressable = PRESSABLE_TAGS.has(tag);

      for (const attribute of node.attributes.properties) {
        if (!ts.isJsxAttribute(attribute)) continue;
        const name = attribute.name.getText();
        if (name === 'onPress') pressable = true;
        else if (name === 'className') className = attribute;
        else if (name === 'hitSlop') hitSlop = attribute;
      }

      if (pressable && className) {
        const inline = heightOf(classNamesOf(className));
        const viaSlot = slotHeight(slotCallsOf(className));
        const height =
          inline === null ? viaSlot : viaSlot === null ? inline : Math.min(inline, viaSlot);
        if (height !== null) {
          checked++;
          let effective = height;
          let slopUnknown = false;

          if (hitSlop) {
            const expression =
              hitSlop.initializer && ts.isJsxExpression(hitSlop.initializer)
                ? hitSlop.initializer.expression
                : undefined;
            const extra = expression ? verticalHitSlop(expression) : null;
            // ⚠️ Không đọc tĩnh được thì COI NHƯ đủ: người viết đã nghĩ tới vùng
            // chạm rồi. Thà bỏ sót còn hơn bắt họ viết lại cho vừa lòng script.
            if (extra === null) slopUnknown = true;
            else effective += extra;
          }

          if (!slopUnknown && effective < MIN_TOUCH_DP) {
            problems.push({
              where: where(node.getStart()),
              tag,
              height,
              effective,
              hasHitSlop: Boolean(hitSlop),
            });
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  })(source);
}

// ── Báo ─────────────────────────────────────────────────────────────────────

console.log(`Đã quét ${String(files.length)} file trong: ${SCAN_DIRS.join(', ')}`);
console.log(`Thẻ bấm được suy ra được chiều cao: ${String(checked)} · nút chỉ-icon: ${String(checkedIcons)} · ngưỡng ${String(MIN_TOUCH_DP)}dp`); // prettier-ignore

if (problems.length === 0) {
  console.log('\n✅ Mọi vùng chạm suy ra được đều ≥ 44dp (hoặc đã bù bằng hitSlop).');
  process.exit(0);
}

console.log(`\n❌ ${String(problems.length)} vùng chạm DƯỚI ${String(MIN_TOUCH_DP)}dp:\n`);
for (const p of problems) {
  const subject = p.iconOnly ? `icon ${String(p.height)}dp` : `${String(p.height)}dp`;
  const detail = p.hasHitSlop
    ? `${subject} + hitSlop = ${String(p.effective)}dp`
    : `${subject}, KHÔNG có hitSlop`;
  console.log(`  <${p.tag}>${p.iconOnly ? ' (chỉ có icon)' : ''} — ${detail}\n      ${p.where}`);
}
console.log(
  `\nThêm \`hitSlop\` cho đủ ${String(MIN_TOUCH_DP)}dp, hoặc cho thẻ cao lên.\n` +
    '⚠️ Và kiểm bằng mắt: hitSlop của hai control CẠNH NHAU không được chồng lên nhau.',
);
process.exit(1);
