import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // Tiptap/ProseMirror in ra cảnh báo nhất định trong jsdom; test tự khẳng định log cần thiết.
    restoreMocks: true,
  },
});
