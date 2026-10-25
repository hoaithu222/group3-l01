---
name: web-testing
description: Viết/chạy test cho base-projects bằng Vitest + Testing Library — KHÔNG có Playwright/e2e/k6 trong stack này. Dùng khi viết test mới, sửa test fail, hoặc quyết định coverage cần bao nhiêu.
---

# Web Testing — Vitest + Testing Library only

base-projects **không có Playwright, không có e2e, không có k6** — chỉ
unit/integration test bằng Vitest (jsdom) + React Testing Library. Đừng đề
xuất setup Playwright/Cypress trừ khi user yêu cầu rõ ràng thêm hạ tầng mới.

## Lệnh có sẵn (`package.json`)

```bash
npm test              # vitest run — 1 lần, dùng trong CI/pre-push
npm run test:watch    # vitest — watch mode khi code
npm run test:ui       # vitest --ui — UI debug trực quan
npm run test:coverage # vitest run --coverage
```

Test sống ở `tests/` (root, KHÔNG colocate cạnh source) — mirror theo cấu
trúc `src/`: `tests/shared/`, `tests/core/`, `tests/*.test.tsx` cho app-level.
`tests/setup.ts` là global setup (jest-dom matchers...).

## Test hạ tầng đã có sẵn — đọc trước khi viết test mới tương tự

| File | Kiểm tra gì |
|---|---|
| `tests/shared/kit2-barrel.test.tsx` | Mọi component kit2 phải export đúng qua barrel `@/shared/ui` |
| `tests/shared/kit2-props-types.test.ts` | Mọi component qua barrel phải export kèm type `XxxProps` |
| `tests/shared/kit2-uncovered.test.tsx` | Export chưa có nơi dùng vẫn phải render được (không vỡ ngầm) |
| `tests/shared/kit2-render.test.tsx` | Smoke-render toàn bộ kit2 |
| `tests/shared/form-a11y.test.tsx` | Form field liên kết label↔control đúng |
| `tests/shared/auth-store.test.ts` | Ví dụ test Zustand store |
| `tests/core/client-refresh.test.ts` | Ví dụ test logic refresh token/API client |
| `tests/font-tokens.test.ts` | Ví dụ test đối chiếu token generated |

**Thêm component mới vào kit2 → các test barrel/props-types/uncovered ở trên
tự động bắt lỗi nếu quên export hoặc quên type — không cần viết test riêng
cho việc export, chỉ cần đảm bảo file mới tuân đúng convention.**

## Cấu trúc 1 test — AAA (Arrange-Act-Assert)

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Button } from '@/shared/ui';

describe('Button', () => {
  it('gọi onClick khi bấm và không bị disabled', async () => {
    // Arrange
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Lưu</Button>);
    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    // Assert
    expect(handleClick).toHaveBeenCalledOnce();
  });
});
```

Đặt tên test theo **"nên làm gì khi nào"**, KHÔNG `test1`/`it works`. Query
theo `getByRole`/`getByLabelText` (giống cách người dùng thật tương tác),
hạn chế `getByTestId` trừ khi không còn cách nào khác — kit2 đứng trên Radix
nên phần lớn component đã có role/aria đúng chuẩn.

## Mock

- `vi.fn()` cho callback/handler.
- `vi.mock('@/core/api/...')` cho service gọi API — mock ở tầng service, để
  component/hook logic thật chạy qua TanStack Query thật (test gần hành vi
  thật hơn mock cả `useQuery`).
- `vi.spyOn` khi chỉ cần theo dõi 1 method, không thay hoàn toàn behavior.

## Coverage — ưu tiên theo rủi ro, không ép 100% máy móc

| Vùng | Target |
|---|---|
| Logic nghiệp vụ quan trọng (auth, validation, token refresh) | Cao nhất, gần 100% nhánh |
| kit2 (`shared/ui`) | Đã có smoke-render/barrel test bao quát; test thêm khi component có logic state phức tạp (không chỉ hiển thị thuần) |
| Feature UI thường | 75-85%, ưu tiên happy path + 1-2 edge case rõ ràng |
| Component hiển thị thuần, không state | Không bắt buộc unit test riêng nếu đã được test qua page/integration |

## Test hành vi IME/search — đừng bỏ qua

Nếu component có ô search/filter tự do dùng `useImeSafeSearchInput`
(`docs/rules/ime-safe-input.md`), test PHẢI mô phỏng composition event
(`fireEvent.compositionStart/compositionEnd`) — `userEvent.type()` thường
không tự mô phỏng IME, dễ tạo test dương tính giả (pass dù bug IME thật vẫn
còn).

## Accessibility

Testing Library tự khuyến khích query theo role/label — nếu 1 element khó
`getByRole`, thường là dấu hiệu thiếu ARIA thật trong component, không phải
lỗi của test. Sửa component trước khi hạ chuẩn xuống `getByTestId`.
