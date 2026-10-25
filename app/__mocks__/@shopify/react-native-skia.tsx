/**
 * Mock `@shopify/react-native-skia` cho Jest.
 *
 * Gói phát hành `lib/module/*` dạng ES module chưa biên dịch nên `jest-expo` không transform ("Cannot use import statement outside a module"), và bản
 * "official" (`@shopify/react-native-skia/jestSetup.js`) đòi thay `testEnvironment` bằng môi trường nạp CanvasKit WASM cho MỌI suite — quá nặng để bật
 * toàn cục. Nên đây là mock NHẸ, toàn cục (`jest.mock('@shopify/react-native-skia')` ở `jest.setup.js`).
 *
 * ── Cái mock làm ────────────────────────────────────────────────────────────
 *  · Mọi tên VIẾT HOA là component (`Canvas`, `Group`, `Path`, `Rect`, `Circle`, `Text`, `Image`, `Fill`…) → `View` giữ NGUYÊN prop, `testID` mặc
 *    định `skia-<Tên>` ⇒ `getByTestId('skia-Path').props.path` đọc được đường vẽ đã truyền.
 *  · Enum (`BlendMode`, `PaintStyle`, `StrokeCap`…) → object trả lại CHÍNH TÊN khoá (`StrokeCap.Round === 'Round'`) — đủ để so sánh, không phải số thật.
 *  · `Skia.Path.Make()` → đường vẽ ghi lại thao tác (`path.ops`); `Skia.Color(...)`, `Skia.XYWHRect(...)`, `Skia.Paint()`, `Skia.Matrix()` dựng đối tượng đơn giản.
 *    Tên khác trong `Skia` là `jest.fn()`.
 *  · Hook: `useCanvasRef` (ref có `makeImageSnapshot`), `useFont`/`useFonts`/`matchFont`/`useImage` → `null`; hook/hàm khác là `jest.fn()`.
 *
 * ⛔ KHÔNG vẽ pixel, KHÔNG đo hình học thật (`getBounds` trả hộp rỗng) — thứ đó thuộc `engine/` của Whiteboard, viết THUẦN TS và test không cần Skia.
 * Test cần hành vi Skia thật hơn (vd `makeImageSnapshot` trả dữ liệu) tự `jest.mock('@shopify/react-native-skia', factory)` — factory của test thắng mock này.
 */
import { View } from 'react-native';
import type { ViewProps } from 'react-native';
import type { ReactElement } from 'react';

type NodeProps = ViewProps & Record<string, unknown>;

const ENUM_NAMES = new Set([
  'BlendMode',
  'ClipOp',
  'FillType',
  'FilterMode',
  'ImageFormat',
  'MipmapMode',
  'PaintStyle',
  'PathOp',
  'PointMode',
  'StrokeCap',
  'StrokeJoin',
  'TileMode',
]);

/**
 * Khoá mà Node/Jest/Babel "dò" trên mọi đối tượng — PHẢI là `undefined`, không được `jest.fn()`:
 * `then` là hàm ⇒ mô-đun thành "thenable" và `await import('@shopify/react-native-skia')` (nạp lười) treo vĩnh viễn.
 */
const PROBED_KEYS = new Set([
  'then',
  'default',
  'toJSON',
  'asymmetricMatch',
  'nodeType',
  'constructor',
]);

const components = new Map<string, (props: NodeProps) => ReactElement>();

function componentFor(name: string) {
  let component = components.get(name);
  if (!component) {
    component = function SkiaNode(props: NodeProps) {
      return <View testID={`skia-${name}`} {...props} />;
    };
    components.set(name, component);
  }
  return component;
}

/** Đường vẽ ghi lại thao tác; mọi lệnh dựng đường trả về chính nó để chuỗi hoá được như Skia thật. */
function makePath() {
  const ops: [string, ...unknown[]][] = [];
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      ops.push([name, ...args]);
      return path;
    };
  const path = {
    ops,
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    quadTo: record('quadTo'),
    cubicTo: record('cubicTo'),
    close: record('close'),
    reset: record('reset'),
    addRect: record('addRect'),
    addCircle: record('addCircle'),
    addOval: record('addOval'),
    addRRect: record('addRRect'),
    transform: record('transform'),
    copy: () => makePath(),
    isEmpty: () => ops.length === 0,
    getBounds: () => ({ x: 0, y: 0, width: 0, height: 0 }),
    toSVGString: () => '',
  };
  return path;
}

const skia = new Proxy(
  {
    Path: { Make: makePath },
    Color: (color: unknown) => color,
    XYWHRect: (x: number, y: number, width: number, height: number) => ({ x, y, width, height }),
    Paint: () => ({
      setAntiAlias: jest.fn(),
      setColor: jest.fn(),
      setStrokeCap: jest.fn(),
      setStrokeJoin: jest.fn(),
      setStrokeWidth: jest.fn(),
      setStyle: jest.fn(),
    }),
    Matrix: () => ({ translate: jest.fn(), scale: jest.fn(), rotate: jest.fn() }),
  } as Record<string, unknown>,
  {
    get: (target, key) =>
      key in target || PROBED_KEYS.has(String(key)) ? target[key as string] : jest.fn(),
  },
);

const overrides: Record<string, unknown> = {
  __esModule: true,
  Skia: skia,
  useCanvasRef: () => ({
    current: {
      makeImageSnapshot: jest.fn(() => ({
        encodeToBase64: jest.fn(() => ''),
        encodeToBytes: jest.fn(() => new Uint8Array()),
      })),
    },
  }),
  useFont: () => null,
  useFonts: () => null,
  matchFont: () => null,
  useImage: () => null,
};

// `Proxy` thay cho danh sách xuất khẩu: API của Skia rất rộng; tên lạ viết hoa → component, viết thường → `jest.fn()` (thay vì `undefined` gây
// lỗi khó hiểu kiểu "Element type is invalid").
module.exports = new Proxy(overrides, {
  get(target, key) {
    if (typeof key !== 'string' || key in target || PROBED_KEYS.has(key))
      return target[key as string];
    if (ENUM_NAMES.has(key)) {
      return new Proxy(
        {},
        { get: (_enum, member) => (typeof member === 'string' ? member : undefined) },
      );
    }
    return /^[A-Z]/.test(key) ? componentFor(key) : jest.fn();
  },
  has: () => true,
});
