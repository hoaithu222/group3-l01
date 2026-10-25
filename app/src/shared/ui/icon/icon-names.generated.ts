/** Sinh tự động từ assets/icons/**. ⛔ ĐỪNG SỬA TAY. */
/* eslint-disable */
// prettier-ignore

/**
 * Tên icon dùng được cho `<Icon name="…" />`.
 *
 * Ba nhóm phân biệt bằng TIỀN TỐ, để tên không đụng nhau và nhìn là biết loại:
 *   `home`            — icon giao diện (nhóm system)
 *   `fn/ve-may-bay`   — icon dịch vụ
 *   `bank/bidv`       — logo ngân hàng
 */
export type IconName =
  | "add"
  | "add-circle"
  | "add-image"
  | "add-square"
  | "add-team"
  | "alert-help"
  | "alert-information"
  | "alert-warning"
  | "alert-warning-circle"
  | "analytics-02"
  | "apple"
  | "apple-2"
  | "arrow-data-transfer-vertical"
  | "arrow-data-transfer-vertical-applied"
  | "arrow-down"
  | "arrow-down-2"
  | "arrow-down-small"
  | "arrow-left"
  | "arrow-left-2"
  | "arrow-left-small"
  | "arrow-right"
  | "arrow-right-2"
  | "arrow-right-small"
  | "arrow-up"
  | "arrow-up-2"
  | "arrow-up-small"
  | "atm"
  | "audio"
  | "bank"
  | "basket-01"
  | "bill"
  | "book"
  | "bus"
  | "calendar"
  | "calendar-favorite"
  | "cancel"
  | "cancel-2"
  | "cap-nhat-tt-nha-dtu"
  | "cccd"
  | "chart-1"
  | "chat-bubble"
  | "checkmark-circle"
  | "checkmark-square"
  | "chi-nhanh"
  | "chia-hoa-don"
  | "circle-arrow-down-01"
  | "circle-arrow-left-01"
  | "circle-arrow-right-01"
  | "circle-arrow-up"
  | "clear-circle"
  | "clear-rectangle"
  | "clock"
  | "close-acc"
  | "contact-list"
  | "copy"
  | "copy-qr"
  | "dat-mua-trai-phieu"
  | "delete"
  | "dich-vu-the"
  | "direct"
  | "discount"
  | "discount-2"
  | "document"
  | "document-2"
  | "dong-mo-cif"
  | "dong-tai-khoan-con"
  | "edit"
  | "email"
  | "email-recieve"
  | "faceid"
  | "favorite"
  | "file-2"
  | "filter"
  | "flash"
  | "flash-off"
  | "gui-gop-y"
  | "hide"
  | "history"
  | "home"
  | "image"
  | "keyboard"
  | "khoa-tai-khoan-con"
  | "language-skill"
  | "lap"
  | "lich-su-gd"
  | "lich-su-giao-dich-qr"
  | "link"
  | "location"
  | "location-2"
  | "lock"
  | "login"
  | "logout"
  | "loyalty"
  | "lsu-mua-trai-phieu"
  | "magic-wand-01"
  | "mic-01"
  | "minus"
  | "mo-khoa-tk-con"
  | "money"
  | "more"
  | "more2"
  | "navigation-map"
  | "nhan-thong-bao-sms"
  | "noti"
  | "noti-new"
  | "noti-new-2"
  | "noti-off"
  | "notification"
  | "pause"
  | "phone"
  | "phone-2"
  | "play"
  | "popcorn"
  | "qlchia-se-bdsd"
  | "qltccn"
  | "qr"
  | "quen-smartotp"
  | "reload"
  | "save-image"
  | "search"
  | "service"
  | "setting"
  | "setting2"
  | "share"
  | "share-02"
  | "shield-user"
  | "smart-watch-04"
  | "smartotp"
  | "star"
  | "store"
  | "store-location"
  | "suggest-keyboard"
  | "support"
  | "support-bar"
  | "tao-tra-soat"
  | "thong-tin-con"
  | "tick-double-01"
  | "ticket"
  | "timer"
  | "touchid"
  | "unlink"
  | "update-info-con"
  | "upload"
  | "user"
  | "user-add"
  | "user-circle"
  | "user-edit"
  | "user-setting-1"
  | "user-setting-2"
  | "vibrate-mode"
  | "video-camera"
  | "view"
  | "wallet-add"
  | "wrench-01"
  | "xac-thuc"
  | "fn/bao-hiem"
  | "fn/bao-hiem-xa-hoi-cho-ca-nhan"
  | "fn/bao-hiem-xa-hoi-cho-doanh-nghiep"
  | "fn/bh-an-ninh-mang"
  | "fn/bh-bic"
  | "fn/bh-du-lich"
  | "fn/bh-melife"
  | "fn/bh-nha"
  | "fn/bh-oto"
  | "fn/bh-suc-khoe"
  | "fn/bh-tai-nan"
  | "fn/bh-tai-nan-mo-rong"
  | "fn/bh-tin-tuc-uu-dai"
  | "fn/bh-ung-thu"
  | "fn/bh-xe-may"
  | "fn/bic-smart-care"
  | "fn/boi-thuong-bh-bic"
  | "fn/chung-chi-quy-mo"
  | "fn/co-phieu"
  | "fn/dat-hoa"
  | "fn/dat-phong-ks"
  | "fn/data4g"
  | "fn/dealthtoday"
  | "fn/dich-vu-logistic"
  | "fn/giao-hang"
  | "fn/mua-bh-bic"
  | "fn/mua-bh-metlife"
  | "fn/mua-sam"
  | "fn/mua-sam-hoan-tien"
  | "fn/thanh-toan-phi-bh"
  | "fn/the-dien-thoai-imedia"
  | "fn/the-game"
  | "fn/trai-phieu"
  | "fn/uu-dai-cua-toi"
  | "fn/ve-may-bay"
  | "fn/ve-su-kien"
  | "fn/ve-tau"
  | "fn/ve-xe-re"
  | "fn/ve-xem-phim"
  | "fn/vietlott-sms"
  | "fn/vnpay-taxi"
  | "fn/vnshop"
  | "fn/voucher"
  | "fn/voucher-nghi-duong"
  | "bank/abbank"
  | "bank/acb"
  | "bank/agribank"
  | "bank/american-express"
  | "bank/anz"
  | "bank/bac-a"
  | "bank/bangkok"
  | "bank/bankcomm"
  | "bank/bao-viet"
  | "bank/baovietbank"
  | "bank/bidchcm"
  | "bank/bidv"
  | "bank/bnp"
  | "bank/bot"
  | "bank/busan"
  | "bank/cake"
  | "bank/cathay-united-bank"
  | "bank/cbbank"
  | "bank/china"
  | "bank/cimb-bank"
  | "bank/citibank"
  | "bank/cmb"
  | "bank/coopbank"
  | "bank/ctbc"
  | "bank/dbs"
  | "bank/deutsche"
  | "bank/discover-network"
  | "bank/dongabank"
  | "bank/epass"
  | "bank/esunbank"
  | "bank/eximbank"
  | "bank/fccom"
  | "bank/fena"
  | "bank/fenb"
  | "bank/firstbank"
  | "bank/gpbank"
  | "bank/hanabank"
  | "bank/hdb"
  | "bank/hongleongbank"
  | "bank/hsbc"
  | "bank/ibk"
  | "bank/icbc"
  | "bank/ivb"
  | "bank/jcb"
  | "bank/kbank"
  | "bank/kienlongbank"
  | "bank/kmb"
  | "bank/lienvietpostbank"
  | "bank/master-card"
  | "bank/maybank"
  | "bank/mb"
  | "bank/mhb"
  | "bank/mizuho"
  | "bank/mkb"
  | "bank/msb"
  | "bank/namabank"
  | "bank/napas"
  | "bank/napas-2"
  | "bank/napas-248"
  | "bank/napas-color-horizontal"
  | "bank/napas-horizontal"
  | "bank/natixis"
  | "bank/ncb"
  | "bank/ngan-hang-chinh-sac"
  | "bank/nonghyup"
  | "bank/ocb"
  | "bank/oceanbank"
  | "bank/oversea"
  | "bank/pgbank"
  | "bank/publicbank"
  | "bank/pvcombank"
  | "bank/sacombank"
  | "bank/saigonbank"
  | "bank/sbv"
  | "bank/scb"
  | "bank/scsb"
  | "bank/seabank"
  | "bank/shb"
  | "bank/shinhanbank"
  | "bank/sspay"
  | "bank/standard-chartered"
  | "bank/sumitomo"
  | "bank/t-money"
  | "bank/taipeifubon"
  | "bank/techcombank"
  | "bank/tpbank"
  | "bank/ubank"
  | "bank/umee"
  | "bank/unionpay"
  | "bank/uob-bank"
  | "bank/vdb"
  | "bank/vib"
  | "bank/vietabank"
  | "bank/vietbank"
  | "bank/vietcapitalbank"
  | "bank/vietcombank"
  | "bank/vietin"
  | "bank/vietqr"
  | "bank/vietqr-color-horizontal"
  | "bank/vietqr-horizontal"
  | "bank/visa"
  | "bank/vnpay-color-horizontal"
  | "bank/vnpayqr"
  | "bank/vnpayqr-horizontal"
  | "bank/vpbank"
  | "bank/vrb"
  | "bank/woori-bank";

export const ICON_NAMES = [
  "add",
  "add-circle",
  "add-image",
  "add-square",
  "add-team",
  "alert-help",
  "alert-information",
  "alert-warning",
  "alert-warning-circle",
  "analytics-02",
  "apple",
  "apple-2",
  "arrow-data-transfer-vertical",
  "arrow-data-transfer-vertical-applied",
  "arrow-down",
  "arrow-down-2",
  "arrow-down-small",
  "arrow-left",
  "arrow-left-2",
  "arrow-left-small",
  "arrow-right",
  "arrow-right-2",
  "arrow-right-small",
  "arrow-up",
  "arrow-up-2",
  "arrow-up-small",
  "atm",
  "audio",
  "bank",
  "basket-01",
  "bill",
  "book",
  "bus",
  "calendar",
  "calendar-favorite",
  "cancel",
  "cancel-2",
  "cap-nhat-tt-nha-dtu",
  "cccd",
  "chart-1",
  "chat-bubble",
  "checkmark-circle",
  "checkmark-square",
  "chi-nhanh",
  "chia-hoa-don",
  "circle-arrow-down-01",
  "circle-arrow-left-01",
  "circle-arrow-right-01",
  "circle-arrow-up",
  "clear-circle",
  "clear-rectangle",
  "clock",
  "close-acc",
  "contact-list",
  "copy",
  "copy-qr",
  "dat-mua-trai-phieu",
  "delete",
  "dich-vu-the",
  "direct",
  "discount",
  "discount-2",
  "document",
  "document-2",
  "dong-mo-cif",
  "dong-tai-khoan-con",
  "edit",
  "email",
  "email-recieve",
  "faceid",
  "favorite",
  "file-2",
  "filter",
  "flash",
  "flash-off",
  "gui-gop-y",
  "hide",
  "history",
  "home",
  "image",
  "keyboard",
  "khoa-tai-khoan-con",
  "language-skill",
  "lap",
  "lich-su-gd",
  "lich-su-giao-dich-qr",
  "link",
  "location",
  "location-2",
  "lock",
  "login",
  "logout",
  "loyalty",
  "lsu-mua-trai-phieu",
  "magic-wand-01",
  "mic-01",
  "minus",
  "mo-khoa-tk-con",
  "money",
  "more",
  "more2",
  "navigation-map",
  "nhan-thong-bao-sms",
  "noti",
  "noti-new",
  "noti-new-2",
  "noti-off",
  "notification",
  "pause",
  "phone",
  "phone-2",
  "play",
  "popcorn",
  "qlchia-se-bdsd",
  "qltccn",
  "qr",
  "quen-smartotp",
  "reload",
  "save-image",
  "search",
  "service",
  "setting",
  "setting2",
  "share",
  "share-02",
  "shield-user",
  "smart-watch-04",
  "smartotp",
  "star",
  "store",
  "store-location",
  "suggest-keyboard",
  "support",
  "support-bar",
  "tao-tra-soat",
  "thong-tin-con",
  "tick-double-01",
  "ticket",
  "timer",
  "touchid",
  "unlink",
  "update-info-con",
  "upload",
  "user",
  "user-add",
  "user-circle",
  "user-edit",
  "user-setting-1",
  "user-setting-2",
  "vibrate-mode",
  "video-camera",
  "view",
  "wallet-add",
  "wrench-01",
  "xac-thuc",
  "fn/bao-hiem",
  "fn/bao-hiem-xa-hoi-cho-ca-nhan",
  "fn/bao-hiem-xa-hoi-cho-doanh-nghiep",
  "fn/bh-an-ninh-mang",
  "fn/bh-bic",
  "fn/bh-du-lich",
  "fn/bh-melife",
  "fn/bh-nha",
  "fn/bh-oto",
  "fn/bh-suc-khoe",
  "fn/bh-tai-nan",
  "fn/bh-tai-nan-mo-rong",
  "fn/bh-tin-tuc-uu-dai",
  "fn/bh-ung-thu",
  "fn/bh-xe-may",
  "fn/bic-smart-care",
  "fn/boi-thuong-bh-bic",
  "fn/chung-chi-quy-mo",
  "fn/co-phieu",
  "fn/dat-hoa",
  "fn/dat-phong-ks",
  "fn/data4g",
  "fn/dealthtoday",
  "fn/dich-vu-logistic",
  "fn/giao-hang",
  "fn/mua-bh-bic",
  "fn/mua-bh-metlife",
  "fn/mua-sam",
  "fn/mua-sam-hoan-tien",
  "fn/thanh-toan-phi-bh",
  "fn/the-dien-thoai-imedia",
  "fn/the-game",
  "fn/trai-phieu",
  "fn/uu-dai-cua-toi",
  "fn/ve-may-bay",
  "fn/ve-su-kien",
  "fn/ve-tau",
  "fn/ve-xe-re",
  "fn/ve-xem-phim",
  "fn/vietlott-sms",
  "fn/vnpay-taxi",
  "fn/vnshop",
  "fn/voucher",
  "fn/voucher-nghi-duong",
  "bank/abbank",
  "bank/acb",
  "bank/agribank",
  "bank/american-express",
  "bank/anz",
  "bank/bac-a",
  "bank/bangkok",
  "bank/bankcomm",
  "bank/bao-viet",
  "bank/baovietbank",
  "bank/bidchcm",
  "bank/bidv",
  "bank/bnp",
  "bank/bot",
  "bank/busan",
  "bank/cake",
  "bank/cathay-united-bank",
  "bank/cbbank",
  "bank/china",
  "bank/cimb-bank",
  "bank/citibank",
  "bank/cmb",
  "bank/coopbank",
  "bank/ctbc",
  "bank/dbs",
  "bank/deutsche",
  "bank/discover-network",
  "bank/dongabank",
  "bank/epass",
  "bank/esunbank",
  "bank/eximbank",
  "bank/fccom",
  "bank/fena",
  "bank/fenb",
  "bank/firstbank",
  "bank/gpbank",
  "bank/hanabank",
  "bank/hdb",
  "bank/hongleongbank",
  "bank/hsbc",
  "bank/ibk",
  "bank/icbc",
  "bank/ivb",
  "bank/jcb",
  "bank/kbank",
  "bank/kienlongbank",
  "bank/kmb",
  "bank/lienvietpostbank",
  "bank/master-card",
  "bank/maybank",
  "bank/mb",
  "bank/mhb",
  "bank/mizuho",
  "bank/mkb",
  "bank/msb",
  "bank/namabank",
  "bank/napas",
  "bank/napas-2",
  "bank/napas-248",
  "bank/napas-color-horizontal",
  "bank/napas-horizontal",
  "bank/natixis",
  "bank/ncb",
  "bank/ngan-hang-chinh-sac",
  "bank/nonghyup",
  "bank/ocb",
  "bank/oceanbank",
  "bank/oversea",
  "bank/pgbank",
  "bank/publicbank",
  "bank/pvcombank",
  "bank/sacombank",
  "bank/saigonbank",
  "bank/sbv",
  "bank/scb",
  "bank/scsb",
  "bank/seabank",
  "bank/shb",
  "bank/shinhanbank",
  "bank/sspay",
  "bank/standard-chartered",
  "bank/sumitomo",
  "bank/t-money",
  "bank/taipeifubon",
  "bank/techcombank",
  "bank/tpbank",
  "bank/ubank",
  "bank/umee",
  "bank/unionpay",
  "bank/uob-bank",
  "bank/vdb",
  "bank/vib",
  "bank/vietabank",
  "bank/vietbank",
  "bank/vietcapitalbank",
  "bank/vietcombank",
  "bank/vietin",
  "bank/vietqr",
  "bank/vietqr-color-horizontal",
  "bank/vietqr-horizontal",
  "bank/visa",
  "bank/vnpay-color-horizontal",
  "bank/vnpayqr",
  "bank/vnpayqr-horizontal",
  "bank/vpbank",
  "bank/vrb",
  "bank/woori-bank",
] as const satisfies readonly IconName[];
