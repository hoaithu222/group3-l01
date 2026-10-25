// ESLint flat config — collab/editor-web (bundle trình duyệt/WebView + script Node). Cổng `npm run lint`.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "tests/**/*.ts", "vite.config.ts", "vitest.config.ts"],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      // Không `any` (dùng `unknown`), không console — log qua kênh bridge (`error`/`notice`).
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports", fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["scripts/**/*.mjs", "vite.config.ts", "vitest.config.ts"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Test: dựng thư viện/DOM giả cần ép kiểu hẹp; vẫn cấm `any`.
    files: ["tests/**/*.ts"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
