/**
 * jsdom thiếu vài API bố cục mà ProseMirror gọi khi cuộn/đo toạ độ (`Range#getClientRects`, `elementFromPoint`…).
 * Bổ sung bản rỗng để lệnh chạy được; test KHÔNG kiểm bố cục (việc của thiết bị thật).
 */
const emptyRects = (): DOMRectList => Object.assign([] as unknown as DOMRectList, { item: () => null });
const zeroRect = (): DOMRect => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) });

if (typeof Range !== "undefined") {
  Range.prototype.getClientRects = emptyRects;
  Range.prototype.getBoundingClientRect = zeroRect;
}
if (typeof Element !== "undefined") {
  Element.prototype.getClientRects = emptyRects;
  Element.prototype.scrollIntoView = () => undefined;
}
document.elementFromPoint = () => null;

// jsdom không có ClipboardEvent (ProseMirror `pasteHTML` dựng nó).
if (typeof ClipboardEvent === "undefined") {
  class ClipboardEventShim extends Event {
    readonly clipboardData: DataTransfer | null;
    constructor(type: string, init: EventInit & { clipboardData?: DataTransfer | null } = {}) {
      super(type, init);
      this.clipboardData = init.clipboardData ?? null;
    }
  }
  Object.assign(globalThis, { ClipboardEvent: ClipboardEventShim });
}
