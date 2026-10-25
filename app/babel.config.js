/**
 * Babel — chỉ có đúng phần NativeWind cần. Mọi thứ khác để `babel-preset-expo` lo.
 *
 * `jsxImportSource: 'nativewind'` là thứ khiến prop `className` chạy được: nó
 * đổi hàm dựng JSX sang bản của NativeWind, bản này đọc `className` rồi biến
 * thành `style` của React Native.
 *
 * ⛔ ĐỪNG thêm `react-native-worklets/plugin` (hay `react-native-reanimated/plugin`)
 * vào đây. Từ SDK 54, `babel-preset-expo` TỰ nạp plugin worklets khi thấy gói đã
 * cài (xem `babel-preset-expo/build/configs/expo.js`). Khai thêm lần nữa là
 * plugin chạy hai lượt trên cùng một worklet — animation lỗi kiểu rất khó lần.
 *
 * ⛔ Cũng KHÔNG cần `babel-plugin-module-resolver` cho alias `@/`:
 * `experiments.tsconfigPaths` của Expo mặc định BẬT, Metro đọc thẳng
 * `compilerOptions.paths` trong `tsconfig.json`. Khai thêm một bảng alias thứ
 * hai chỉ tạo cơ hội cho hai bảng lệch nhau.
 */
module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
