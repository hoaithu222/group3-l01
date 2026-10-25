import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import perfectionist from 'eslint-plugin-perfectionist';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'src/**/*.generated.ts', 'src/assets/icons/index.tsx']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: { perfectionist },
    rules: {
      // Sắp xếp props JSX theo a → z (auto-fix khi save)
      // key/ref luôn đứng đầu, handler onXxx dồn xuống cuối
      'perfectionist/sort-jsx-props': [
        'warn',
        {
          type: 'alphabetical',
          order: 'asc',
          ignoreCase: true,
          groups: ['top', 'unknown', 'callback'],
          customGroups: [
            { groupName: 'top', elementNamePattern: '^(key|ref)$' },
            { groupName: 'callback', elementNamePattern: '^on[A-Z]' },
          ],
        },
      ],
    },
  },
  // Shared hooks — cho phép setState in effect (useMediaQuery pattern)
  {
    files: ['src/shared/hooks/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  /**
   * Kit2 re-export nguyên component của Radix bằng phép gán
   * (`export const RadioGroup = RadioGroupPrimitive.Root`).
   *
   * Đây LÀ component, nhưng `react-refresh` phân tích tĩnh nên chỉ thấy một
   * hằng số gán từ thuộc tính namespace và báo nhầm là "export không phải
   * component". Khai đích danh hai tên này thay vì tắt rule cho cả thư mục —
   * tắt cả cụm là mất luôn khả năng bắt vi phạm thật.
   */
  {
    files: ['src/shared/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': [
        'error',
        { allowExportNames: ['RadioGroup', 'ToastProvider'] },
      ],
    },
  },
  // ⛔ Hai lớp gác cho Ô TÌM KIẾM — phải nằm CHUNG một block `no-restricted-syntax`:
  // ESLint flat config GHI ĐÈ (không gộp) options của cùng một rule khi có nhiều
  // block cùng khớp file, tách ra là mất nhóm selector khai trước.
  //   1. IME-safe input  → `docs/rules/ime-safe-input.md`
  //   2. So khớp bỏ dấu  → `docs/rules/search-matching.md`
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXOpeningElement[name.name='Input'] > JSXAttribute[name.name='debounce']",
          message:
            'Prop `debounce` biến <Input> thành controlled nội bộ → cắt ngang composition IME, mất dấu tiếng Việt. Bỏ prop này, dùng `useImeSafeSearchInput` cho ô nhập + `useDebounce` ở tầng lọc/query. Xem docs/rules/ime-safe-input.md',
        },
        {
          selector:
            "JSXOpeningElement[name.name=/^(Input|input)$/]:has(JSXAttribute[name.name='placeholder'] > Literal[value=/[Tt]ìm|[Ss]earch/]):has(JSXAttribute[name.name='value'])",
          message:
            'Ô tìm kiếm controlled (`value` + `onChange`) làm mất dấu khi gõ tiếng Việt. Dùng `{...inputProps}` từ `useImeSafeSearchInput(value, onChange)`. Xem docs/rules/ime-safe-input.md',
        },
        {
          selector:
            "JSXOpeningElement[name.name=/^(Input|input)$/] > JSXAttribute[name.name='value'] > JSXExpressionContainer > Identifier[name=/^(search|searchTerm|searchText|searchValue|searchQuery|query|keyword|filterText)$/i]",
          message:
            'Ô tìm kiếm controlled (`value={search}`) làm mất dấu khi gõ tiếng Việt. Dùng `{...inputProps}` từ `useImeSafeSearchInput(value, onChange)`. Xem docs/rules/ime-safe-input.md',
        },
        {
          selector:
            "CallExpression[callee.property.name='includes'][callee.object.callee.property.name='toLowerCase']",
          message:
            '`x.toLowerCase().includes(y)` KHÔNG bỏ dấu — gõ "met khoi" không ra "Mét khối". Dùng `includesSearch` / `includesNormalized` / `matchesSearch` từ `@/shared/utils/format/string.utils`. Xem docs/rules/search-matching.md',
        },
      ],
    },
  },
]);
