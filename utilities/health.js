const FAILURE_THRESHOLD = 3;

// Alerts once after repeated failures, once on recovery.
class Health {
  constructor({ logger, notify, threshold = FAILURE_THRESHOLD }) {
    this.logger = logger;
    this.notify = notify;
    this.threshold = threshold;
    this.failures = new Map();
    this.down = new Set();
  }

  async fail(key, error) {
    const count = (this.failures.get(key) || 0) + 1;
    this.failures.set(key, count);
    this.logger.logMessage(`[ ERROR ] ${key} failed (${count} in a row)`, error);
    if (count !== this.threshold) return;
    this.down.add(key);
    await this.notify({ key, down: true, count, error });
  }

  async ok(key) {
    this.failures.delete(key);
    if (!this.down.delete(key)) return;
    this.logger.logMessage(`[ SUCCESS ] ${key} recovered`);
    await this.notify({ key, down: false });
  }

  status() {
    return Object.fromEntries(this.failures);
  }
}

module.exports = Health;
