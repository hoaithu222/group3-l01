/**
 * `getFirebaseIdentityVerifier()` đọc `env.FIREBASE_*` một lần rồi memoize — như `push.factory.test.ts`:
 * `jest.resetModules()` + `require` lại sau khi đổi `process.env`; mock `firebase-admin/*` để không chạm Firebase thật.
 */
const mockVerifyIdToken = jest.fn();

jest.mock("firebase-admin/app", () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(() => ({ name: "firebase" })),
  cert: jest.fn((c: unknown) => c),
}));
jest.mock("firebase-admin/auth", () => ({
  getAuth: jest.fn(() => ({ verifyIdToken: mockVerifyIdToken })),
}));

const CLAIMS = {
  uid: "uid-1",
  email: "a@gmail.com",
  email_verified: true,
  name: "An",
  auth_time: 1_700_000_000,
  firebase: { sign_in_provider: "google.com", identities: {} },
};

function load() {
  return require("../firebase-identity.verifier") as typeof import("../firebase-identity.verifier");
}

describe("FirebaseIdentityVerifier", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;
    delete process.env.FIREBASE_CREDENTIALS_JSON;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe("verify()", () => {
    const build = () => new (load().FirebaseIdentityVerifier)({ name: "firebase" } as never);

    it("gọi verifyIdToken với checkRevoked = true và ánh xạ claim", async () => {
      mockVerifyIdToken.mockResolvedValue(CLAIMS);
      await expect(build().verify("tok")).resolves.toEqual({
        uid: "uid-1",
        email: "a@gmail.com",
        emailVerified: true,
        name: "An",
        provider: "google.com",
        authTime: 1_700_000_000,
      });
      expect(mockVerifyIdToken).toHaveBeenCalledWith("tok", true);
    });

    it("thiếu email_verified / tên rỗng ⇒ emailVerified=false, name=null", async () => {
      mockVerifyIdToken.mockResolvedValue({ ...CLAIMS, email_verified: undefined, name: "   " });
      const id = await build().verify("tok");
      expect(id.emailVerified).toBe(false);
      expect(id.name).toBeNull();
    });

    it.each(["auth/id-token-expired", "auth/id-token-revoked", "auth/argument-error", "auth/invalid-id-token", "auth/user-disabled"])(
      "lỗi của chính token (%s) ⇒ 401 AUTH_022",
      async (code) => {
        mockVerifyIdToken.mockRejectedValue(Object.assign(new Error("x"), { code }));
        await expect(build().verify("tok")).rejects.toMatchObject({ statusCode: 401, errorCode: "AUTH_022" });
      }
    );

    it("lỗi hạ tầng (mạng, quyền service-account) ⇒ 503 SYS_503, không phải 401", async () => {
      mockVerifyIdToken.mockRejectedValue(Object.assign(new Error("ECONNRESET"), { code: "app/network-error" }));
      await expect(build().verify("tok")).rejects.toMatchObject({ statusCode: 503, errorCode: "SYS_503" });

      mockVerifyIdToken.mockRejectedValue(new Error("không có code"));
      await expect(build().verify("tok")).rejects.toMatchObject({ statusCode: 503, errorCode: "SYS_503" });
    });
  });

  describe("getFirebaseIdentityVerifier()", () => {
    it("thiếu FIREBASE_* ⇒ fail-closed: verify() → 503 SYS_503, không bao giờ cho qua", async () => {
      const { getFirebaseIdentityVerifier } = load();
      await expect(getFirebaseIdentityVerifier().verify("tok")).rejects.toMatchObject({
        statusCode: 503,
        errorCode: "SYS_503",
      });
      expect(mockVerifyIdToken).not.toHaveBeenCalled();
    });

    it("đủ FIREBASE_* ⇒ FirebaseIdentityVerifier thật; gọi hai lần trả cùng instance (memoized)", () => {
      process.env.FIREBASE_PROJECT_ID = "demo";
      process.env.FIREBASE_CLIENT_EMAIL = "sa@demo.iam.gserviceaccount.com";
      process.env.FIREBASE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n";
      const { getFirebaseIdentityVerifier, FirebaseIdentityVerifier } = load();
      const v = getFirebaseIdentityVerifier();
      expect(v).toBeInstanceOf(FirebaseIdentityVerifier);
      expect(getFirebaseIdentityVerifier()).toBe(v);
    });
  });
});
