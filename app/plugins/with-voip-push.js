const { withAppDelegate, CodeGenerator } = require('expo/config-plugins');
const { mergeContents } = CodeGenerator;

/**
 * Plugin nội bộ (p2-02 app.md §6.1/§6.3) — nối `react-native-voip-push-notification` (PushKit) với
 * `react-native-callkeep` (CallKit) ở NATIVE, vì Apple bắt buộc `reportNewIncomingCall` phải chạy ĐỒNG BỘ trong
 * `didReceiveIncomingPushWithPayload`, và đăng ký `PKPushRegistry` càng sớm càng tốt (ngay lúc khởi động app,
 * KHÔNG đợi JS bridge lên — JS lên chậm hơn native vài trăm ms, đủ để lỡ push VoIP đến khi app đang bị kill).
 * `AppDelegate` phải TỰ implement `PKPushRegistryDelegate`: thư viện gán `RCTSharedApplication().delegate` (chính là
 * `AppDelegate`) làm delegate của `PKPushRegistry` (xem `RNVoipPushNotificationManager.m` hàm `voipRegistration`).
 *
 * `@config-plugins/react-native-callkeep` (đã thêm ở `app.config.ts`) tự lo phần CallKit/ConnectionService (Podfile,
 * `Info.plist` `UIBackgroundModes: voip`, permission Android) — KHÔNG đụng AppDelegate. Plugin này bù đúng phần còn
 * thiếu: PushKit.
 *
 * ⚠️ CHƯA BUILD/CHẠY THẬT được — máy Windows không `expo prebuild --platform ios` (Expo tự chặn, chỉ chạy được trên
 * macOS/Linux; đã thử và xác nhận lỗi này lúc viết plugin). Việc ĐẦU TIÊN cần làm khi có máy macOS/EAS Build: chạy
 * `npx expo prebuild --platform ios`, mở AppDelegate.swift (hoặc .mm) trong thư mục ios sinh ra, xem khối
 * `@generated begin call-native-voip` có chèn đúng chỗ không, rồi build thử.
 *
 * Hai bẫy đã gặp lúc viết (đã sửa, ghi lại để không lặp):
 *  1. `mergeContents` của Expo so khớp anchor TỪNG DÒNG MỘT (`addLines` tách `src.split('\n')` rồi test regex trên
 *     mỗi dòng) — anchor NHIỀU DÒNG (vd bám theo cả chữ ký hàm `didFinishLaunchingWithOptions` lẫn `-> Bool {` của
 *     Swift, hai thứ thường xuống hai dòng khác nhau) luôn báo "Failed to match" dù khớp khi test rời từng đoạn.
 *     `insertAfterOpenBrace()` dưới đây TỰ viết bằng `[\s\S]*?` (không qua `mergeContents`) để né hẳn giới hạn này.
 *  2. Import và code dùng import đó KHÔNG được tách hai lời gọi `mergeContents` cùng neo vào một anchor: lời gọi
 *     chạy SAU chèn ĐÈ LÊN TRÊN lời gọi chạy trước (cùng offset) — từng làm khối `extension`/category dùng
 *     `PKPushRegistry` nằm phía TRÊN dòng `import PushKit`/`#import <PushKit/PushKit.h>`, không biên dịch được. Gộp
 *     import + extension/category vào MỘT `newSrc` của MỘT lời gọi `mergeContents` duy nhất.
 */
const withVoipPush = (config) => {
  return withAppDelegate(config, (mod) => {
    const language = mod.modResults.language;
    mod.modResults.contents =
      language === 'swift' ? patchSwift(mod.modResults.contents) : patchObjc(mod.modResults.contents);
    return mod;
  });
};

/**
 * Chèn `line` ngay sau dấu `{` mở đầu tiên xuất hiện SAU khi khớp `signaturePattern` (chấp nhận chữ ký hàm và dấu
 * `{` nằm khác dòng nhau — xem bẫy #1 ở chú thích đầu file). Bỏ qua nếu `marker` đã có sẵn (idempotent qua nhiều lần
 * `expo prebuild`).
 */
function insertAfterOpenBrace(src, signaturePattern, marker, line, indent = '  ') {
  if (src.includes(marker)) return src;
  const withBrace = new RegExp(`(?:${signaturePattern.source})[\\s\\S]*?\\{`, signaturePattern.flags.replace(/[gm]/g, ''));
  const match = withBrace.exec(src);
  if (!match) {
    throw new Error(
      `[with-voip-push] Không tìm thấy "${signaturePattern.source}" trong AppDelegate — xem chú thích đầu plugins/with-voip-push.js để sửa lại anchor cho khớp template thật.`,
    );
  }
  const insertAt = match.index + match[0].length;
  return `${src.slice(0, insertAt)}\n${indent}${line}${src.slice(insertAt)}`;
}

const SWIFT_DELEGATE_BLOCK = [
  'import PushKit',
  '',
  '// `AppDelegate` phải implement `PKPushRegistryDelegate` — `RNVoipPushNotificationManager` gán chính `AppDelegate`',
  '// (qua `RCTSharedApplication().delegate`) làm delegate của `PKPushRegistry`.',
  'extension AppDelegate: PKPushRegistryDelegate {',
  '  public func pushRegistry(_ registry: PKPushRegistry, didUpdate credentials: PKPushCredentials, for type: PKPushType) {',
  '    RNVoipPushNotificationManager.didUpdatePushCredentials(credentials, forType: type.rawValue)',
  '  }',
  '',
  '  public func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {}',
  '',
  '  public func pushRegistry(',
  '    _ registry: PKPushRegistry,',
  '    didReceiveIncomingPushWith payload: PKPushPayload,',
  '    for type: PKPushType,',
  '    completion: @escaping () -> Void',
  '  ) {',
  '    let uuid = (payload.dictionaryPayload["callUuid"] as? String) ?? ""',
  '    let callerName = payload.dictionaryPayload["callerName"] as? String',
  '    let isVideo = (payload.dictionaryPayload["mediaKind"] as? String) == "VIDEO"',
  '    RNVoipPushNotificationManager.addCompletionHandler(uuid, completionHandler: completion)',
  '    RNVoipPushNotificationManager.didReceiveIncomingPush(with: payload, forType: type.rawValue)',
  '    // Apple bắt buộc: báo CallKit NGAY, đồng bộ, kể cả khi payload đến sau khi cuộc gọi đã kết thúc (README p2-02',
  '    // §2 "Push hết hạn khi app mở chậm") — JS tự `reportEndCallWithUUID` ngay khi đối chiếu xong `GET /calls/:id`',
  '    // (xem `native/call-native.bridge.tsx`).',
  '    RNCallKeep.reportNewIncomingCall(',
  '      uuid,',
  '      handle: uuid,',
  '      handleType: "generic",',
  '      hasVideo: isVideo,',
  '      localizedCallerName: (callerName?.isEmpty == false) ? callerName : "Super App",',
  '      supportsHolding: false,',
  '      supportsDTMF: false,',
  '      supportsGrouping: false,',
  '      supportsUngrouping: false,',
  '      fromPushKit: true,',
  '      payload: payload.dictionaryPayload,',
  '      withCompletionHandler: nil',
  '    )',
  '  }',
  '}',
].join('\n');

function patchSwift(src) {
  const merged = mergeContents({
    anchor: /^import /,
    offset: 0,
    comment: '//',
    tag: 'call-native-voip',
    newSrc: SWIFT_DELEGATE_BLOCK,
    src,
  }).contents;

  return insertAfterOpenBrace(
    merged,
    /didFinishLaunchingWithOptions[\s\S]*?->\s*Bool/,
    'RNVoipPushNotificationManager.voipRegistration()',
    'RNVoipPushNotificationManager.voipRegistration()',
  );
}

const OBJC_DELEGATE_BLOCK = [
  '#import <PushKit/PushKit.h>',
  '#import "RNVoipPushNotificationManager.h"',
  '#import "RNCallKeep.h"',
  '',
  '// Category riêng (không đụng @implementation AppDelegate chính) — `RNVoipPushNotificationManager` gán chính',
  '// `AppDelegate` (qua `RCTSharedApplication().delegate`) làm delegate của `PKPushRegistry`.',
  '@interface AppDelegate (CallNativeVoip) <PKPushRegistryDelegate>',
  '@end',
  '',
  '@implementation AppDelegate (CallNativeVoip)',
  '',
  '- (void)pushRegistry:(PKPushRegistry *)registry didUpdatePushCredentials:(PKPushCredentials *)credentials forType:(PKPushType)type {',
  '  [RNVoipPushNotificationManager didUpdatePushCredentials:credentials forType:(NSString *)type];',
  '}',
  '',
  '- (void)pushRegistry:(PKPushRegistry *)registry didInvalidatePushTokenForType:(PKPushType)type {}',
  '',
  '- (void)pushRegistry:(PKPushRegistry *)registry didReceiveIncomingPushWithPayload:(PKPushPayload *)payload forType:(PKPushType)type withCompletionHandler:(void (^)(void))completion {',
  '  NSString *uuid = payload.dictionaryPayload[@"callUuid"] ?: @"";',
  '  NSString *callerName = payload.dictionaryPayload[@"callerName"];',
  '  BOOL isVideo = [payload.dictionaryPayload[@"mediaKind"] isEqualToString:@"VIDEO"];',
  '  [RNVoipPushNotificationManager addCompletionHandler:uuid completionHandler:completion];',
  '  [RNVoipPushNotificationManager didReceiveIncomingPushWithPayload:payload forType:(NSString *)type];',
  '  [RNCallKeep reportNewIncomingCall:uuid',
  '                              handle:uuid',
  '                          handleType:@"generic"',
  '                            hasVideo:isVideo',
  '                 localizedCallerName:(callerName.length > 0 ? callerName : @"Super App")',
  '                         fromPushKit:YES',
  '                             payload:payload.dictionaryPayload',
  '               withCompletionHandler:completion];',
  '}',
  '',
  '@end',
].join('\n');

function patchObjc(src) {
  const merged = mergeContents({
    anchor: /#import "AppDelegate\.h"/,
    offset: 1,
    comment: '//',
    tag: 'call-native-voip',
    newSrc: OBJC_DELEGATE_BLOCK,
    src,
  }).contents;

  return insertAfterOpenBrace(
    merged,
    /didFinishLaunchingWithOptions:\(NSDictionary \*\)launchOptions/,
    '[RNVoipPushNotificationManager voipRegistration]',
    '[RNVoipPushNotificationManager voipRegistration];',
  );
}

module.exports = withVoipPush;
