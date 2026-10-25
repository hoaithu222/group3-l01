import { mergeAttributes, Node } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { AssetUrlResolver } from "./asset-resolver";

export interface ImageAttrs {
  assetId: string;
  alt?: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    docImage: {
      /** Chèn ảnh khối tại vị trí chọn. CHỈ lưu `assetId` (+ `alt`) — URL ký lấy lúc hiển thị, không bao giờ vào Y.Doc. */
      insertDocImage: (attrs: ImageAttrs) => ReturnType;
    };
  }
}

/**
 * Node ảnh khối của tài liệu. Schema CỐ Ý không có thuộc tính `src`: nội dung Yjs (do bất kỳ máy nào ghi) không thể khiến WebView nạp URL
 * tuỳ ý (theo dõi/rò IP); ảnh chỉ nạp từ URL ký do app cấp qua bridge (`resolveAssetUrl` → `assetUrl`). Dán HTML có `<img src>` bên ngoài bị loại
 * vì rule parse chỉ nhận `img[data-asset-id]`.
 */
export function createImageNode(resolver: AssetUrlResolver) {
  return Node.create({
    name: "image",
    group: "block",
    atom: true,
    draggable: true,

    addAttributes() {
      return {
        assetId: {
          default: null,
          parseHTML: (el) => el.getAttribute("data-asset-id"),
          renderHTML: (attrs) => (attrs["assetId"] ? { "data-asset-id": attrs["assetId"] } : {}),
        },
        alt: {
          default: "",
          parseHTML: (el) => el.getAttribute("alt") ?? "",
          renderHTML: (attrs) => (attrs["alt"] ? { alt: attrs["alt"] } : {}),
        },
      };
    },

    parseHTML() {
      return [{ tag: "img[data-asset-id]" }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["img", mergeAttributes(HTMLAttributes)];
    },

    addCommands() {
      return {
        insertDocImage:
          (attrs) =>
          ({ commands }) =>
            commands.insertContent({ type: this.name, attrs: { assetId: attrs.assetId, alt: attrs.alt ?? "" } }),
      };
    },

    addNodeView() {
      return ({ node }) => renderImageView(node, resolver);
    },
  });
}

/** DOM thuần của node ảnh: khung giữ chỗ → xin URL (chỉ khi gần vùng nhìn thấy) → `<img>`; lỗi tải thử lại một lần với URL mới, sau đó chạm để thử lại. */
export function renderImageView(initial: PMNode, resolver: AssetUrlResolver) {
  const dom = document.createElement("figure");
  dom.className = "doc-image";
  const img = document.createElement("img");
  img.decoding = "async";
  img.draggable = false;
  const message = document.createElement("span");
  message.className = "doc-image__message";
  dom.append(img, message);

  let assetId = "";
  let destroyed = false;
  let retried = false;
  let observer: IntersectionObserver | undefined;

  const setState = (state: "loading" | "ready" | "error"): void => {
    dom.dataset["state"] = state;
    message.textContent = state === "loading" ? "Đang tải ảnh…" : state === "error" ? "Không tải được ảnh. Chạm để thử lại" : "";
  };

  const load = (): void => {
    const id = assetId;
    if (!id) return;
    setState("loading");
    resolver.resolve(id).then(
      (url) => {
        if (!destroyed && assetId === id) img.src = url;
      },
      () => {
        if (!destroyed && assetId === id) setState("error");
      },
    );
  };

  const loadWhenVisible = (): void => {
    observer?.disconnect();
    if (typeof IntersectionObserver === "undefined") {
      load();
      return;
    }
    observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer?.disconnect();
        load();
      },
      { rootMargin: "400px" },
    );
    observer.observe(dom);
  };

  const apply = (node: PMNode): void => {
    const next = String(node.attrs["assetId"] ?? "");
    img.alt = String(node.attrs["alt"] ?? "");
    if (next === assetId) return;
    assetId = next;
    dom.dataset["assetId"] = next;
    retried = false;
    img.removeAttribute("src");
    setState("loading");
    loadWhenVisible();
  };

  img.addEventListener("load", () => setState("ready"));
  img.addEventListener("error", () => {
    if (!assetId || !img.getAttribute("src")) return;
    if (retried) return setState("error");
    retried = true; // URL ký có thể đã hết hạn: bỏ đệm, xin lại đúng một lần.
    resolver.invalidate(assetId);
    load();
  });
  dom.addEventListener("click", () => {
    if (dom.dataset["state"] !== "error") return;
    retried = false;
    resolver.invalidate(assetId);
    load();
  });

  apply(initial);

  return {
    dom,
    update(node: PMNode): boolean {
      if (node.type.name !== "image") return false;
      apply(node);
      return true;
    },
    destroy(): void {
      destroyed = true;
      observer?.disconnect();
    },
  };
}
