const expoPreset = require('jest-expo/jest-preset');

/**
 * Jest — preset `jest-expo`.
 *
 * `jest-expo` lo phần khó nhất: transform cho toàn bộ gói React Native trong
 * `node_modules` (chúng phát hành dạng ES module chưa biên dịch nên Jest mặc
 * định nghẹn), mock module native, và dựng sẵn môi trường Expo.
 * ⛔ Đừng tự viết `transformIgnorePatterns` đè lên — sai một dấu là mất transform
 * cho một nhóm gói, và lỗi hiện ra dưới dạng "Unexpected token 'export'" ở một
 * file bạn không hề đụng tới.
 */
module.exports = {
  preset: 'jest-expo',

  /**
   * Bộ phân giải module riêng của `react-native-worklets`.
   *
   * ⛔ Thiếu dòng này thì MỌI test suite chết ngay lúc nạp, với lỗi
   * `TypeError: Cannot read properties of undefined (reading 'loadUnpackers')`
   * — kể cả những test thuần TypeScript không đụng gì tới hoạt ảnh.
   *
   * Nguyên nhân: Jest phân giải `*.native.js` cho worklets, mà bản `.native` gọi
   * thẳng xuống module native không tồn tại trong Node. Bộ phân giải này loại
   * đuôi `.native` cho riêng gói đó nên Jest lấy bản JavaScript thuần.
   *
   * Chuỗi lây lan dài và không hiện ra ngay trong stack: setup của NativeWind
   * (`react-native-css-interop/test/setup`) → reanimated → worklets.
   */
  resolver: 'react-native-worklets/jest/resolver',

  setupFiles: [
    /**
     * Dựng tầng CSS-interop của NativeWind trong môi trường test. Thiếu nó thì
     * component có `className` ném lỗi lúc render — không phải vì component sai,
     * mà vì hàm dựng JSX của NativeWind chưa được khởi tạo.
     */
    'react-native-css-interop/test/setup',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],

  // Phải khai lại dù tsconfig đã có `paths`: Jest không đọc tsconfig.
  // ⛔ `@/assets/` PHẢI đứng TRƯỚC `@/`: Jest dò `moduleNameMapper` theo THỨ TỰ khai, luật khớp đầu tiên thắng (khác
  // TypeScript — nó chọn mẫu cụ thể nhất). Để ngược thì `@/assets/images/brand-logo.png` rơi vào `src/assets/…` (không có)
  // ⇒ mọi test dựng `AuthScreenLayout` chết "Could not locate module".
  moduleNameMapper: {
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    // `yjs` → `lib0/webcrypto` (điều kiện export `react-native`) đòi `isomorphic-webcrypto/src/react-native` — gói KHÔNG cài kèm ⇒ mọi suite
    // nạp `yjs`/`y-protocols`/`@hocuspocus/provider` chết ngay lúc `require`. Cùng chuyển hướng với Metro: `metro.config.js`, `shims/isomorphic-webcrypto.js`.
    '^isomorphic-webcrypto/src/react-native$': '<rootDir>/shims/isomorphic-webcrypto.js',
  },

  // Cho phép test `import` các script build viết bằng ESM trong thư mục `scripts`.
  //
  // Cần cho `tests/theme/tokens.test.ts`: nó dùng LẠI `measureFontFamily` — hàm
  // đo font thật — thay vì chép cứng con số ngưỡng vào test. Chép cứng thì đổi
  // font là test vẫn xanh trong khi luật đã sai.
  //
  // ⛔ Phải TRẢI `expoPreset.transform` vào: khai `transform` trong config sẽ
  // GHI ĐÈ (không gộp) transform của preset, mà preset là nơi lo việc biên dịch
  // toàn bộ TypeScript/JSX và mock tài nguyên ảnh/font. Mất nó thì mọi test chết.
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'mjs', 'json', 'node'],
  transform: {
    ...expoPreset.transform,
    '^.+\\.mjs$': 'babel-jest',
  },

  testMatch: ['<rootDir>/tests/**/*.test.{ts,tsx}', '<rootDir>/src/**/*.test.{ts,tsx}'],

  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.generated.ts',
    '!src/**/index.ts',
    '!src/**/*.d.ts',
  ],
};
