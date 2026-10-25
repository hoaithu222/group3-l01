/**
 * Bản giả DÙNG CHUNG của hai module native (`@react-native-google-signin`, `@react-native-firebase/auth`) cho các test của
 * `google-sign-in.ts`. Không phải file `.test.ts` nên Jest không chạy nó như một suite.
 *
 * Jest không có RNGoogleSignin/RNFirebase và không chạy được `import()` động ⇒ mỗi file test mock `../load-google-modules`
 * để trả `[google, firebase]` từ đây (`jest.mock` phải nằm trong chính file test vì được hoist).
 */
export function createGoogleMocks() {
  const google = {
    GoogleSignin: {
      configure: jest.fn(),
      hasPlayServices: jest.fn(),
      signIn: jest.fn(),
      signOut: jest.fn(),
    },
    statusCodes: {
      IN_PROGRESS: 'IN_PROGRESS',
      PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
      SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    },
  };
  const firebase = {
    getAuth: jest.fn(),
    getIdToken: jest.fn(),
    GoogleAuthProvider: { credential: jest.fn((token: string) => ({ providerToken: token })) },
    signInWithCredential: jest.fn(),
    signOut: jest.fn(),
  };

  /** Đặt lại mọi hàm về đường THÀNH CÔNG — gọi ở `beforeEach` (`clearAllMocks` không xoá các giá trị trả về đã đặt). */
  const arm = (): void => {
    google.GoogleSignin.hasPlayServices.mockResolvedValue(true);
    google.GoogleSignin.signOut.mockResolvedValue(null);
    google.GoogleSignin.signIn.mockResolvedValue({ data: { idToken: 'google-id-token' }, type: 'success' });
    firebase.getAuth.mockReturnValue('auth-instance');
    firebase.signInWithCredential.mockResolvedValue({ user: { uid: 'u' } });
    firebase.getIdToken.mockResolvedValue('firebase-id-token');
    firebase.signOut.mockResolvedValue(undefined);
  };

  return { arm, firebase, google };
}

export const WEB_CLIENT_ID = 'web-client.apps.googleusercontent.com';
