---
inclusion: always
---

# Validation & Security Rules (CRITICAL)

## 1. Input Validation — Zod BẮT BUỘC

### Mọi endpoint PHẢI validate input

```typescript
// ✅ ĐÚNG — Validate body/query/params qua middleware
router.post('/', validateBody(createSchema), controller.create);
router.get('/', validateQuery(listQuerySchema), controller.getList);
router.get('/:id', validateParams(idParamSchema), controller.getById);

// ❌ SAI — Không validate
router.post('/', controller.create);  // req.body chưa validate

// ❌ SAI — Validate trong controller
const create = catchAsync(async (req, res) => {
  if (!req.body.name) return res.status(400).json(...)  // KHÔNG LÀM
});
```

### Common Schemas có sẵn

```typescript
// ID param
const idParamSchema = z.object({
  id: z.string().uuid("ID không hợp lệ"),
});

// Pagination query
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});
```

### DTO best practices

```typescript
// Create: fields required
export const createSchema = z.object({
  name: z.string().min(1, "Bắt buộc"),
  email: z.string().email("Email không hợp lệ"),
});

// Update: fields optional (partial)
export const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
});

// Luôn export type
export type CreateDto = z.infer<typeof createSchema>;
export type UpdateDto = z.infer<typeof updateSchema>;
```

---

## 2. Authentication

### JWT Flow

```
Login/Register → accessToken (ngắn, mặc định 15 phút — `JWT_EXPIRES_IN`) + refreshToken (7 ngày, xoay vòng + phát hiện dùng lại)
API Request → Authorization: Bearer <accessToken>
Token Expired → POST /refresh-token với refreshToken
Logout → thu hồi phiên (`Session.revokedAt`) + dấu `session:revoked:<sid>` trên Redis (hiệu lực tức thì với access token của phiên đó)
Đổi/đặt lại mật khẩu, khoá, đổi vai trò → `sessionVersion++` (vô hiệu MỌI access token cũ)
```

### Middlewares có sẵn

```typescript
import { authenticateToken, optionalAuth, requireRoles } from '@core/middlewares/auth';

// BẮT BUỘC auth
router.use(authenticateToken);  // req.user = { id, email, name, role }

// Optional auth (attach user nếu có token)
router.get('/public', optionalAuth, controller.getPublic);

// Role-based access
router.delete('/:id', requireRoles([ROLES.ADMIN]), controller.remove);
```

### Sau auth, access user info

```typescript
const userId = req.user!.id;      // string
const userEmail = req.user!.email; // string
const userRole = req.user!.role;   // string
```

---

## 3. Rate Limiting

```typescript
import { globalLimiter, loginLimiter, apiLimiter } from '@core/middlewares/rateLimiter';

// Đã apply globalLimiter cho tất cả routes (600 req/60s/IP)
// Route xác thực dùng limiter TÁCH THEO ENDPOINT (createAuthLimiter): loginLimiter (30 lần SAI/15 phút/IP), registerLimiter,
// forgotPasswordLimiter, resetPasswordLimiter…; dò mật khẩu một tài khoản → PasswordAttemptGuard (khoá theo tài khoản)
// apiLimiter: 300 req/60s theo user (cho business endpoints cần protect)

router.post('/login', loginLimiter, validateBody(loginSchema), controller.login);
```

---

## 4. Input Sanitization

**Tự động** qua `sanitizeInput` middleware:

- Strip HTML tags từ tất cả string fields
- Trim whitespace
- Recursive cho nested objects/arrays
- **Rich text fields** (content, htmlContent, description) → chỉ strip `<script>` và event handlers

Khi cần thêm rich text field → thêm vào `RICH_TEXT_FIELDS` set trong `sanitize.ts`.

---

## 5. Password Security

```typescript
// Hash password với bcrypt (10 rounds)
const hash = await bcrypt.hash(password, 10);

// Compare
const valid = await bcrypt.compare(password, user.passwordHash);

// KHÔNG BAO GIỜ:
// - Log password
// - Trả password/hash trong response
// - Store plain text password
```

---

## 6. Environment Secrets

```typescript
// Production BẮT BUỘC:
// - JWT_SECRET >= 32 chars
// - JWT_REFRESH_SECRET >= 32 chars
// - DATABASE_URL required

// KHÔNG BAO GIỜ:
// - Hardcode secrets trong code
// - Commit .env file
// - Log secrets
```

---

## 7. CORS

```typescript
// Configured in app.ts via ALLOWED_ORIGINS env var
// credentials: true (cho cookies/tokens)
// KHÔNG set origin: '*' trong production
```

---

## Quy tắc

1. **Validate TRƯỚC controller** — Zod middleware cho body/query/params
2. **Auth middleware TRƯỚC business routes** — `router.use(authenticateToken)`
3. **Rate limit auth endpoints** — limiter riêng từng endpoint (`createAuthLimiter`) + `PasswordAttemptGuard` theo tài khoản; nonce một lần trước login/register (D-27)
4. **Hash passwords** — bcrypt, 10 rounds; chính sách mật khẩu MỘT chỗ (`newPasswordSchema`: 8–128 ký tự); email luôn `normalizeEmail`
5. **Sanitize sensitive response** — Remove passwordHash, internal fields
6. **Thu hồi phiên tức thì** — `markSessionsRevoked` (Redis TTL) khi đăng xuất/thu hồi; `sessionVersion++` khi thu hồi hàng loạt
7. **Email enumeration prevention** — forgot-password luôn trả success
8. **Env validation** — Zod schema, strict trong production
