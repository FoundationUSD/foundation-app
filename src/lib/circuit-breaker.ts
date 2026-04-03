/**
 * Circuit Breaker — Emergency pause for deposits and withdrawals.
 *
 * Three states:
 *   CLOSED   — Normal operation, requests flow through
 *   OPEN     — Requests blocked, returns 503
 *   HALF_OPEN — Testing recovery, limited requests allowed
 *
 * Controls:
 *   1. Environment variables: DEPOSITS_ENABLED, WITHDRAWALS_ENABLED
 *   2. Consecutive failure counting (auto-pause after threshold)
 *   3. Manual reset via environment or admin endpoint
 */

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreakerConfig {
  name: string;
  failureThreshold: number; // consecutive failures before opening
  recoveryTimeoutMs: number; // how long before attempting recovery
}

interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number;
  lastStateChange: number;
}

class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: CircuitBreakerState;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
    this.state = {
      state: "CLOSED",
      failureCount: 0,
      lastFailureTime: 0,
      lastStateChange: Date.now(),
    };
  }

  /**
   * Check if requests are allowed through.
   * Returns false if circuit is OPEN (blocked).
   */
  canProceed(): boolean {
    // Check environment variable override first
    const envVar = this.config.name === "deposits" ? "DEPOSITS_ENABLED" : "WITHDRAWALS_ENABLED";
    if (process.env[envVar] === "false" || process.env[envVar] === "0") {
      if (this.state.state !== "OPEN") {
        this.transitionState("OPEN", `Environment variable ${envVar}=false`);
      }
      return false;
    }

    switch (this.state.state) {
      case "CLOSED":
        return true;

      case "OPEN": {
        const timeSinceLastFailure = Date.now() - this.state.lastFailureTime;
        if (timeSinceLastFailure >= this.config.recoveryTimeoutMs) {
          this.transitionState("HALF_OPEN", "Recovery timeout elapsed, testing");
          return true;
        }
        return false;
      }

      case "HALF_OPEN":
        return true;

      default:
        return false;
    }
  }

  /**
   * Record a successful operation.
   * Resets failure count and closes circuit if half-open.
   */
  onSuccess(): void {
    if (this.state.state === "HALF_OPEN") {
      this.transitionState("CLOSED", "Successful request during recovery");
    }
    this.state.failureCount = 0;
  }

  /**
   * Record a failed operation.
   * Opens circuit if failure threshold reached.
   */
  onFailure(): void {
    this.state.failureCount++;
    this.state.lastFailureTime = Date.now();

    if (this.state.failureCount >= this.config.failureThreshold) {
      this.transitionState("OPEN", `Failure threshold reached (${this.state.failureCount})`);
    }
  }

  /**
   * Force open the circuit (emergency pause).
   */
  forceOpen(reason: string): void {
    this.transitionState("OPEN", `Manual: ${reason}`);
  }

  /**
   * Force close the circuit (manual reset).
   */
  forceClose(): void {
    this.state.failureCount = 0;
    this.transitionState("CLOSED", "Manual reset");
  }

  /**
   * Get current status for monitoring.
   */
  getStatus(): {
    state: CircuitState;
    failureCount: number;
    canProceed: boolean;
    timeSinceLastFailure: number;
  } {
    return {
      state: this.state.state,
      failureCount: this.state.failureCount,
      canProceed: this.canProceed(),
      timeSinceLastFailure: Date.now() - this.state.lastFailureTime,
    };
  }

  private transitionState(newState: CircuitState, reason: string): void {
    const oldState = this.state.state;
    this.state.state = newState;
    this.state.lastStateChange = Date.now();

    if (newState === "CLOSED") {
      this.state.failureCount = 0;
    }

    console.warn(
      `[CircuitBreaker:${this.config.name}] ${oldState} → ${newState}: ${reason}`,
    );
  }
}

// Global instances
export const depositBreaker = new CircuitBreaker({
  name: "deposits",
  failureThreshold: 3, // auto-pause after 3 consecutive failures
  recoveryTimeoutMs: 5 * 60 * 1000, // 5 minutes before retry
});

export const withdrawBreaker = new CircuitBreaker({
  name: "withdrawals",
  failureThreshold: 3,
  recoveryTimeoutMs: 5 * 60 * 1000,
});

export type { CircuitState };
