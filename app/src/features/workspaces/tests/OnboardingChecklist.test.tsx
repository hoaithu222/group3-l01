import { fireEvent, render, screen } from '@testing-library/react-native';

import { OnboardingChecklist } from '../components/OnboardingChecklist';
import { buildOnboardingSteps } from '../utils/onboarding.utils';

describe('OnboardingChecklist', () => {
  it('hiện tiến độ và trạng thái từng bước bằng CHỮ, không chỉ bằng dấu tick', async () => {
    await render(
      <OnboardingChecklist steps={buildOnboardingSteps(['channel'], 3)} onDismiss={jest.fn()} onStepPress={jest.fn()} />,
    );

    expect(screen.getByRole('header', { name: 'Bắt đầu với nhóm mới' })).toBeOnTheScreen();
    expect(screen.getByText('Còn 1 việc để nhóm sẵn sàng')).toBeOnTheScreen();
    expect(screen.getByLabelText('Mời thành viên. Đã xong')).toBeOnTheScreen();
    expect(screen.getByLabelText('Xem các kênh. Đã xong')).toBeOnTheScreen();
    expect(screen.getByLabelText('Gửi tin đầu tiên. Chưa xong')).toBeOnTheScreen();
  });

  it('vòng tiến độ đọc được bằng chữ: "2/3" giữa vòng + nhãn và giá trị phần trăm cho trình đọc màn hình', async () => {
    await render(
      <OnboardingChecklist steps={buildOnboardingSteps(['channel'], 3)} onDismiss={jest.fn()} onStepPress={jest.fn()} />,
    );

    const ring = screen.getByRole('progressbar');
    expect(ring).toHaveAccessibleName('Tiến độ bắt đầu nhóm mới: đã xong 2 trên 3 việc');
    expect(ring.props.accessibilityValue).toEqual({ max: 100, min: 0, now: 67 });
    expect(screen.getByText('2/3')).toBeOnTheScreen();
  });

  it('mỗi bước là NÚT mở màn làm việc đó (không phải hộp kiểm) — bấm ⇒ gọi onStepPress đúng id', async () => {
    const onStepPress = jest.fn();
    await render(
      <OnboardingChecklist steps={buildOnboardingSteps([], 1)} onDismiss={jest.fn()} onStepPress={onStepPress} />,
    );

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    await fireEvent.press(screen.getByRole('button', { name: 'Mời thành viên. Chưa xong' }));
    expect(onStepPress).toHaveBeenCalledWith('invite');
  });

  it('"Để sau" ⇒ gọi onDismiss đúng một lần', async () => {
    const onDismiss = jest.fn();
    await render(
      <OnboardingChecklist steps={buildOnboardingSteps([], 1)} onDismiss={onDismiss} onStepPress={jest.fn()} />,
    );

    await fireEvent.press(screen.getByText('Để sau'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('thu gọn ⇒ chỉ còn đầu thẻ (tiến độ vẫn hiện, các bước và "Để sau" ẩn); mở lại ⇒ các bước quay về', async () => {
    await render(
      <OnboardingChecklist steps={buildOnboardingSteps([], 1)} onDismiss={jest.fn()} onStepPress={jest.fn()} />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Thu gọn danh sách việc' }));

    expect(screen.getByText('0/3')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Mời thành viên. Chưa xong')).toBeNull();
    expect(screen.queryByText('Để sau')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Mở danh sách việc' }));

    expect(screen.getByLabelText('Mời thành viên. Chưa xong')).toBeOnTheScreen();
    expect(screen.getByText('Để sau')).toBeOnTheScreen();
  });
});
