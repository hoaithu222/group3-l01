# Error Handling Rules (CRITICAL)

## AppError Hierarchy

**File:** `core/exceptions/AppError.ts`

```
AppError (base)
├── ValidationError     (400, VAL_001)
├── UnauthorizedError   (401, AUTH_002/003/004)
├── ForbiddenError      (403, AUTH_005)
├── NotFoundError       (404, RES_001)
├── ConflictError       (409, RES_002)
├── TooManyRequestsError (429, RATE_001)
└── BadGatewayError     (502, SYS_502)
```

### Sử dụng đúng

```typescript
// ✅ ĐÚNG — Throw specific error class
throw new NotFoundError("Không tìm thấy người dùng");
throw new UnauthorizedError("Mật khẩu sai", ErrorCode.AUTH_001);
throw new ConflictError("Email đã tồn tại");
throw new ValidationError("Dữ liệu không hợp lệ", fieldErrors);
throw new ForbiddenError("Không có quyền truy cập");

// ❌ SAI — Generic error
throw new Error("Not found");
res.status(404).json({ message: "Not found" });
```

---

## Error Codes

**File:** `core/utils/error.codes.ts`

Pattern: `<DOMAIN>_<3-digit>`

| Prefix | Domain |
|--------|--------|
| `AUTH_` | Authentication/Authorization |
| `USER_` | User module |
| `VAL_`  | Validation |
| `RES_`  | Resource (not found, conflict) |
| `RATE_` | Rate limiting |
| `SYS_`  | System/Infrastructure |

Khi thêm error code mới → thêm vào `error.codes.ts`, KHÔNG hardcode string.

---

## catchAsync — BẮT BUỘC cho mọi async handler

**File:** `core/utils/catchAsync.ts`

```typescript
// ✅ ĐÚNG — Dùng catchAsync, errors tự propagate tới errorHandler
const getUser = catchAsync(async (req: Request, res: Response) => {
  const user = await userService.getById(req.params.id);
  ResponseUtils.success(res, user);
});

// ❌ SAI — Tự try/catch trong controller
const getUser = async (req: Request, res: Response) => {
  try {
    const user = await userService.getById(req.params.id);
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message }); // KHÔNG LÀM
  }
};
```

---

## ResponseUtils — BẮT BUỘC cho mọi response

**File:** `core/utils/response.ts`

### Success Response

```typescript
ResponseUtils.success(res, data, "Thành công");
// → { success: true, message: "...", data: {...}, timestamp: "..." }

ResponseUtils.success(res, data, "Tạo thành công", 201);
// → HTTP 201 + success body
```

### Paginated Response

```typescript
ResponseUtils.paginated(res, {
  data: items,
  meta: {
    page, limit, total,
    totalPages: Math.ceil(total / limit),
    hasNext: page * limit < total,
    hasPrev: page > 1,
  }
}, "Danh sách");
```

### KHÔNG ĐƯỢC

```typescript
// ❌ SAI — Tự format response
res.json({ status: "ok", data: user });
res.status(200).send({ result: users });

// ❌ SAI — Tự xử lý error response trong controller
res.status(404).json({ error: "Not found" });
// → Throw NotFoundError thay vì tự trả response
```

---

## Error Response Format (tự động từ errorHandler)

```json
{
  "success": false,
  "error": {
    "code": "AUTH_001",
    "message": "Email hoặc mật khẩu không đúng",
    "details": []
  },
  "timestamp": "2026-03-12T10:00:00.000Z",
  "requestId": "uuid-v4"
}
```

---

## Global Error Handler

**File:** `core/middlewares/errorHandler.ts`

- PHẢI là middleware cuối cùng (4-arg signature)
- Tự động map: `AppError` → structured response
- JWT errors → `AUTH_002/003`
- Unknown errors → `SYS_500` (ẩn details trong production)
- Log tất cả errors với requestId

---

## Quy tắc

1. **LUÔN throw AppError subclass** — KHÔNG throw generic Error
2. **LUÔN dùng catchAsync** — KHÔNG try/catch trong controllers
3. **LUÔN dùng ResponseUtils** — KHÔNG tự format response
4. **Error codes từ dictionary** — KHÔNG hardcode error code strings
5. **Service throw, controller không catch** — Errors propagate qua catchAsync → errorHandler
6. **Sensitive data ẩn trong production** — Stack trace, internal details
