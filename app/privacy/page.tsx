import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Privacy Policy | Entrevoz - MachineMind",
  description:
    "Privacy Policy for Entrevoz real-time voice translation. What data we collect, how we collect it, how it is used, and every third-party service it is shared with, including AI services.",
};

// ─────────────────────────────────────────────────────────────────────────────
// Every statement below must match the code. When a feature starts sending
// data somewhere new, add the recipient to section 4 AND to the in-app consent
// sheet (app/components/AIConsentSheet.tsx) in the same change.
// ─────────────────────────────────────────────────────────────────────────────

interface Processor {
  name: string;
  purpose: string;
  data: string;
}

const AI_PROCESSORS: Processor[] = [
  {
    name: "OpenAI (Whisper)",
    purpose: "Speech-to-text",
    data: "Short recordings of your voice while you use a voice feature, when your device's built-in speech recognition is unavailable or not used. Returns the transcript.",
  },
  {
    name: "Anthropic (Claude)",
    purpose: "Translation, AI tutor (Practice), AI coach (Wingman), call summaries",
    data: "Text you type or speak, recent lines of the same conversation (for accurate translation), messages you send in Practice and Wingman, and call transcripts when you ask for a post-call summary or turn on Learning Mode.",
  },
  {
    name: "Google Translate, MyMemory (Translated srl)",
    purpose: "Fast text translation",
    data: "The individual phrase being translated (and single vocabulary words from your calls for Practice flashcards). No account or device identifiers are sent.",
  },
  {
    name: "ElevenLabs",
    purpose: "Spoken voice output (optional)",
    data: "Only if you turn voice output or Voice Mimic on: translated text to be spoken and, for Voice Mimic, short samples of your voice used to create a temporary voice that is deleted automatically within about 2 hours.",
  },
];

const INFRA_PROCESSORS: Processor[] = [
  {
    name: "Daily.co",
    purpose: "Video calls",
    data: "Live audio and video of 1:1 video calls, carried between you and your partner. Daily does not record calls for us.",
  },
  {
    name: "PeerJS and Metered (TURN relay)",
    purpose: "Peer-to-peer connections",
    data: "Connection signaling and, when a direct connection is not possible, relayed encrypted audio/video for talk, group and face-to-face features.",
  },
  {
    name: "Supabase",
    purpose: "Database and sign-in",
    data: "The account, contacts, call history, directory, invite, learning-progress and push-token records described in section 2.",
  },
  {
    name: "Vercel and Upstash",
    purpose: "Hosting and abuse prevention",
    data: "Serves the app; processes IP addresses transiently for security and rate limiting.",
  },
  {
    name: "Apple",
    purpose: "Push notifications and on-device speech recognition",
    data: "A push token to deliver incoming-call alerts. When iOS speech recognition is used, audio is handled by Apple under Apple's privacy policy.",
  },
  {
    name: "Stripe",
    purpose: "Payments on our website",
    data: "Payment details for purchases made on entrevoz.co. The iOS app does not process payments. We never receive your full card number.",
  },
];

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-white mb-4">
        {n}. {title}
      </h2>
      <div className="space-y-4 text-gray-300 leading-relaxed">{children}</div>
    </section>
  );
}

function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-cyan-400 font-medium mb-2">{title}</h3>
      {children}
    </div>
  );
}

function ProcessorList({ items }: { items: Processor[] }) {
  return (
    <div className="space-y-3">
      {items.map((p) => (
        <div key={p.name} className="p-4 bg-[#1a1a2e] rounded-xl border border-gray-700">
          <h4 className="text-white font-medium">{p.name}</h4>
          <p className="text-xs text-cyan-300/80 mb-1">{p.purpose}</p>
          <p className="text-sm text-gray-400">{p.data}</p>
        </div>
      ))}
    </div>
  );
}

export default function PrivacyPage() {
  const lastUpdated = "September 24, 2026";

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-[#0a0a0f] via-[#0d1117] to-[#0a0a0f] py-8 px-4 sm:py-12 sm:px-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8 sm:mb-12">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition mb-6"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Entrevoz
          </Link>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">Privacy Policy</h1>
          <p className="text-gray-400">Last updated: {lastUpdated}</p>
        </div>

        <div className="bg-[#12121a] rounded-2xl border border-gray-800 p-6 sm:p-8 space-y-8">
          <Section n={1} title="Introduction">
            <p>
              MachineMind (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) operates Entrevoz, a
              real-time translation app for conversations, calls and language practice, on iOS
              and at entrevoz.co. This policy explains what information we collect, how we
              collect it, every way we use it, and every third party we share it with —
              including third-party AI services. We comply with applicable data protection
              laws, including the GDPR and CCPA.
            </p>
            <div className="p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-xl">
              <p className="text-cyan-100 text-sm">
                <span className="font-semibold">Your permission comes first.</span> Translation
                works by sending what you say or type to AI and translation services. The app
                shows you exactly what is sent and to whom, and sends nothing to them until you
                tap <span className="font-semibold">Allow</span>. You can withdraw permission at
                any time in Profile → Account &amp; Privacy → AI Data Sharing.
              </p>
            </div>
          </Section>

          <Section n={2} title="Information We Collect and How">
            <Sub title="2.1 Content you choose to translate (only after you allow AI data sharing)">
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Your voice, captured through the microphone only while you use a voice feature (you start it by tapping the microphone or joining a call).</li>
                <li>Transcripts of what you say and text you type into the translator.</li>
                <li>Messages you send to the AI tutor (Practice) and AI coach (Wingman).</li>
                <li>Short voice samples, only if you turn on Voice Mimic.</li>
              </ul>
            </Sub>
            <Sub title="2.2 Information you provide">
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Optional account: email address, name and password (the password is stored only as a secure hash by our sign-in provider).</li>
                <li>Display name and preferred language.</li>
                <li>Contacts you save: their display name, language and a random app identifier (never phone numbers or your address book).</li>
                <li>Invites you create: your name, language and the label you give the invite.</li>
              </ul>
            </Sub>
            <Sub title="2.3 Information created as you use the app">
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>A random device identifier generated by the app, and your personal dial code derived from it.</li>
                <li>Call history: partner name, date, duration, languages, and the call&apos;s translated transcript (up to 60 lines), so you can review past calls on any device.</li>
                <li>Language-practice progress: flashcards, fluency level, and vocabulary words taken from your calls.</li>
                <li>A push token, so incoming calls can ring your phone.</li>
                <li>Recordings you make with the Record button — saved only on your device.</li>
                <li>Translation phrasebook and preferences — saved only on your device.</li>
              </ul>
            </Sub>
            <Sub title="2.4 Collected automatically">
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>IP address and approximate country when you create an account, and IP addresses processed transiently for security and rate limiting.</li>
                <li>Device and browser type.</li>
                <li>Usage statistics without content: language pair, text length, which translation service answered, and response time.</li>
                <li>Nearby (optional): your approximate location while the Nearby screen is open and only if you grant location permission, used to show other users nearby. It expires automatically after 30 minutes.</li>
              </ul>
            </Sub>
            <Sub title="2.5 Microphone and camera">
              <p className="ml-2">
                Used only while you use a voice or call feature, after you grant permission in
                iOS. Speech is converted to text by your device&apos;s speech recognition or, when
                that is unavailable, by OpenAI Whisper. Camera video is used only in video calls.
                We do not record calls; only you can record, and recordings stay on your device.
                You can revoke access anytime in iOS Settings → Entrevoz.
              </p>
            </Sub>
          </Section>

          <Section n={3} title="How We Use Information">
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>To transcribe, translate and optionally speak your conversations.</li>
              <li>To connect calls, ring the people you call, and show who is calling you.</li>
              <li>To keep your contacts, call history and practice progress available to you.</li>
              <li>To run the AI tutor, AI coach and call summaries you request.</li>
              <li>To secure the service, prevent abuse and fix problems.</li>
              <li>To manage your account and, on the website, purchases.</li>
            </ul>
            <p>
              We do not sell your personal information, do not use it for advertising, and do
              not track you across other companies&apos; apps or websites.
            </p>
          </Section>

          <Section n={4} title="Third Parties We Share Data With">
            <p>
              We share data only with the service providers below, only after you allow AI data
              sharing where AI is involved, and only as needed to provide the feature you are
              using.
            </p>
            <Sub title="4.1 AI and translation services">
              <ProcessorList items={AI_PROCESSORS} />
              <p className="text-sm text-gray-400 mt-3">
                Under their API terms, OpenAI and Anthropic do not use data submitted through
                their business APIs to train their models.
              </p>
            </Sub>
            <Sub title="4.2 Infrastructure services">
              <ProcessorList items={INFRA_PROCESSORS} />
            </Sub>
            <div className="p-4 bg-[#1a1a2e] rounded-xl border border-gray-700">
              <p className="text-sm">
                <span className="text-white font-medium">Equal protection.</span> We confirm
                that each third party we share user data with provides the same or equal
                protection of that data as stated in this policy: they may use it only to
                provide their service to us, must keep it confidential and secure, and may not
                sell it or use it for advertising. Each also processes data under its own
                privacy policy.
              </p>
            </div>
          </Section>

          <Section n={5} title="Data Retention">
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>
                <span className="text-white">Audio and text sent for transcription or translation:</span>{" "}
                not stored by us after the result is returned (except the call history you
                keep). AI providers may retain it for a limited period for safety and abuse
                monitoring, as described in their own policies.
              </li>
              <li>
                <span className="text-white">Account, contacts, call history, invites, directory entry and practice progress:</span>{" "}
                kept until you delete them or delete your account.
              </li>
              <li>
                <span className="text-white">Voice Mimic voices:</span> deleted automatically
                within about 2 hours.
              </li>
              <li>
                <span className="text-white">Nearby location:</span> expires after 30 minutes.
              </li>
              <li>
                <span className="text-white">On-device data</span> (recordings, phrasebook,
                preferences): stays on your device until you clear it or delete the app.
              </li>
            </ul>
          </Section>

          <Section n={6} title="Your Choices and Rights">
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>
                <span className="text-white">Withdraw AI permission:</span> Profile → Account
                &amp; Privacy → AI Data Sharing → Turn Off. Translation features then pause and
                nothing more is sent.
              </li>
              <li>
                <span className="text-white">Delete everything:</span> Profile → Account &amp;
                Privacy → Delete My Account. This deletes your account and your server-side
                contacts, call history, directory entry, invites, push token and practice
                progress, and clears this device.
              </li>
              <li>
                <span className="text-white">Access and portability:</span> Account &amp;
                Privacy → Export My Data.
              </li>
              <li>
                <span className="text-white">Microphone, camera and notifications:</span>{" "}
                iOS Settings → Entrevoz.
              </li>
            </ul>
            <p>
              Under the GDPR, CCPA and similar laws you may also request access, correction or
              deletion by contacting us (section 11). We will not discriminate against you for
              exercising your rights.
            </p>
          </Section>

          <Section n={7} title="Security">
            <p>
              Data is encrypted in transit (HTTPS/TLS; call media uses DTLS-SRTP). Server records
              are protected by access controls. No method of transmission over the internet is
              100% secure, and we cannot guarantee absolute security.
            </p>
          </Section>

          <Section n={8} title="International Transfers">
            <p>
              We and our providers process data in the United States and other countries where
              they operate.
            </p>
          </Section>

          <Section n={9} title="Children's Privacy">
            <p>
              Entrevoz is not intended for children under 13, and we do not knowingly collect
              personal information from children under 13. If you believe a child has provided
              us information, contact us and we will delete it.
            </p>
          </Section>

          <Section n={10} title="Changes to This Policy">
            <p>
              We will post any changes on this page and update the &quot;Last updated&quot; date.
              If a change adds a new recipient of your data, the app will ask for your
              permission again before sending anything to it.
            </p>
          </Section>

          <Section n={11} title="Contact Us">
            <div className="p-4 bg-[#1a1a2e] rounded-xl border border-gray-700">
              <p className="text-white font-medium">MachineMind</p>
              <a
                href="mailto:support@machinemindconsulting.com"
                className="text-cyan-400 hover:text-cyan-300 transition"
              >
                support@machinemindconsulting.com
              </a>
            </div>
          </Section>

          <section className="p-4 bg-[#1a1a2e] rounded-xl border border-gray-700" lang="es">
            <h2 className="text-lg font-semibold text-white mb-3">Resumen en español</h2>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-300 ml-2">
              <li>Para traducir, Entrevoz envía lo que dices o escribes a OpenAI (voz a texto), Anthropic Claude, Google Translate y MyMemory (traducción) y, solo si activas la voz, a ElevenLabs.</li>
              <li>No se envía nada hasta que tocas <span className="text-white">Permitir</span>. Puedes desactivarlo en Perfil → Cuenta y privacidad → Compartir datos con IA.</li>
              <li>Guardamos tu cuenta (opcional), contactos, historial de llamadas con transcripción, progreso de práctica y token de notificaciones hasta que los borres.</li>
              <li>No vendemos tus datos ni los usamos para publicidad. Borra todo en Cuenta y privacidad → Eliminar mi cuenta.</li>
            </ul>
          </section>
        </div>

        {/* Footer Links */}
        <div className="mt-8 text-center space-y-4">
          <div className="flex justify-center gap-6 text-sm">
            <Link href="/terms" className="text-gray-400 hover:text-cyan-400 transition">
              Terms of Service
            </Link>
            <Link href="/account" className="text-gray-400 hover:text-cyan-400 transition">
              Account &amp; Privacy
            </Link>
            <Link href="/" className="text-gray-400 hover:text-cyan-400 transition">
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
