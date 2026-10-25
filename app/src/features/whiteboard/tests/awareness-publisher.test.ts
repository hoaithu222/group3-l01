import fs from 'node:fs';
import path from 'node:path';

import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';

import { AWARENESS } from '../constants/whiteboard.constants';
import { createAwarenessPublisher, utf8Length } from '../collab/awareness-publisher';

jest.useFakeTimers();

const USER = { color: '#175CD3', id: 'u1', name: 'Nguyễn An' };

function setup() {
  const awareness = new Awareness(new Y.Doc());
  awareness.setLocalState({ user: USER });
  const writes = jest.spyOn(awareness, 'setLocalState');
  return { awareness, publisher: createAwarenessPublisher(awareness), writes };
}

describe('phát awareness của mình', () => {
  it('CHỈ dùng khoá collab cho phép với bảng trắng (user/pointer/selection/viewport) — không `cursor`/`tool`/`draft`', () => {
    const { awareness, publisher } = setup();
    publisher.pointer({ x: 10, y: 20 });
    publisher.selection(['a', 'b']);
    jest.advanceTimersByTime(100);
    const keys = Object.keys(awareness.getLocalState() ?? {});
    expect(keys.sort()).toEqual(['pointer', 'selection', 'user']);
    expect(keys).not.toEqual(expect.arrayContaining(['cursor']));
    expect(keys).not.toEqual(expect.arrayContaining(['tool']));
    expect(keys).not.toEqual(expect.arrayContaining(['draft']));
  });

  it('khớp `collab/src/resource-kinds.ts` (nguồn hợp đồng): mọi khoá ta dùng nằm trong tập server cho phép', () => {
    const file = path.resolve(process.cwd(), '../collab/src/resource-kinds.ts');
    if (!fs.existsSync(file)) return; // repo tách rời `collab/` — bỏ qua như `contract.test.ts`
    const source = fs.readFileSync(file, 'utf8');
    for (const key of ['user', 'pointer', 'selection', 'viewport'])
      expect(source).toContain(`"${key}"`);
    expect(source).not.toMatch(/whiteboard[\s\S]{0,300}"draft"/);
  });

  it('throttle ≤ 30 lần/giây dù kéo dồn dập; bản CUỐI vẫn tới; mỗi lượt đúng MỘT tin (setLocalState một lần)', () => {
    const { awareness, publisher, writes } = setup();
    for (let t = 0; t < 1000; t++) {
      publisher.pointer({ x: t, y: t });
      jest.advanceTimersByTime(1);
    }
    // Trong đúng 1 giây: 1 lần đầu + tối đa 1 lần mỗi 33,3 ms ⇒ ≤ 30 + 1.
    expect(writes.mock.calls.length).toBeLessThanOrEqual(AWARENESS.maxHz + 1);
    jest.advanceTimersByTime(100);
    expect(awareness.getLocalState()?.['pointer']).toEqual({ x: 999, y: 999 });
  });

  it('không ghi lại khi state không đổi (không sinh tin thừa)', () => {
    const { publisher, writes } = setup();
    publisher.pointer({ x: 1, y: 1 });
    jest.advanceTimersByTime(100);
    publisher.pointer({ x: 1, y: 1 });
    jest.advanceTimersByTime(100);
    expect(writes).toHaveBeenCalledTimes(1);
  });

  it('mỗi state ≤ 2 KiB: chọn quá nhiều/id quá dài thì bỏ `selection`, KHÔNG gửi state quá cỡ', () => {
    const { awareness, publisher } = setup();
    publisher.pointer({ x: 1, y: 2 });
    publisher.selection(Array.from({ length: 200 }, (_, i) => `${'x'.repeat(60)}${i}`));
    jest.advanceTimersByTime(100);
    const state = awareness.getLocalState() ?? {};
    expect(utf8Length(JSON.stringify(state))).toBeLessThanOrEqual(AWARENESS.maxBytes);
    expect(state['pointer']).toEqual({ x: 1, y: 2 });
  });

  it('`selection` cắt còn tối đa AWARENESS.selectionMax id', () => {
    const { awareness, publisher } = setup();
    publisher.selection(Array.from({ length: 40 }, (_, i) => `id${i}`));
    jest.advanceTimersByTime(100);
    expect((awareness.getLocalState()?.['selection'] as string[]).length).toBe(
      AWARENESS.selectionMax,
    );
  });

  it('pointer(null) gỡ khoá `pointer` (rời canvas); `user` giữ nguyên', () => {
    const { awareness, publisher } = setup();
    publisher.pointer({ x: 1, y: 2 });
    jest.advanceTimersByTime(100);
    publisher.pointer(null);
    jest.advanceTimersByTime(100);
    expect(awareness.getLocalState()).toEqual({ user: USER });
  });

  it('flush đẩy ngay tin đang chờ; destroy huỷ hẹn giờ', () => {
    const { awareness, publisher } = setup();
    publisher.pointer({ x: 1, y: 1 });
    publisher.pointer({ x: 2, y: 2 });
    publisher.flush();
    expect(awareness.getLocalState()?.['pointer']).toEqual({ x: 2, y: 2 });
    publisher.pointer({ x: 3, y: 3 });
    publisher.destroy();
    jest.advanceTimersByTime(1000);
    expect(awareness.getLocalState()?.['pointer']).toEqual({ x: 2, y: 2 });
  });

  it('utf8Length đếm BYTE: tên tiếng Việt có dấu nhiều hơn số ký tự', () => {
    expect(utf8Length('abc')).toBe(3);
    expect(utf8Length('Việt')).toBeGreaterThan('Việt'.length);
  });
});
