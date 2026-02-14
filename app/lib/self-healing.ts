// ═══════════════════════════════════════════════════════════════════════════════
// SELF-HEALING SYSTEM - Zero Cost, Always-On Error Recovery
// ═══════════════════════════════════════════════════════════════════════════════

type ErrorSeverity = "low" | "medium" | "high" | "critical";

interface ErrorLog {
  id: string;
  message: string;
  stack?: string;
  severity: ErrorSeverity;
  timestamp: number;
  recovered: boolean;
  context?: Record<string, any>;
}

interface HealthStatus {
  healthy: boolean;
  lastCheck: number;
  issues: string[];
  uptime: number;
}

class SelfHealingSystem {
  private static instance: SelfHealingSystem;
  private errorLogs: ErrorLog[] = [];
  private startTime: number = Date.now();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private memoryMonitorInterval: NodeJS.Timeout | null = null;
  private isClient: boolean = typeof window !== "undefined";
  private maxRetries: number = 3;
  private recoveryAttempts: Map<string, number> = new Map();

  // Store bound handlers for cleanup
  private boundOnlineHandler: (() => void) | null = null;
  private boundOfflineHandler: (() => void) | null = null;

  private constructor() {
    if (this.isClient) {
      this.initializeClientSide();
    }
  }

  static getInstance(): SelfHealingSystem {
    if (!SelfHealingSystem.instance) {
      SelfHealingSystem.instance = new SelfHealingSystem();
    }
    return SelfHealingSystem.instance;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // INITIALIZATION
  // ─────────────────────────────────────────────────────────────────────────────

  private initializeClientSide() {
    // Register service worker for PWA
    this.registerServiceWorker();

    // Global error handler
    window.onerror = (message, source, lineno, colno, error) => {
      this.handleError(error || new Error(String(message)), "high", {
        source,
        lineno,
        colno,
      });
      return true; // Prevent default error handling
    };

    // Unhandled promise rejections
    window.onunhandledrejection = (event) => {
      this.handleError(
        event.reason instanceof Error
          ? event.reason
          : new Error(String(event.reason)),
        "medium",
        { type: "unhandledRejection" },
      );
      event.preventDefault();
    };

    // Network status monitoring - store bound handlers for cleanup
    this.boundOnlineHandler = () => this.onNetworkChange(true);
    this.boundOfflineHandler = () => this.onNetworkChange(false);
    window.addEventListener("online", this.boundOnlineHandler);
    window.addEventListener("offline", this.boundOfflineHandler);

    // Start health checks
    this.startHealthMonitoring();

    // Memory pressure handling
    if ("memory" in performance) {
      this.monitorMemory();
    }

    console.log("🛡️ Self-Healing System initialized");
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SERVICE WORKER
  // ─────────────────────────────────────────────────────────────────────────────

  private async registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        console.log("🔧 Service Worker registered:", registration.scope);

        // Handle updates
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (
                newWorker.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                console.log("🔄 New content available - refresh to update");
              }
            });
          }
        });
      } catch (error) {
        console.warn("Service Worker registration failed:", error);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ERROR HANDLING
  // ─────────────────────────────────────────────────────────────────────────────

  handleError(
    error: Error,
    severity: ErrorSeverity = "medium",
    context?: Record<string, any>,
  ): boolean {
    const errorId = this.generateErrorId(error);

    // Log the error
    const errorLog: ErrorLog = {
      id: errorId,
      message: error.message,
      stack: error.stack,
      severity,
      timestamp: Date.now(),
      recovered: false,
      context,
    };

    this.errorLogs.push(errorLog);

    // Keep only last 100 errors
    if (this.errorLogs.length > 100) {
      this.errorLogs = this.errorLogs.slice(-100);
    }

    // Attempt recovery
    const recovered = this.attemptRecovery(errorId, error, severity);
    errorLog.recovered = recovered;

    // Store in localStorage for persistence
    this.persistErrors();

    return recovered;
  }

  private attemptRecovery(
    errorId: string,
    error: Error,
    severity: ErrorSeverity,
  ): boolean {
    const attempts = this.recoveryAttempts.get(errorId) || 0;

    if (attempts >= this.maxRetries) {
      console.warn(`🔴 Max recovery attempts reached for: ${error.message}`);
      return false;
    }

    this.recoveryAttempts.set(errorId, attempts + 1);

    try {
      // Recovery strategies based on error type
      if (error.message.includes("localStorage")) {
        return this.recoverStorage();
      }

      if (
        error.message.includes("network") ||
        error.message.includes("fetch")
      ) {
        return this.recoverNetwork();
      }

      if (error.message.includes("WebRTC") || error.message.includes("peer")) {
        return this.recoverConnection();
      }

      if (
        error.message.includes("speech") ||
        error.message.includes("recognition")
      ) {
        return this.recoverSpeech();
      }

      if (severity === "critical") {
        return this.performHardRecovery();
      }

      console.log(`🟡 Auto-recovery attempted for: ${error.message}`);
      return true;
    } catch (recoveryError) {
      console.error("Recovery failed:", recoveryError);
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RECOVERY STRATEGIES
  // ─────────────────────────────────────────────────────────────────────────────

  private recoverStorage(): boolean {
    try {
      // Test localStorage
      const testKey = "__test__";
      localStorage.setItem(testKey, "test");
      localStorage.removeItem(testKey);
      console.log("🟢 Storage recovered");
      return true;
    } catch {
      // Clear corrupted data
      try {
        localStorage.clear();
        console.log("🟡 Storage cleared and recovered");
        return true;
      } catch {
        return false;
      }
    }
  }

  private recoverNetwork(): boolean {
    if (!navigator.onLine) {
      console.log("🟡 Offline - waiting for network");
      return true; // Will auto-recover when online
    }
    console.log("🟢 Network available");
    return true;
  }

  private recoverConnection(): boolean {
    // Dispatch event for components to reconnect
    if (this.isClient) {
      window.dispatchEvent(new CustomEvent("voxlink-reconnect"));
      console.log("🟢 Connection recovery triggered");
    }
    return true;
  }

  private recoverSpeech(): boolean {
    // Speech recognition recovery
    if (this.isClient && "speechSynthesis" in window) {
      speechSynthesis.cancel();
    }
    console.log("🟢 Speech system reset");
    return true;
  }

  private performHardRecovery(): boolean {
    console.log("🔴 Performing hard recovery...");

    // Clear all voxlink data
    if (this.isClient) {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith("vox"));
      keys.forEach((k) => localStorage.removeItem(k));
    }

    // Dispatch recovery event
    if (this.isClient) {
      window.dispatchEvent(new CustomEvent("voxlink-hard-recovery"));
    }

    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HEALTH MONITORING
  // ─────────────────────────────────────────────────────────────────────────────

  private startHealthMonitoring() {
    // Check health every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 30000);

    // Initial check
    this.performHealthCheck();
  }

  private performHealthCheck(): HealthStatus {
    const issues: string[] = [];

    // Check localStorage
    try {
      localStorage.setItem("__health__", Date.now().toString());
      localStorage.removeItem("__health__");
    } catch {
      issues.push("localStorage unavailable");
    }

    // Check network
    if (!navigator.onLine) {
      issues.push("offline");
    }

    // Check for recent critical errors
    const recentCritical = this.errorLogs.filter(
      (e) => e.severity === "critical" && Date.now() - e.timestamp < 60000,
    );
    if (recentCritical.length > 0) {
      issues.push(`${recentCritical.length} critical errors in last minute`);
    }

    const status: HealthStatus = {
      healthy: issues.length === 0,
      lastCheck: Date.now(),
      issues,
      uptime: Date.now() - this.startTime,
    };

    if (!status.healthy) {
      console.warn("🟡 Health check issues:", issues);
      this.attemptAutoHeal(issues);
    }

    return status;
  }

  private attemptAutoHeal(issues: string[]) {
    issues.forEach((issue) => {
      if (issue === "localStorage unavailable") {
        this.recoverStorage();
      }
      if (issue === "offline") {
        // Wait for network - nothing to do
      }
      if (issue.includes("critical errors")) {
        // Log for review but don't take drastic action
        console.log("🟡 Multiple critical errors detected - monitoring");
      }
    });
  }

  private onNetworkChange(online: boolean) {
    if (online) {
      console.log("🟢 Network restored");
      window.dispatchEvent(new CustomEvent("voxlink-network-restored"));
    } else {
      console.log("🟡 Network lost - entering offline mode");
      window.dispatchEvent(new CustomEvent("voxlink-network-lost"));
    }
  }

  private monitorMemory() {
    this.memoryMonitorInterval = setInterval(() => {
      const memory = (performance as any).memory;
      if (memory && memory.usedJSHeapSize > memory.jsHeapSizeLimit * 0.9) {
        console.warn("🟡 High memory usage detected");
        // Trigger garbage collection hint
        this.errorLogs = this.errorLogs.slice(-50);
        this.recoveryAttempts.clear();
      }
    }, 60000);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // UTILITIES
  // ─────────────────────────────────────────────────────────────────────────────

  private generateErrorId(error: Error): string {
    return `${error.message.slice(0, 50)}-${error.stack?.slice(0, 100) || "nostack"}`
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 64);
  }

  private persistErrors() {
    if (!this.isClient) return;
    try {
      const recentErrors = this.errorLogs.slice(-20);
      localStorage.setItem("vox_errors", JSON.stringify(recentErrors));
    } catch {
      // Storage full or unavailable - ignore
    }
  }

  getHealthStatus(): HealthStatus {
    return this.performHealthCheck();
  }

  getErrorLogs(): ErrorLog[] {
    return [...this.errorLogs];
  }

  clearErrors() {
    this.errorLogs = [];
    this.recoveryAttempts.clear();
    if (this.isClient) {
      localStorage.removeItem("vox_errors");
    }
  }

  destroy() {
    // Clean up intervals
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    if (this.memoryMonitorInterval) {
      clearInterval(this.memoryMonitorInterval);
      this.memoryMonitorInterval = null;
    }

    // Clean up event listeners
    if (this.isClient && this.boundOnlineHandler && this.boundOfflineHandler) {
      window.removeEventListener("online", this.boundOnlineHandler);
      window.removeEventListener("offline", this.boundOfflineHandler);
      this.boundOnlineHandler = null;
      this.boundOfflineHandler = null;
    }

    // Reset global handlers
    if (this.isClient) {
      window.onerror = null;
      window.onunhandledrejection = null;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RETRY WRAPPER - Auto-retry failed operations
// ═══════════════════════════════════════════════════════════════════════════════

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    delay?: number;
    backoff?: boolean;
    onRetry?: (attempt: number, error: Error) => void;
  } = {},
): Promise<T> {
  const { maxRetries = 3, delay = 1000, backoff = true, onRetry } = options;
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const waitTime = backoff ? delay * Math.pow(2, attempt - 1) : delay;
        onRetry?.(attempt, lastError);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  throw lastError!;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SAFE WRAPPER - Catch errors and return default
// ═══════════════════════════════════════════════════════════════════════════════

export function safely<T>(operation: () => T, defaultValue: T): T {
  try {
    return operation();
  } catch {
    return defaultValue;
  }
}

export async function safelyAsync<T>(
  operation: () => Promise<T>,
  defaultValue: T,
): Promise<T> {
  try {
    return await operation();
  } catch {
    return defaultValue;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export const selfHealing =
  typeof window !== "undefined" ? SelfHealingSystem.getInstance() : null;

export default SelfHealingSystem;
