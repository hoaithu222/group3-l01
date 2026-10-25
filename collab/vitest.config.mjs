import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Test đầu-cuối mở server thật + WebSocket thật (cổng ngẫu nhiên nên các file chạy song song được).
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
