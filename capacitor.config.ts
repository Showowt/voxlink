import type { CapacitorConfig } from "@capacitor/cli";

// iOS shell loads the live site; bundled webDir is only the offline fallback.
// "EntrevozApp" in the UA is what useIsNativeApp() keys on — keep in sync.
const config: CapacitorConfig = {
  appId: "com.entrevoz.app",
  appName: "Entrevoz",
  webDir: "native/www",
  server: {
    url: "https://www.entrevoz.co",
    allowNavigation: ["entrevoz.co", "www.entrevoz.co"],
  },
  ios: {
    appendUserAgent: "EntrevozApp/1.0",
    contentInset: "automatic",
    backgroundColor: "#030507",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: "#030507",
      showSpinner: false,
    },
  },
};

export default config;
