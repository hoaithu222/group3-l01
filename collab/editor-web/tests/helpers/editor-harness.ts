import type { Editor } from "@tiptap/core";
import * as Y from "yjs";
import { AssetUrlResolver } from "../../src/asset-resolver";
import type { CommandContext } from "../../src/commands";
import { createEditor } from "../../src/editor-factory";

export interface EditorHarness {
  editor: Editor;
  doc: Y.Doc;
  element: HTMLElement;
  resolver: AssetUrlResolver;
  /** `assetId` mà editor đã xin URL. */
  requests: string[];
  links: string[];
  imageFiles: string[];
  contentErrors: Error[];
}

export function makeEditor(opts: { editable?: boolean; doc?: Y.Doc; resolver?: AssetUrlResolver } = {}): EditorHarness {
  const element = document.createElement("div");
  document.body.append(element);
  const doc = opts.doc ?? new Y.Doc();
  const requests: string[] = [];
  const links: string[] = [];
  const imageFiles: string[] = [];
  const contentErrors: Error[] = [];
  const resolver = opts.resolver ?? new AssetUrlResolver({ request: (id) => void requests.push(id) });
  const editor = createEditor({
    element,
    doc,
    awarenessProvider: null,
    user: null,
    placeholder: "Bắt đầu viết…",
    editable: opts.editable ?? true,
    resolver,
    onOpenLink: (url) => void links.push(url),
    onImageFile: (source) => void imageFiles.push(source),
    onContentError: (error) => void contentErrors.push(error),
  });
  return { editor, doc, element, resolver, requests, links, imageFiles, contentErrors };
}

export const cmdCtx = (editor: Editor, overrides: Partial<CommandContext> = {}): CommandContext => ({
  editor,
  loaded: true,
  editable: editor.isEditable,
  tooLarge: false,
  ...overrides,
});

/** Tên node/mark ở dạng phẳng để so sánh cấu trúc (bỏ qua thuộc tính). */
export function shape(node: { type?: string; content?: unknown[]; marks?: Array<{ type: string }>; text?: string }): unknown {
  const marks = node.marks?.map((m) => m.type);
  const children = (node.content as Array<typeof node> | undefined)?.map(shape);
  return [node.type, ...(node.text !== undefined ? [node.text] : []), ...(marks ? [{ marks }] : []), ...(children ? [children] : [])];
}
