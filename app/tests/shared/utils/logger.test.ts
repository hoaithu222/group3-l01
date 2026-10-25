import { addLogSink, logger } from '@/shared/utils/logger';

/**
 * `logger` là cửa DUY NHẤT tới `console` (ESLint `no-console`). Ba điều phải giữ:
 *  · `warn`/`error` LUÔN ra console (kể cả bản phát hành — dấu vết duy nhất khi người dùng báo lỗi);
 *  · `debug`/`info` chỉ ở dev;
 *  · tham số được chuyển NGUYÊN VĂN (nhiều test khác so khớp đúng chuỗi/đối tượng đó).
 */

function setDev(value: boolean) {
  (globalThis as unknown as { __DEV__: boolean }).__DEV__ = value;
}

let originalDev: boolean;
const spies = {
  debug: jest.spyOn(console, 'debug'),
  error: jest.spyOn(console, 'error'),
  info: jest.spyOn(console, 'info'),
  warn: jest.spyOn(console, 'warn'),
};

beforeEach(() => {
  originalDev = __DEV__;
  Object.values(spies).forEach((spy) => spy.mockImplementation(() => undefined));
});

afterEach(() => {
  setDev(originalDev);
  Object.values(spies).forEach((spy) => spy.mockClear());
});

describe('logger — mức log', () => {
  it('dev: cả bốn mức ra console, tham số chuyển nguyên văn', () => {
    setDev(true);
    const error = new Error('hỏng');

    logger.debug('d', 1);
    logger.info('i', { a: 1 });
    logger.warn('w', 'x', 'y');
    logger.error('e', error);

    expect(spies.debug).toHaveBeenCalledWith('d', 1);
    expect(spies.info).toHaveBeenCalledWith('i', { a: 1 });
    expect(spies.warn).toHaveBeenCalledWith('w', 'x', 'y');
    expect(spies.error).toHaveBeenCalledWith('e', error);
  });

  it('bản phát hành: debug/info im lặng, warn/error VẪN ra console', () => {
    setDev(false);

    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(spies.debug).not.toHaveBeenCalled();
    expect(spies.info).not.toHaveBeenCalled();
    expect(spies.warn).toHaveBeenCalledWith('w');
    expect(spies.error).toHaveBeenCalledWith('e');
  });
});

describe('logger — ống xả (addLogSink)', () => {
  it('nhận mọi dòng đã phát, kèm mức và tham số; huỷ đăng ký thì thôi nhận', () => {
    setDev(false);
    const sink = jest.fn();
    const remove = addLogSink(sink);

    logger.info('bị bỏ (bản phát hành)');
    logger.warn('cảnh báo', 42);
    remove();
    logger.error('sau khi huỷ');

    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith('warn', 'cảnh báo', [42]);
  });

  it('ống xả ném lỗi KHÔNG làm hỏng dòng log lẫn mã đang gọi', () => {
    setDev(true);
    const remove = addLogSink(() => {
      throw new Error('Sentry chưa khởi tạo');
    });

    expect(() => logger.error('vẫn phải ra', 1)).not.toThrow();
    expect(spies.error).toHaveBeenCalledWith('vẫn phải ra', 1);
    remove();
  });
});
