import * as Y from "yjs";
import { DOCUMENT_FRAGMENT, mergeYjsStates, replaceFragmentContent } from "..";

/** Dựng state có fragment `default` gồm các đoạn văn (XmlElement `paragraph` chứa XmlText) như y-prosemirror/Tiptap ghi. */
function docWithParagraphs(texts: string[]): Y.Doc {
  const doc = new Y.Doc();
  const frag = doc.getXmlFragment(DOCUMENT_FRAGMENT);
  for (const t of texts) {
    const p = new Y.XmlElement("paragraph");
    const text = new Y.XmlText();
    text.insert(0, t);
    p.insert(0, [text]);
    frag.push([p]);
  }
  return doc;
}

const paragraphsOf = (doc: Y.Doc): string[] => doc.getXmlFragment(DOCUMENT_FRAGMENT).toArray().map((n) => (n as Y.XmlElement).toArray().map((t) => (t as Y.XmlText).toString()).join(""));
const stateOf = (doc: Y.Doc): Uint8Array => Y.encodeStateAsUpdate(doc);
const replicaOf = (state: Uint8Array): Y.Doc => {
  const d = new Y.Doc();
  Y.applyUpdate(d, state);
  return d;
};

describe("mergeYjsStates", () => {
  it("hợp nhất hai state phân kỳ, không mất phần nào, giao hoán", () => {
    const a = docWithParagraphs(["gốc"]);
    const b = replicaOf(stateOf(a));
    a.getXmlFragment(DOCUMENT_FRAGMENT).push([new Y.XmlElement("heading")]);
    (b.getXmlFragment(DOCUMENT_FRAGMENT).get(0) as Y.XmlElement).setAttribute("align", "center");

    const ab = paragraphsOf(replicaOf(mergeYjsStates(stateOf(a), stateOf(b))));
    const ba = paragraphsOf(replicaOf(mergeYjsStates(stateOf(b), stateOf(a))));
    expect(ab).toEqual(ba);
    expect(ab).toHaveLength(2);
    expect(replicaOf(mergeYjsStates(stateOf(a), stateOf(b))).getXmlFragment(DOCUMENT_FRAGMENT).length).toBe(2);
  });

  it("state hiện tại rỗng/null → kết quả = state mới; hợp nhất chính nó là lũy đẳng", () => {
    const a = docWithParagraphs(["x", "y"]);
    expect(paragraphsOf(replicaOf(mergeYjsStates(null, stateOf(a))))).toEqual(["x", "y"]);
    expect(paragraphsOf(replicaOf(mergeYjsStates(stateOf(a), stateOf(a))))).toEqual(["x", "y"]);
  });
});

describe("replaceFragmentContent (khôi phục snapshot)", () => {
  it("thay toàn bộ nội dung fragment bằng nội dung snapshot; newState chứa nội dung mới", () => {
    const current = docWithParagraphs(["hiện tại 1", "hiện tại 2"]);
    const snapshot = docWithParagraphs(["bản cũ"]);
    const { newState } = replaceFragmentContent(stateOf(current), stateOf(snapshot));
    expect(paragraphsOf(replicaOf(newState))).toEqual(["bản cũ"]);
  });

  it("delta áp lên bản sao ĐÃ đồng bộ với state hiện tại cho đúng kết quả (mô phỏng client đang mở)", () => {
    const current = docWithParagraphs(["a", "b", "c"]);
    const client = replicaOf(stateOf(current)); // client đang mở, đã đồng bộ
    const { newState, delta } = replaceFragmentContent(stateOf(current), stateOf(docWithParagraphs(["bản khôi phục", "dòng 2"])));
    Y.applyUpdate(client, delta);
    expect(paragraphsOf(client)).toEqual(["bản khôi phục", "dòng 2"]);
    expect(paragraphsOf(client)).toEqual(paragraphsOf(replicaOf(newState)));
  });

  it("client gõ thêm SAU snapshot khôi phục vẫn hợp nhất được (CRDT): nội dung khôi phục + phần gõ mới", () => {
    const current = docWithParagraphs(["cũ"]);
    const client = replicaOf(stateOf(current));
    const { delta } = replaceFragmentContent(stateOf(current), stateOf(docWithParagraphs(["khôi phục"])));
    // Trong lúc BE khôi phục, client gõ thêm một đoạn (chưa nhận delta).
    const p = new Y.XmlElement("paragraph");
    client.getXmlFragment(DOCUMENT_FRAGMENT).push([p]);
    Y.applyUpdate(client, delta);
    const result = paragraphsOf(client);
    expect(result).toContain("khôi phục");
    expect(result).not.toContain("cũ");
    expect(result).toHaveLength(2); // đoạn mới gõ (rỗng) còn nguyên
  });

  it("current null (tài liệu chưa có state) → chỉ có nội dung snapshot; snapshot rỗng → fragment rỗng", () => {
    expect(paragraphsOf(replicaOf(replaceFragmentContent(null, stateOf(docWithParagraphs(["s"]))).newState))).toEqual(["s"]);
    expect(paragraphsOf(replicaOf(replaceFragmentContent(stateOf(docWithParagraphs(["x"])), new Uint8Array()).newState))).toEqual([]);
  });

  it("giữ thuộc tính nút (ảnh chỉ lưu assetId, không URL)", () => {
    const snap = new Y.Doc();
    const img = new Y.XmlElement("image");
    img.setAttribute("assetId", "66f1a2b3c4d5e6f708192a3d");
    snap.getXmlFragment(DOCUMENT_FRAGMENT).push([img]);
    const restored = replicaOf(replaceFragmentContent(null, stateOf(snap)).newState);
    const node = restored.getXmlFragment(DOCUMENT_FRAGMENT).get(0) as Y.XmlElement;
    expect(node.nodeName).toBe("image");
    expect(node.getAttribute("assetId")).toBe("66f1a2b3c4d5e6f708192a3d");
  });
});
