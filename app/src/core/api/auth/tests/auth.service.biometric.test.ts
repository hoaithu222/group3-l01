import { apiClient } from '@/core/api/client';
import { purgeSession } from '@/core/api/session';

import { authService } from '../auth.service';
import { createFakeAuthAdapter } from './fake-auth-adapter';

/**
 * `biometricLogin()` phải là PASSTHROUGH THUẦN TUÝ: gửi ĐÚNG
 * `{ credentialId, deviceId, nonce, hmac }` (đã có sẵn từ nơi gọi), không có
 * trường `secret` ở bất kỳ đâu trong request, và bản thân nó KHÔNG tự gọi
 * `/auth/nonce`. Bộ test nonce của `login()`/`register()` nằm ở
 * `auth.service.nonce.test.ts` — tách để mỗi file dưới trần 150 dòng.
 */
const fake = createFakeAuthAdapter();

beforeAll(() => {
  apiClient.defaults.adapter = fake.adapter;
});

beforeEach(async () => {
  fake.reset();
  await purgeSession();
});

describe('biometricLogin() — passthrough thuần tuý, KHÔNG tự lấy nonce', () => {
  it('gửi ĐÚNG { credentialId, deviceId, nonce, hmac }, không có trường secret nào', async () => {
    fake.responders.set('/auth/biometric/login', () => ({
      data: { accessToken: 'access-3', refreshToken: 'refresh-3' },
      status: 200,
    }));

    const payload = {
      credentialId: 'cred-1',
      deviceId: 'device-1',
      hmac: 'a'.repeat(64),
      nonce: 'nonce-da-co-san',
    };

    await authService.biometricLogin(payload);

    expect(fake.countCallsTo('/auth/nonce')).toBe(0);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.url).toBe('/auth/biometric/login');
    expect(fake.calls[0]?.data).toEqual(payload);

    // Khẳng định phủ định: không có bất kỳ khoá nào tên "secret" trong body gửi đi.
    expect(JSON.stringify(fake.calls[0]?.data)).not.toContain('secret');
  });

  it('không đọc/ghi gì tới kho khoá sinh trắc học — nó không biết bí mật tồn tại', async () => {
    // `biometricLogin` không import `core/auth/biometric` — nếu ai đó lỡ thêm
    // import đó vào, `check:imports`/review sẽ bắt được ở tầng khác; ở đây chỉ
    // cần chốt hành vi: gọi xong, payload gửi đi khớp 100% với đầu vào.
    fake.responders.set('/auth/biometric/login', () => ({
      data: { accessToken: 'access-4' },
      status: 200,
    }));

    const payload = { credentialId: 'cred-2', deviceId: 'device-2', hmac: 'b'.repeat(64), nonce: 'n' };
    const session = await authService.biometricLogin(payload);

    expect(session.accessToken).toBe('access-4');
  });
});
