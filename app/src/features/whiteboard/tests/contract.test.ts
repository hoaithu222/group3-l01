import fs from 'node:fs';
import path from 'node:path';

import * as Y from 'yjs';

import {
  addElements,
  BACKGROUNDS,
  COLOR_TOKEN_PATTERN,
  createElement,
  ELEMENT_TYPES,
  ID_PATTERN,
  newElementId,
  OBJECT_ID_PATTERN,
  setBackground,
  WB_LIMITS,
} from '../engine';

/**
 * Đối chiếu engine với `contracts/whiteboard-elements.schema.json` (BE là chủ). Đọc file ở gốc monorepo (jest chạy
 * với cwd = `app/`); checkout riêng lẻ không có thư mục đó thì bộ test này bị SKIP (hiện rõ trong báo cáo jest),
 * không đỏ oan.
 */
const SCHEMA_PATH = path.resolve(
  process.cwd(),
  '..',
  'contracts',
  'whiteboard-elements.schema.json',
);
const suite = fs.existsSync(SCHEMA_PATH) ? describe : describe.skip;

interface Prop {
  enum?: string[];
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  maxItems?: number;
  maxProperties?: number;
  pattern?: string;
}
interface Schema {
  properties: { elements: Prop; order: Prop; meta: { properties: { background: Prop } } };
  $defs: {
    elementId: Prop;
    colorToken: Prop;
    objectId: Prop;
    element: { required: string[]; properties: Record<string, Prop> };
  };
}

const USER = '0123456789abcdef01234567';

suite('khớp contracts/whiteboard-elements.schema.json', () => {
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8')) as Schema;
  const elementSchema = schema.$defs.element;

  it('cùng tập loại phần tử và nền canvas', () => {
    expect(elementSchema.properties.type?.enum).toEqual([...ELEMENT_TYPES]);
    expect(schema.properties.meta.properties.background.enum).toEqual([...BACKGROUNDS]);
  });

  it('cùng các trần số học', () => {
    const p = elementSchema.properties;
    expect(schema.properties.elements.maxProperties).toBe(WB_LIMITS.elementsMax);
    expect(schema.properties.order.maxItems).toBe(WB_LIMITS.elementsMax);
    expect(p.text?.maxLength).toBe(WB_LIMITS.textMax);
    expect(p.points?.maxItems).toBe(WB_LIMITS.pointsMax);
    expect([p.strokeWidth?.minimum, p.strokeWidth?.maximum]).toEqual([1, 12]);
    expect([p.fontSize?.minimum, p.fontSize?.maximum]).toEqual([12, 96]);
    expect(WB_LIMITS.strokeWidthMin).toBe(p.strokeWidth?.minimum);
    expect(WB_LIMITS.fontSizeMax).toBe(p.fontSize?.maximum);
  });

  it('cùng biểu thức chính quy của id, id token màu và ObjectId', () => {
    expect(new RegExp(schema.$defs.elementId.pattern ?? '').source).toBe(ID_PATTERN.source);
    expect(new RegExp(schema.$defs.colorToken.pattern ?? '').source).toBe(
      COLOR_TOKEN_PATTERN.source,
    );
    expect(new RegExp(schema.$defs.objectId.pattern ?? '').source).toBe(OBJECT_ID_PATTERN.source);
    expect(ID_PATTERN.test(newElementId())).toBe(true);
  });

  it('Y.Doc.toJSON() của engine: đủ khoá bắt buộc, không khoá lạ, id = khoá trong elements', () => {
    const doc = new Y.Doc();
    const specific: Record<string, object> = {
      freehand: { points: [0, 0, 10, 10] },
      image: { assetId: USER },
      arrow: { startBinding: { elementId: 'e-rect' }, endBinding: { elementId: 'e-ellipse' } },
      sticky: { text: 'ý tưởng', locked: true },
    };
    const all = ELEMENT_TYPES.map((type) =>
      createElement(
        type,
        { id: `e-${type}`, x: 1, y: 2, w: 30, h: 40, ...specific[type] },
        { userId: USER, now: 5 },
      ),
    );
    expect(addElements(doc, all, { userId: USER, now: 5 })).toEqual({ ok: true });
    setBackground(doc, 'dots', { userId: USER });

    const json = doc.toJSON() as {
      elements: Record<string, Record<string, unknown>>;
      order: string[];
    };
    expect(Object.keys(doc.toJSON()).sort()).toEqual(['elements', 'meta', 'order']);
    expect(json.order).toHaveLength(ELEMENT_TYPES.length);
    for (const [key, el] of Object.entries(json.elements)) {
      expect(el.id).toBe(key);
      expect(Object.keys(el).filter((k) => !(k in elementSchema.properties))).toEqual([]);
      expect(elementSchema.required.filter((k) => !(k in el))).toEqual([]);
      expect(new RegExp(schema.$defs.objectId.pattern ?? '').test(String(el.createdBy))).toBe(true);
      expect(Number.isInteger(el.updatedAt)).toBe(true);
    }
  });
});
