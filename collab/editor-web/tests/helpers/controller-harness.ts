import type { Editor } from "@tiptap/core";
import { EditorController, type ControllerDeps } from "../../src/controller";
import { createFakeSessionFactory } from "./fake-session";
import { FakeTransport, msg } from "./fake-transport";
import { initMessage } from "./fixtures";

export function setup(overrides: Partial<ControllerDeps> = {}) {
  const transport = new FakeTransport();
  const fake = createFakeSessionFactory();
  const root = document.createElement("div");
  document.body.append(root);
  const chrome = document.createElement("div");
  const controller = new EditorController({ transport, root, chrome, createSession: fake.factory, random: () => 0, ...overrides });
  controller.start();
  const editor = (): Editor => {
    const e = (controller as unknown as { editor?: Editor }).editor;
    if (!e) throw new Error("chưa có editor (chưa init?)");
    return e;
  };
  return {
    controller,
    transport,
    fake,
    root,
    chrome,
    editor,
    /** Gửi `init` live rồi (tuỳ chọn) cho server chấp nhận + đồng bộ. */
    open(init: Parameters<typeof initMessage>[0] = {}, scope: "read-write" | "readonly" | null = "read-write") {
      transport.deliver(initMessage(init));
      if (scope) fake.last.open(scope);
    },
    command(name: string, attrs?: unknown, requestId = "r1") {
      transport.deliver(msg("command", { name, ...(attrs === undefined ? {} : { attrs }), requestId }));
      return transport.last("commandResult");
    },
    destroy() {
      controller.destroy();
      root.remove();
    },
  };
}

/** Chờ các microtask (`selectionState` được gom bằng `queueMicrotask`). */
export const flush = (): Promise<void> => new Promise((resolve) => queueMicrotask(resolve));
