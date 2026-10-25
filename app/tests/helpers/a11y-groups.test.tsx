import { render } from '@testing-library/react-native';
import { Pressable, Text, View } from 'react-native';

import { accessibleGroupsHidingButtons } from './a11y-groups';

/**
 * Tự kiểm helper: nếu nó ngừng bắt được ca nút nằm trong ô `accessible`, các test trợ năng dùng nó sẽ xanh giả — đúng
 * kiểu hỏng âm thầm mà helper sinh ra để chặn.
 */
describe('accessibleGroupsHidingButtons', () => {
  it('bắt nút nằm BÊN TRONG một View `accessible`', async () => {
    const view = await render(
      <View accessibilityLabel="Hàng tệp" accessible>
        <Text>bao-cao.pdf</Text>
        <Pressable accessibilityRole="button" onPress={jest.fn()}>
          <Text>Huỷ</Text>
        </Pressable>
      </View>,
    );

    expect(accessibleGroupsHidingButtons(view.toJSON())).toEqual(['Hàng tệp']);
  });

  it('xanh khi nhãn nằm ở khối chữ còn nút là ô rời', async () => {
    const view = await render(
      <View>
        <View accessibilityLabel="bao-cao.pdf" accessible>
          <Text>bao-cao.pdf</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={jest.fn()}>
          <Text>Huỷ</Text>
        </Pressable>
      </View>,
    );

    expect(accessibleGroupsHidingButtons(view.toJSON())).toEqual([]);
  });
});
