import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { SetForm, type SetFormProps } from '../components/SetForm';
import { FALLBACK_STUDY_LIMITS, type StudyLimits } from '../constants/study.constants';
import { renderWithProviders } from './render-helpers';

/**
 * Form bộ học chia phần: Thông tin (bộ đếm ký tự) · Phạm vi (ba thẻ chọn) · Thẻ #tag (hiện ngay thẻ đã hiểu) · Ảnh bìa — và khoá gửi
 * khi ngoại tuyến. Ảnh bìa có test riêng (`SetForm.cover.test.tsx`).
 */
jest.mock('@/core/media/pick-media', () => ({ pickAudio: jest.fn(), pickImages: jest.fn() }));
jest.mock('@/core/media/compress-image', () => ({ compressImage: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({ getInfoAsync: jest.fn() }));
jest.mock('@/core/uploads/upload.runner', () => ({
  cancelUpload: jest.fn(),
  retryUpload: jest.fn(),
}));
jest.mock('expo-audio', () => ({ ...jest.requireActual('../../../../__mocks__/expo-audio') }));

const LIMITS: StudyLimits = { ...FALLBACK_STUDY_LIMITS };

function props(overrides: Partial<SetFormProps> = {}): SetFormProps {
  return {
    canUseWorkspace: false,
    coverScopeId: 'cover-1',
    initial: { description: '', tags: [], title: '', visibility: 'PRIVATE' },
    initialCoverAssetId: null,
    limits: LIMITS,
    onSubmit: jest.fn(),
    submitLabel: 'Tạo bộ học',
    submitting: false,
    ...overrides,
  };
}

describe('bộ đếm ký tự và lỗi tại ô', () => {
  it('đếm tiêu đề/mô tả theo từng phím gõ, theo giới hạn từ `limits`', async () => {
    await renderWithProviders(<SetForm {...props()} />);
    expect(screen.getByText(`0/${LIMITS.setTitleMax}`)).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText(/Tiêu đề/), 'Từ vựng');
    await fireEvent.changeText(screen.getByLabelText('Mô tả'), 'Cho người mới');

    expect(screen.getByText(`7/${LIMITS.setTitleMax}`)).toBeOnTheScreen();
    expect(screen.getByText(`13/${LIMITS.setDescriptionMax}`)).toBeOnTheScreen();
  });

  it('tiêu đề trống + bấm gửi ⇒ lỗi hiện NGAY dưới ô, không gọi onSubmit', async () => {
    const onSubmit = jest.fn();
    await renderWithProviders(<SetForm {...props({ onSubmit })} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Tạo bộ học' }));

    expect(await screen.findByText('Nhập tiêu đề bộ học')).toBeOnTheScreen();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('thẻ #tag', () => {
  it('hiện các thẻ đã hiểu (bỏ trùng/trống) và bộ đếm; onSubmit nhận đúng danh sách đó', async () => {
    const onSubmit = jest.fn();
    await renderWithProviders(<SetForm {...props({ onSubmit })} />);

    await fireEvent.changeText(screen.getByLabelText(/Tiêu đề/), 'Bộ A');
    await fireEvent.changeText(screen.getByLabelText(/^Thẻ/), 'toán, Toán ,, lớp 9');

    expect(screen.getByText('#toán')).toBeOnTheScreen();
    expect(screen.getByText('#lớp 9')).toBeOnTheScreen();
    expect(screen.getByText(`2/${LIMITS.tagsMax}`)).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Tạo bộ học' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0].tags).toEqual(['toán', 'lớp 9']);
  });

  it('nhiều hơn số thẻ tối đa ⇒ nói rõ chỉ giữ N thẻ đầu (không cắt lặng lẽ)', async () => {
    await renderWithProviders(<SetForm {...props({ limits: { ...LIMITS, tagsMax: 2 } })} />);

    await fireEvent.changeText(screen.getByLabelText(/^Thẻ/), 'a, b, c, d');

    expect(screen.getByText('Chỉ giữ 2 thẻ đầu tiên.')).toBeOnTheScreen();
    expect(screen.queryByText('#c')).toBeNull();
    expect(screen.getByText('2/2')).toBeOnTheScreen();
  });
});

describe('phạm vi và ngoại tuyến', () => {
  it('chọn phạm vi bằng thẻ: Riêng tư là mặc định, "Trong nhóm" bị khoá kèm lý do khi không mở từ nhóm', async () => {
    await renderWithProviders(<SetForm {...props()} />);

    expect(screen.getByRole('radio', { name: /^Riêng tư\./ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^Trong nhóm\./ })).toBeDisabled();
    expect(screen.getByText('Mở từ mục "Học" của nhóm để tạo bộ cho nhóm.')).toBeOnTheScreen();
  });

  it('ngoại tuyến ⇒ khoá nút gửi và nói rõ vì sao', async () => {
    await renderWithProviders(<SetForm {...props({ offline: true })} />);

    expect(screen.getByRole('button', { name: 'Tạo bộ học' })).toBeDisabled();
    expect(screen.getByText(/Đang ngoại tuyến/)).toBeOnTheScreen();
  });
});
