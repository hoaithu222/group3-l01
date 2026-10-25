import { activityIconFor, activityToneFor } from '../utils/activity-icon';

/**
 * Tông màu ô icon của mục Hoạt động theo HỌ sự kiện: cùng bảng tiền tố với `activityIconFor` — thêm tiền tố ở một bên
 * mà quên bên kia thì icon và màu lệch họ (vd icon chat nhưng màu ví). Test khoá sự đồng bộ đó.
 */
describe('activityToneFor', () => {
  it.each([
    ['message.mention', 'info'],
    ['channel.private-added', 'info'],
    ['workspace.member-added', 'brand'],
    ['workspace.admin-change', 'brand'],
    ['task.assigned', 'success'],
    ['meeting.reminder', 'info'],
    ['wallet.settled', 'success'],
    ['moderation.report', 'danger'],
    ['announcement.new', 'accent'],
  ])('%s ⇒ %s', (type, tone) => {
    expect(activityToneFor(type)).toBe(tone);
  });

  it('loại lạ rơi về `brand` (cùng chỗ với icon chuông mặc định)', () => {
    expect(activityToneFor('something.unknown')).toBe('brand');
    expect(activityIconFor('something.unknown')).toBe('notification');
  });

  it('`danger` chỉ dành cho kiểm duyệt — sự kiện thường không tô đỏ', () => {
    for (const type of [
      'message.new',
      'task.assigned',
      'call.missed',
      'study.due',
      'wallet.debt',
    ]) {
      expect(activityToneFor(type)).not.toBe('danger');
    }
  });
});
