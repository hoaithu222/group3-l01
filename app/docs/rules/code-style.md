# Quy ước code

## Đặt tên

| Loại                            | Quy ước                 | Ví dụ                    |
| ------------------------------- | ----------------------- | ------------------------ |
| Component / file component      | PascalCase              | `ViolationCard.tsx`      |
| Hook / file hook                | camelCase, prefix `use` | `useSessionBootstrap.ts` |
| Service · api · types · queries | kebab + chấm            | `acceptance.service.ts`  |
| Utility                         | kebab-case + `.utils`   | `string.utils.ts`        |
| Hằng số                         | UPPER_SNAKE_CASE        | `REFRESH_TOKEN_KEY`      |
| Thư mục                         | kebab-case              | `weekly-report/`         |
| File route (Expo Router)        | kebab-case              | `forgot-password.tsx`    |

⛔ Tên file route **là đường dẫn**. Đổi `reports.tsx` thành `report.tsx` là đổi
URL, và mọi deep link đã phát hành (trong e-mail, thông báo đẩy) hỏng theo.

## Thứ tự import

1. React / React Native
2. Thư viện bên thứ ba
3. `@/shell`
4. `@/core`
5. `@/shared`
6. `@/features`
7. Tương đối (`./`, `../`)

`import type` cho mọi import chỉ dùng kiểu — `verbatimModuleSyntax` bật, và
ESLint tự sửa khi save.

## Giới hạn

- **1 file `.tsx` = 1 component export.**
  Ngoại lệ: sub-component cục bộ **không export**, ≤ 30 dòng JSX, dùng ≥ 2 lần
  trong chính file đó. Dùng ở file khác → tách ra `components/`.
  Xem `PatternLayoutSection.tsx` (`ActionItem`) làm ví dụ.
- Component `.tsx` ≤ 200 dòng · hook/util `.ts` ≤ 150 dòng. Vượt → tách.
- ⛔ Không `any` → dùng `unknown` rồi thu hẹp.
- ⛔ Không để biến/helper rác ở tầm module (trừ hằng số, kiểu, và helper thuần).

## Chú thích

Viết **VÌ SAO**, không viết _cái gì_. Code đã nói cái gì rồi.

```ts
// ❌ Gán token vào header
config.headers.set('Authorization', `Bearer ${token}`);

// ✅ ⛔ BẮT BUỘC `await`. Kho khoá từ chối (Keystore hỏng sau khi người dùng đổi
//    khoá màn hình) thì phải biết NGAY, chứ không phải phát hiện ở lần mở app
//    sau khi người dùng đã bị đăng xuất.
const saved = await setRefreshToken(token);
```

Quy ước dấu hiệu dùng xuyên suốt base:
`⛔` = đừng làm/đừng bỏ · `⚠️` = cạm bẫy cần biết · `✅`/`❌` = đúng/sai.

## Đường dẫn

Dùng `@/` thay đường tương đối dài. Trong cùng một thư mục thì `./` gọn hơn và
vẫn rõ — xem `src/core/api/`.
