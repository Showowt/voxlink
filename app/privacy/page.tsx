import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Voxxo - MachineMind",
  description:
    "Privacy Policy for Voxxo real-time voice translation app. Learn how we handle your data, microphone access, and third-party services.",
};

export default function PrivacyPage() {
  const lastUpdated = "March 6, 2026";

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#0d1117] to-[#0a0a0f] py-8 px-4 sm:py-12 sm:px-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8 sm:mb-12">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition mb-6"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to Voxxo
          </Link>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
            Privacy Policy
          </h1>
          <p className="text-gray-400">Last updated: {lastUpdated}</p>
        </div>

        {/* Content */}
        <div className="bg-[#12121a] rounded-2xl border border-gray-800 p-6 sm:p-8 space-y-8">
          {/* Introduction */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              1. Introduction
            </h2>
            <p className="text-gray-300 leading-relaxed">
              MachineMind (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;)
              operates Voxxo, a real-time voice translation application. This
              Privacy Policy explains how we collect, use, disclose, and
              safeguard your information when you use our service. We are
              committed to protecting your privacy and complying with applicable
              data protection laws, including GDPR and CCPA.
            </p>
          </section>

          {/* Data Collection */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              2. Information We Collect
            </h2>
            <div className="space-y-4 text-gray-300">
              <div>
                <h3 className="text-cyan-400 font-medium mb-2">
                  2.1 Information You Provide
                </h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Display name (stored locally on your device)</li>
                  <li>Language preferences</li>
                  <li>
                    Text and speech input for translation (processed in
                    real-time, not stored)
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-cyan-400 font-medium mb-2">
                  2.2 Automatically Collected Information
                </h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Session tokens (stored in browser sessionStorage)</li>
                  <li>Device type and browser information</li>
                  <li>Connection metadata for WebRTC peer connections</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Microphone and Camera Access */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              3. Microphone and Camera Access
            </h2>
            <div className="space-y-4 text-gray-300">
              <p>
                Voxxo requires access to your device&apos;s microphone and
                camera to provide translation services:
              </p>
              <div>
                <h3 className="text-cyan-400 font-medium mb-2">
                  3.1 Microphone Access
                </h3>
                <p className="ml-2">
                  Used for speech recognition and real-time voice translation.
                  Audio is processed locally using your browser&apos;s Web
                  Speech API and is not recorded or stored on our servers.
                </p>
              </div>
              <div>
                <h3 className="text-cyan-400 font-medium mb-2">
                  3.2 Camera Access
                </h3>
                <p className="ml-2">
                  Used for video calls between users. Video streams are
                  transmitted directly between participants via WebRTC
                  peer-to-peer connections and are not routed through or stored
                  on our servers.
                </p>
              </div>
              <div className="p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-xl">
                <p className="text-cyan-100 text-sm">
                  You can revoke microphone and camera permissions at any time
                  through your browser settings. The app will request permission
                  each session unless you grant persistent access.
                </p>
              </div>
            </div>
          </section>

          {/* Third-Party Services */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              4. Third-Party Services
            </h2>
            <div className="space-y-4 text-gray-300">
              <p>
                Voxxo uses the following third-party services to provide
                translation functionality:
              </p>
              <div className="space-y-3">
                <div className="p-4 bg-[#1a1a2e] rounded-xl border border-gray-700">
                  <h3 className="text-white font-medium mb-1">
                    MyMemory Translation API
                  </h3>
                  <p className="text-sm text-gray-400">
                    Processes text for translation. Subject to MyMemory&apos;s
                    privacy policy.
                  </p>
                </div>
                <div className="p-4 bg-[#1a1a2e] rounded-xl border border-gray-700">
                  <h3 className="text-white font-medium mb-1">
                    LibreTranslate API
                  </h3>
                  <p className="text-sm text-gray-400">
                    Open-source translation service used as a fallback.
                  </p>
                </div>
                <div className="p-4 bg-[#1a1a2e] rounded-xl border border-gray-700">
                  <h3 className="text-white font-medium mb-1">
                    Google Translate API
                  </h3>
                  <p className="text-sm text-gray-400">
                    May be used for certain translation requests. Subject to
                    Google&apos;s privacy policy.
                  </p>
                </div>
                <div className="p-4 bg-[#1a1a2e] rounded-xl border border-gray-700">
                  <h3 className="text-white font-medium mb-1">PeerJS/WebRTC</h3>
                  <p className="text-sm text-gray-400">
                    Enables peer-to-peer video and audio connections. Connection
                    signaling may use PeerJS servers.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Data Retention */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              5. Data Retention
            </h2>
            <div className="space-y-3 text-gray-300">
              <p>We minimize data retention:</p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>
                  <span className="text-white">Session tokens:</span> Stored in
                  sessionStorage, cleared when you close your browser tab
                </li>
                <li>
                  <span className="text-white">User preferences:</span> Stored
                  in localStorage on your device only
                </li>
                <li>
                  <span className="text-white">
                    Audio/video and translations:
                  </span>{" "}
                  Processed in real-time, not stored
                </li>
                <li>
                  <span className="text-white">WebRTC connections:</span>{" "}
                  Terminated when the call ends
                </li>
              </ul>
            </div>
          </section>

          {/* User Rights */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              6. Your Rights
            </h2>
            <div className="space-y-4 text-gray-300">
              <p>
                Under GDPR, CCPA, and other applicable laws, you have the right
                to:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>
                  <span className="text-white">Access:</span> Request
                  information about data we process about you
                </li>
                <li>
                  <span className="text-white">Deletion:</span> Request deletion
                  of your data (clear browser storage)
                </li>
                <li>
                  <span className="text-white">Portability:</span> Receive your
                  data in a portable format
                </li>
                <li>
                  <span className="text-white">Opt-out:</span> Revoke camera and
                  microphone permissions at any time
                </li>
                <li>
                  <span className="text-white">Non-discrimination:</span> We
                  will not discriminate against you for exercising your rights
                </li>
              </ul>
              <div className="p-4 bg-[#1a1a2e] rounded-xl border border-gray-700">
                <p className="text-sm">
                  <span className="text-cyan-400">
                    California Residents (CCPA):
                  </span>{" "}
                  You have the right to know what personal information we
                  collect, request deletion, and opt-out of sale of personal
                  information. We do not sell your personal information.
                </p>
              </div>
            </div>
          </section>

          {/* Security */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              7. Security
            </h2>
            <p className="text-gray-300 leading-relaxed">
              We implement appropriate technical and organizational measures to
              protect your data. WebRTC connections use DTLS encryption for
              media streams. However, no method of transmission over the
              internet is 100% secure, and we cannot guarantee absolute
              security.
            </p>
          </section>

          {/* Children */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              8. Children&apos;s Privacy
            </h2>
            <p className="text-gray-300 leading-relaxed">
              Voxxo is not intended for children under 13 years of age. We do
              not knowingly collect personal information from children under 13.
              If you believe we have collected information from a child under
              13, please contact us immediately.
            </p>
          </section>

          {/* Changes */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              9. Changes to This Policy
            </h2>
            <p className="text-gray-300 leading-relaxed">
              We may update this Privacy Policy from time to time. We will
              notify you of any changes by posting the new Privacy Policy on
              this page and updating the &quot;Last updated&quot; date.
            </p>
          </section>

          {/* Contact */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              10. Contact Us
            </h2>
            <p className="text-gray-300 mb-4">
              If you have questions about this Privacy Policy or wish to
              exercise your rights, contact us at:
            </p>
            <div className="p-4 bg-[#1a1a2e] rounded-xl border border-gray-700">
              <p className="text-white font-medium">MachineMind</p>
              <a
                href="mailto:support@machinemindconsulting.com"
                className="text-cyan-400 hover:text-cyan-300 transition"
              >
                support@machinemindconsulting.com
              </a>
            </div>
          </section>
        </div>

        {/* Footer Links */}
        <div className="mt-8 text-center space-y-4">
          <div className="flex justify-center gap-6 text-sm">
            <Link
              href="/terms"
              className="text-gray-400 hover:text-cyan-400 transition"
            >
              Terms of Service
            </Link>
            <Link
              href="/"
              className="text-gray-400 hover:text-cyan-400 transition"
            >
              Back to App
            </Link>
          </div>
          <p className="text-gray-500 text-xs">
            &copy; {new Date().getFullYear()} MachineMind. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
