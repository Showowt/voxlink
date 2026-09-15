import Foundation
import PushKit
import CallKit
import AVFoundation
import Capacitor

// ═══════════════════════════════════════════════════════════════════════════════
// EntrevozCall — ring-when-closed via PushKit (VoIP) + CallKit.
//
// PushKitManager registers for VoIP pushes at launch (so the app can be woken
// from a killed state) and reports each incoming push to CallKit, which shows
// the native full-screen ringing UI even when the app is closed. When the user
// answers, we surface the invite to the web layer (EntrevozCallPlugin), which
// navigates the WebView into the call room.
//
// Wiring:
//   • AppDelegate.didFinishLaunching → PushKitManager.shared.start()
//   • Info.plist UIBackgroundModes must include: voip, audio
//   • App capability: Push Notifications; entitlement aps-environment
// ═══════════════════════════════════════════════════════════════════════════════

struct EntrevozInvite {
    let room: String
    let type: String
    let fromName: String
    let fromLang: String
    let fromDevice: String
}

final class PushKitManager: NSObject {
    static let shared = PushKitManager()

    private let provider: CXProvider
    private let callController = CXCallController()
    private var voipRegistry: PKPushRegistry?

    // Latest VoIP token (hex), exposed to JS so it can register with the server.
    private(set) var voipTokenHex: String?
    // Pending answered invite (for when the app was cold-launched by the push).
    private(set) var pendingAnswered: EntrevozInvite?
    // Map CallKit call UUID → invite, so answer/decline can resolve the room.
    private var activeInvites: [UUID: EntrevozInvite] = [:]

    override init() {
        let config = CXProviderConfiguration()
        config.supportsVideo = true
        config.maximumCallsPerCallGroup = 1
        config.supportedHandleTypes = [.generic]
        self.provider = CXProvider(configuration: config)
        super.init()
        self.provider.setDelegate(self, queue: nil)
    }

    func start() {
        let registry = PKPushRegistry(queue: .main)
        registry.delegate = self
        registry.desiredPushTypes = [.voIP]
        self.voipRegistry = registry
    }

    // Report an incoming call to CallKit — this rings the phone even if the app
    // is not running.
    private func reportIncoming(_ invite: EntrevozInvite) {
        let uuid = UUID()
        activeInvites[uuid] = invite
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: invite.fromName)
        update.hasVideo = (invite.type == "video")
        update.localizedCallerName = invite.fromName
        provider.reportNewIncomingCall(with: uuid, update: update) { error in
            if let error = error {
                NSLog("[EntrevozCall] reportNewIncomingCall failed: \(error)")
                self.activeInvites[uuid] = nil
            }
        }
    }

    fileprivate func consumePendingAnswered() -> EntrevozInvite? {
        let p = pendingAnswered
        pendingAnswered = nil
        return p
    }
}

// MARK: - PushKit

extension PushKitManager: PKPushRegistryDelegate {
    func pushRegistry(_ registry: PKPushRegistry, didUpdate credentials: PKPushCredentials, for type: PKPushType) {
        let hex = credentials.token.map { String(format: "%02x", $0) }.joined()
        voipTokenHex = hex
        NotificationCenter.default.post(name: .entrevozVoipToken, object: nil, userInfo: ["token": hex])
    }

    func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        voipTokenHex = nil
    }

    // MUST report to CallKit synchronously here or iOS may terminate the app.
    func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
        let dict = payload.dictionaryPayload
        let inviteDict = (dict["invite"] as? [String: Any]) ?? [:]
        let invite = EntrevozInvite(
            room: (inviteDict["room"] as? String) ?? "",
            type: (inviteDict["type"] as? String) ?? "video",
            fromName: (inviteDict["fromName"] as? String) ?? "Someone",
            fromLang: (inviteDict["fromLang"] as? String) ?? "en",
            fromDevice: (inviteDict["fromDevice"] as? String) ?? ""
        )
        if invite.room.isEmpty {
            // Still must report a call for a VoIP push or iOS penalizes the app.
            reportIncoming(EntrevozInvite(room: "", type: "video", fromName: "Entrevoz", fromLang: "en", fromDevice: ""))
        } else {
            reportIncoming(invite)
        }
        completion()
    }
}

// MARK: - CallKit

extension PushKitManager: CXProviderDelegate {
    func providerDidReset(_ provider: CXProvider) {
        activeInvites.removeAll()
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        guard let invite = activeInvites[action.callUUID], !invite.room.isEmpty else {
            action.fail()
            return
        }
        pendingAnswered = invite
        // Tell the web layer to navigate into the room (if it's running).
        NotificationCenter.default.post(
            name: .entrevozCallAnswered,
            object: nil,
            userInfo: [
                "room": invite.room, "type": invite.type,
                "fromLang": invite.fromLang, "fromName": invite.fromName,
            ]
        )
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        if let invite = activeInvites[action.callUUID] {
            NotificationCenter.default.post(
                name: .entrevozCallDeclined,
                object: nil,
                userInfo: ["room": invite.room, "fromDevice": invite.fromDevice]
            )
        }
        activeInvites[action.callUUID] = nil
        action.fulfill()
    }

    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {}
    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {}
}

extension Notification.Name {
    static let entrevozVoipToken = Notification.Name("entrevozVoipToken")
    static let entrevozCallAnswered = Notification.Name("entrevozCallAnswered")
    static let entrevozCallDeclined = Notification.Name("entrevozCallDeclined")
}

// MARK: - Capacitor plugin bridge (web ↔ native)

@objc(EntrevozCallPlugin)
public class EntrevozCallPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "EntrevozCallPlugin"
    public let jsName = "EntrevozCall"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPendingAnswered", returnType: CAPPluginReturnPromise),
    ]

    override public func load() {
        let nc = NotificationCenter.default
        nc.addObserver(self, selector: #selector(onToken(_:)), name: .entrevozVoipToken, object: nil)
        nc.addObserver(self, selector: #selector(onAnswered(_:)), name: .entrevozCallAnswered, object: nil)
        nc.addObserver(self, selector: #selector(onDeclined(_:)), name: .entrevozCallDeclined, object: nil)
    }

    @objc func getToken(_ call: CAPPluginCall) {
        call.resolve(["token": PushKitManager.shared.voipTokenHex ?? ""])
    }

    @objc func getPendingAnswered(_ call: CAPPluginCall) {
        if let inv = PushKitManager.shared.consumePendingAnswered() {
            call.resolve(["room": inv.room, "type": inv.type, "fromLang": inv.fromLang, "fromName": inv.fromName])
        } else {
            call.resolve([:])
        }
    }

    @objc private func onToken(_ n: Notification) {
        notifyListeners("voipToken", data: ["token": (n.userInfo?["token"] as? String) ?? ""])
    }
    @objc private func onAnswered(_ n: Notification) {
        notifyListeners("callAnswered", data: (n.userInfo as? [String: Any]) ?? [:])
    }
    @objc private func onDeclined(_ n: Notification) {
        notifyListeners("callDeclined", data: (n.userInfo as? [String: Any]) ?? [:])
    }
}
