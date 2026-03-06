import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | VoxLink - MachineMind",
  description:
    "Terms of Service for VoxLink real-time voice translation app. Understand your rights and responsibilities when using our service.",
};

export default function TermsPage() {
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
            Back to VoxLink
          </Link>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
            Terms of Service
          </h1>
          <p className="text-gray-400">Last updated: {lastUpdated}</p>
        </div>

        {/* Content */}
        <div className="bg-[#12121a] rounded-2xl border border-gray-800 p-6 sm:p-8 space-y-8">
          {/* Introduction */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              1. Agreement to Terms
            </h2>
            <p className="text-gray-300 leading-relaxed">
              By accessing or using VoxLink, a service provided by MachineMind
              (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;), you agree to
              be bound by these Terms of Service. If you do not agree to these
              terms, please do not use our service. These terms apply to all
              users of VoxLink, including without limitation users who are
              browsers, vendors, customers, merchants, and contributors of
              content.
            </p>
          </section>

          {/* Service Description */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              2. Service Description
            </h2>
            <div className="space-y-3 text-gray-300">
              <p>
                VoxLink is a real-time voice translation application that
                provides:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>Text-to-text translation with verification</li>
                <li>Voice-to-text transcription and translation</li>
                <li>
                  Face-to-face translation mode for in-person conversations
                </li>
                <li>Video call translation for remote communication</li>
              </ul>
              <p className="mt-4">
                The service uses third-party APIs for translation and WebRTC for
                peer-to-peer communication.
              </p>
            </div>
          </section>

          {/* User Responsibilities */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              3. User Responsibilities
            </h2>
            <div className="space-y-4 text-gray-300">
              <p>By using VoxLink, you agree to:</p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>Provide accurate information when required</li>
                <li>Use the service only for lawful purposes</li>
                <li>
                  Not use the service to transmit harmful, threatening, or
                  illegal content
                </li>
                <li>
                  Not attempt to interfere with or disrupt the service or
                  servers
                </li>
                <li>
                  Not use automated systems or software to extract data from the
                  service
                </li>
                <li>
                  Comply with all applicable local, state, national, and
                  international laws
                </li>
              </ul>
            </div>
          </section>

          {/* Device Permissions */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              4. Device Permissions
            </h2>
            <div className="space-y-4 text-gray-300">
              <p>
                VoxLink requires access to your device&apos;s microphone and
                camera to function properly. By granting these permissions, you:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>
                  Consent to audio capture for speech recognition and
                  translation
                </li>
                <li>Consent to video capture for video call functionality</li>
                <li>
                  Understand that audio and video are processed in real-time and
                  transmitted via peer-to-peer connections
                </li>
                <li>
                  Acknowledge that you are responsible for any content you
                  transmit
                </li>
              </ul>
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                <p className="text-yellow-100 text-sm">
                  You can revoke these permissions at any time through your
                  browser settings. Revoking permissions will limit the
                  functionality of VoxLink.
                </p>
              </div>
            </div>
          </section>

          {/* Translation Accuracy */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              5. Translation Accuracy Disclaimer
            </h2>
            <div className="space-y-3 text-gray-300">
              <p>
                VoxLink uses automated translation services. While we strive for
                accuracy:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>
                  Translations may not be 100% accurate or capture all nuances
                </li>
                <li>
                  The service should not be used for critical, legal, medical,
                  or emergency communications
                </li>
                <li>
                  Users should verify important translations through other means
                </li>
                <li>
                  We are not responsible for misunderstandings arising from
                  translation errors
                </li>
              </ul>
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                <p className="text-red-100 text-sm font-medium">
                  Do not rely solely on VoxLink for critical communications,
                  including medical, legal, financial, or emergency situations.
                </p>
              </div>
            </div>
          </section>

          {/* Intellectual Property */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              6. Intellectual Property
            </h2>
            <div className="space-y-3 text-gray-300">
              <p>
                VoxLink and its original content, features, and functionality
                are owned by MachineMind and are protected by international
                copyright, trademark, patent, trade secret, and other
                intellectual property laws.
              </p>
              <p>
                You retain ownership of any content you create or transmit using
                VoxLink. By using the service, you grant us a limited license to
                process your content for the purpose of providing translation
                services.
              </p>
            </div>
          </section>

          {/* Third-Party Services */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              7. Third-Party Services
            </h2>
            <div className="space-y-3 text-gray-300">
              <p>
                VoxLink integrates with third-party services including
                translation APIs and WebRTC infrastructure. These services have
                their own terms and privacy policies:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>MyMemory Translation API</li>
                <li>LibreTranslate</li>
                <li>Google Translate API</li>
                <li>PeerJS for WebRTC signaling</li>
              </ul>
              <p className="mt-4">
                We are not responsible for the practices or content of
                third-party services. Your use of third-party services is at
                your own risk.
              </p>
            </div>
          </section>

          {/* Limitation of Liability */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              8. Limitation of Liability
            </h2>
            <div className="space-y-3 text-gray-300">
              <p>
                To the maximum extent permitted by law, MachineMind shall not be
                liable for:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>
                  Any indirect, incidental, special, consequential, or punitive
                  damages
                </li>
                <li>
                  Loss of profits, data, use, goodwill, or other intangibles
                </li>
                <li>
                  Damages resulting from translation errors or inaccuracies
                </li>
                <li>Interruption or unavailability of the service</li>
                <li>
                  Any conduct or content of any third party using the service
                </li>
                <li>
                  Unauthorized access to or alteration of your transmissions or
                  content
                </li>
              </ul>
              <div className="p-4 bg-[#1a1a2e] rounded-xl border border-gray-700 mt-4">
                <p className="text-sm">
                  THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS
                  AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS
                  OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF
                  MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
                  NON-INFRINGEMENT.
                </p>
              </div>
            </div>
          </section>

          {/* Indemnification */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              9. Indemnification
            </h2>
            <p className="text-gray-300 leading-relaxed">
              You agree to defend, indemnify, and hold harmless MachineMind, its
              officers, directors, employees, and agents from any claims,
              damages, obligations, losses, liabilities, costs, or expenses
              arising from your use of VoxLink, your violation of these Terms,
              or your violation of any third-party rights.
            </p>
          </section>

          {/* Service Availability */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              10. Service Availability
            </h2>
            <div className="space-y-3 text-gray-300">
              <p>We strive to provide continuous service availability, but:</p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>We do not guarantee uninterrupted or error-free service</li>
                <li>
                  Service may be suspended for maintenance, updates, or security
                  reasons
                </li>
                <li>
                  Third-party API outages may affect translation functionality
                </li>
                <li>
                  We reserve the right to modify or discontinue the service at
                  any time
                </li>
              </ul>
            </div>
          </section>

          {/* Termination */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              11. Termination
            </h2>
            <p className="text-gray-300 leading-relaxed">
              We may terminate or suspend your access to VoxLink immediately,
              without prior notice or liability, for any reason, including
              breach of these Terms. Upon termination, your right to use the
              service will cease immediately.
            </p>
          </section>

          {/* Governing Law */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              12. Governing Law
            </h2>
            <p className="text-gray-300 leading-relaxed">
              These Terms shall be governed by and construed in accordance with
              the laws of the United States, without regard to its conflict of
              law provisions. Any disputes arising under these Terms shall be
              resolved through binding arbitration in accordance with the rules
              of the American Arbitration Association.
            </p>
          </section>

          {/* Changes to Terms */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              13. Changes to Terms
            </h2>
            <p className="text-gray-300 leading-relaxed">
              We reserve the right to modify these Terms at any time. We will
              notify users of material changes by posting the updated Terms on
              this page and updating the &quot;Last updated&quot; date.
              Continued use of VoxLink after changes constitutes acceptance of
              the new Terms.
            </p>
          </section>

          {/* Severability */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              14. Severability
            </h2>
            <p className="text-gray-300 leading-relaxed">
              If any provision of these Terms is held to be unenforceable or
              invalid, such provision will be changed and interpreted to
              accomplish the objectives of such provision to the greatest extent
              possible under applicable law, and the remaining provisions will
              continue in full force and effect.
            </p>
          </section>

          {/* Contact */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              15. Contact Us
            </h2>
            <p className="text-gray-300 mb-4">
              If you have questions about these Terms of Service, contact us at:
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
              href="/privacy"
              className="text-gray-400 hover:text-cyan-400 transition"
            >
              Privacy Policy
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
