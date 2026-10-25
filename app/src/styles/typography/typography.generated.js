/* Sinh tự động từ typography.json. ⛔ ĐỪNG SỬA TAY. */
/* eslint-disable */
// prettier-ignore
module.exports = {
  /** Tên họ font — phải khớp ĐÚNG chuỗi khai trong app.config.ts. */
  family: 'Plus Jakarta Sans',
  /** theme.fontSize cho Tailwind — class `text-<vai trò>`. */
  fontSize: {
    'display': ['36px', { lineHeight: '47px' }],
    'header-lg': ['28px', { lineHeight: '37px' }],
    'header-md': ['24px', { lineHeight: '32px' }],
    'header-sm': ['18px', { lineHeight: '24px' }],
    'body-lg': ['16px', { lineHeight: '24px' }],
    'body-md': ['14px', { lineHeight: '20px' }],
    'label-lg': ['16px', { lineHeight: '24px' }],
    'label-md': ['14px', { lineHeight: '20px' }],
    'label-sm': ['12px', { lineHeight: '16px' }],
    'label-xs': ['10px', { lineHeight: '16px' }],
    'caption-lg': ['13px', { lineHeight: '17px' }],
    'caption-sm': ['12px', { lineHeight: '16px' }],
    'link-lg': ['16px', { lineHeight: '21px' }],
    'link-md': ['14px', { lineHeight: '20px' }],
    'overline': ['12px', { lineHeight: '18px', letterSpacing: '0.6px' }],
  },
  /** theme.fontWeight — class `font-<tên>`. */
  fontWeight: {
    'regular': '400',
    'medium': '500',
    'semibold': '600',
    'bold': '700',
  },
};
