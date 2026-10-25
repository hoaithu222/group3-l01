import fs from 'node:fs';
import path from 'node:path';

import {
  ALL_COMMANDS,
  BRIDGE_LIMITS,
  BRIDGE_VERSION,
  PARAM_COMMANDS,
  SIMPLE_COMMANDS,
} from '../webview/doc-editor-bridge.types';
import { CONNECTION_STATES, ERROR_CODES, NOTICE_CODES } from '../webview/editor-message.constants';
import { parseEditorMessage } from '../webview/parse-editor-message';

/**
 * Đối chiếu bản sao bridge phía app với NGUỒN SỰ THẬT `collab/editor-web/src/bridge-protocol.ts` (+ `bridge-validate.ts`). Đọc file ở gốc monorepo (jest chạy với
 * cwd = `app/`); checkout riêng lẻ không có thư mục `collab/` thì bộ test này bị SKIP (hiện rõ trong báo cáo jest), không đỏ oan. Đổi một tin ở collab mà quên
 * sửa app ⇒ test này đỏ — đúng mục đích ("đổi một tin ⇒ tăng BRIDGE_VERSION + sửa app cùng đợt", `collab/AGENTS.md`).
 */
const SRC = path.resolve(process.cwd(), '..', 'collab', 'editor-web', 'src');
const PROTOCOL = path.join(SRC, 'bridge-protocol.ts');
const suite = fs.existsSync(PROTOCOL) ? describe : describe.skip;

/** Các chuỗi trong `export const NAME = [ "a", "b" ] as const;` */
function constList(source: string, name: string): string[] {
  const body =
    new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const`).exec(source)?.[1] ?? '';
  return [...body.matchAll(/"([^"]+)"/g)].map((match) => match[1] as string);
}

/** Các chuỗi trong `export type NAME = "a" | "b";` */
function unionOf(source: string, name: string): string[] {
  const body = new RegExp(`export type ${name} =([^;]*);`).exec(source)?.[1] ?? '';
  return [...body.matchAll(/"([^"]+)"/g)].map((match) => match[1] as string);
}

/** Tên loại tin (`Envelope<"type", …>`) trong khối `export type NAME = …;` */
function messageTypes(source: string, name: string): string[] {
  const body = new RegExp(`export type ${name} =([\\s\\S]*?);\\n`).exec(source)?.[1] ?? '';
  return [...body.matchAll(/Envelope<\s*"(\w+)"/g)].map((match) => match[1] as string).sort();
}

suite('khớp collab/editor-web/src/bridge-protocol.ts', () => {
  const source = fs.readFileSync(PROTOCOL, 'utf8');

  it('cùng BRIDGE_VERSION và trần cỡ tin', () => {
    expect(Number(/BRIDGE_VERSION = (\d+)/.exec(source)?.[1])).toBe(BRIDGE_VERSION);
    expect(Number(/maxMessageChars: (\d+) \* 1024/.exec(source)?.[1]) * 1024).toBe(
      BRIDGE_LIMITS.maxMessageChars,
    );
    expect(Number(/maxLinkChars: (\d+)/.exec(source)?.[1])).toBe(BRIDGE_LIMITS.maxLinkChars);
  });

  it('cùng tập lệnh toolbar', () => {
    expect(constList(source, 'SIMPLE_COMMANDS')).toEqual([...SIMPLE_COMMANDS]);
    expect(constList(source, 'PARAM_COMMANDS')).toEqual([...PARAM_COMMANDS]);
    expect(ALL_COMMANDS).toHaveLength(SIMPLE_COMMANDS.length + PARAM_COMMANDS.length);
  });

  it('cùng mã thông báo, mã lỗi và trạng thái kết nối của tin WebView → app', () => {
    expect([...unionOf(source, 'NoticeCode')].sort()).toEqual([...NOTICE_CODES].sort());
    expect([...unionOf(source, 'EditorErrorCode')].sort()).toEqual([...ERROR_CODES].sort());
    expect([...unionOf(source, 'ConnectionState')].sort()).toEqual([...CONNECTION_STATES].sort());
  });

  it('parseEditorMessage nhận đủ mọi loại tin của EditorMessage (không loại nào thiếu)', () => {
    const editorTypes = messageTypes(source, 'EditorMessage');
    expect(editorTypes).toEqual([
      'awareness',
      'commandResult',
      'error',
      'notice',
      'openLink',
      'ready',
      'requestImage',
      'requestToken',
      'resolveAssetUrl',
      'selectionState',
      'status',
    ]);
    // Một loại tin lạ bị từ chối với `payload-invalid` (không phải "không biết loại"): mọi loại trên đều có nhánh kiểm.
    for (const type of editorTypes) {
      const parsed = parseEditorMessage({ payload: {}, type, v: 1 });
      expect(parsed).toMatchObject({ ok: false, reason: 'payload-invalid', type });
    }
  });

  it('HostMessage của app có đủ mọi loại tin app → WebView', () => {
    expect(messageTypes(source, 'HostMessage')).toEqual([
      'assetUrl',
      'command',
      'dispose',
      'init',
      'insertImage',
      'retry',
      'setMode',
      'setTheme',
      'setToken',
    ]);
  });
});
