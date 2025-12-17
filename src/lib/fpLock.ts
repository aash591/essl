/**
 * Fingerprint Operation Lock Manager
 * Ensures only one FP read/write operation happens at a time
 */

class FPLockManager {
  private locks: Map<string, Promise<void>> = new Map();

  /**
   * Acquire a lock for a fingerprint operation
   * @param key Unique key for the operation (e.g., "read:userId:deviceId" or "write:userId:deviceId")
   * @returns Promise that resolves when lock is acquired
   */
  async acquire(key: string): Promise<() => void> {
    // Wait for any existing lock with the same key to complete
    while (this.locks.has(key)) {
      await this.locks.get(key);
    }

    // Create a new lock promise
    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    this.locks.set(key, lockPromise);

    // Return release function
    return () => {
      this.locks.delete(key);
      releaseLock!();
    };
  }

  /**
   * Acquire a global lock for any FP operation
   * This ensures only one FP operation happens at a time across all users/devices
   */
  async acquireGlobal(): Promise<() => void> {
    return this.acquire('global');
  }

  /**
   * Check if a lock is currently active
   */
  isLocked(key: string): boolean {
    return this.locks.has(key);
  }
}

// Singleton instance
export const fpLock = new FPLockManager();
