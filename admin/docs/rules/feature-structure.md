# Feature Module Structure

## Cấu trúc feature

```
src/features/{feature-name}/
├── api/
│   └── {feature}.api.ts          # Endpoint paths (hoặc trong src/core/api/)
├── types/
│   └── {feature}.types.ts        # Feature-specific types
├── service/
│   └── {feature}.queries.ts      # React Query hooks
├── hooks/
│   ├── index.ts                  # Re-export hooks
│   └── use{Feature}.ts           # Combined feature hook
├── components/
│   ├── {Entity}Table.tsx         # Table component
│   ├── {Entity}Form.tsx          # Form component
│   ├── {Entity}Filter.tsx        # Filter component
│   └── ...
├── pages/
│   ├── {Entity}Page.tsx          # List page
│   ├── {Entity}DetailPage.tsx    # Detail/Edit page
│   └── ...
├── schemas/
│   └── {feature}.schema.ts       # Zod validation schemas
└── index.ts                       # Barrel export
```

## Feature mẫu

`src/features/auth/` (pages/schemas/service/hooks — CRUD/auth đơn giản) và
`src/features/user/` (phân hệ nghiệp vụ đầy đủ đầu tiên — Phase 0: bảng lọc/
tìm/phân trang URL-synced, drawer nhiều tab, action có xác nhận lý do, React
Query + Zod) là hai feature có sẵn trong base để copy cấu trúc. `auth` hiện
KHÔNG khớp 100% template ở trên (chưa có `api/`/`types/` riêng, `hooks/` chưa
có `index.ts` re-export) — coi template ở trên là đích cần hướng tới cho
feature MỚI, không phải mô tả đúng feature cũ đó. Khi tạo feature nghiệp vụ
thật (có gọi API), theo đúng template đầy đủ, kể cả `hooks/index.ts`.

> Base từng có `src/features/demo/` (showcase tĩnh toàn bộ kit2, không gọi
> API) làm ví dụ ghép UI — đã xoá khỏi dự án Super App sau khi phân hệ `user`
> thay được vai trò minh hoạ đó (`docs/rules/routing-conventions.md`). Dự án
> khác dẫn xuất từ base gốc có thể vẫn còn `demo/`.

## Quy tắc

- **KHÔNG** đặt business logic trong components — chuyển vào hooks
- **KHÔNG** gọi API trực tiếp trong components — qua service + React Query hooks
- **KHÔNG** import từ feature khác — dùng shared code
- **Lazy load** tất cả pages trong router
- Re-export hooks qua `hooks/index.ts`
