import { Database } from "./database.ts";
import { Connection } from "./connection.ts";
import type { PoolOptions } from "./types.ts";

const LBUG_DATABASE_LOCKED_CODE = "LBUG_DATABASE_LOCKED";

function isRetriableInitError(err: unknown): boolean {
  if (err instanceof Error) {
    const code = (err as { code?: string }).code;
    if (code === LBUG_DATABASE_LOCKED_CODE) return true;
    if (err.message?.includes("lbug_database_init failed")) return true;
  }
  return false;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jitteredBackoff(attempt: number, baseMs: number, maxMs: number): number {
  const raw = Math.min(baseMs * Math.pow(2, attempt), maxMs);
  const jitter = 0.5 + Math.random() * 0.5;
  return Math.floor(raw * jitter);
}

/**
 * Connection pool: one shared Database, queue of Connection handles (maxSize).
 * Retries init on lock/transient failure with exponential backoff; optional idle shutdown.
 */
export class Pool {
  private _db: Database;
  private _available: Connection[] = [];
  private _inUse = 0;
  private _maxSize: number;
  private _numThreads: number;
  private _initialized = false;
  private _initRetries: number;
  private _initBackoffMs: number;
  private _initBackoffMaxMs: number;
  private _idleTimeoutMs: number;
  private _idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: PoolOptions) {
    this._maxSize = options.maxSize ?? 10;
    this._numThreads = options.numThreads ?? 1;
    this._initRetries = options.initRetries ?? 5;
    this._initBackoffMs = options.initBackoffMs ?? 10;
    this._initBackoffMaxMs = options.initBackoffMaxMs ?? 2000;
    this._idleTimeoutMs = options.idleTimeoutMs ?? 5000;
    this._db = new Database(options.databasePath);
  }

  /** Initialize shared database (sync). No retry; use init() for retry. */
  initSync(): void {
    if (this._initialized) return;
    this._db.initSync();
    this._initialized = true;
  }

  /** Initialize shared database (async). Retries on lock/transient failure with backoff. */
  async initAsync(): Promise<void> {
    if (this._initialized) return;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this._initRetries; attempt++) {
      try {
        await this._db.initAsync();
        this._initialized = true;
        return;
      } catch (e) {
        lastErr = e;
        if (attempt === this._initRetries || !isRetriableInitError(e)) throw e;
        const ms = jitteredBackoff(attempt, this._initBackoffMs, this._initBackoffMaxMs);
        await delay(ms);
      }
    }
    throw lastErr;
  }

  private _clearIdleTimer(): void {
    if (this._idleTimer !== null) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }
  }

  private _scheduleIdleClose(): void {
    if (this._idleTimeoutMs <= 0 || this._inUse !== 0) return;
    this._clearIdleTimer();
    this._idleTimer = setTimeout(() => {
      this._idleTimer = null;
      if (this._inUse !== 0) return;
      for (const c of this._available) c.closeSync();
      this._available.length = 0;
      this._db.closeSync();
      this._initialized = false;
    }, this._idleTimeoutMs);
  }

  /** Acquire a connection from the pool (creates up to maxSize). */
  async acquireAsync(): Promise<Connection> {
    this._clearIdleTimer();
    await this.initAsync();
    if (this._available.length > 0) {
      const conn = this._available.pop()!;
      this._inUse++;
      return conn;
    }
    if (this._inUse >= this._maxSize) {
      return new Promise((resolve, _reject) => {
        const check = () => {
          if (this._available.length > 0) {
            const conn = this._available.pop()!;
            this._inUse++;
            resolve(conn);
          } else if (this._inUse < this._maxSize) {
            const conn = new Connection(this._db, this._numThreads);
            conn.initSync();
            this._inUse++;
            resolve(conn);
          } else {
            setImmediate(check);
          }
        };
        setImmediate(check);
      });
    }
    const conn = new Connection(this._db, this._numThreads);
    conn.initSync();
    this._inUse++;
    return conn;
  }

  /** Release connection back to the pool. */
  release(conn: Connection): void {
    this._inUse--;
    this._available.push(conn);
    this._scheduleIdleClose();
  }

  /**
   * Run a callback with an acquired connection; releases automatically.
   */
  async runAsync<T>(fn: (conn: Connection) => Promise<T>): Promise<T> {
    const conn = await this.acquireAsync();
    try {
      return await fn(conn);
    } finally {
      this.release(conn);
    }
  }

  closeSync(): void {
    this._clearIdleTimer();
    for (const conn of this._available) {
      conn.closeSync();
    }
    this._available.length = 0;
    this._db.closeSync();
    this._initialized = false;
  }

  async closeAsync(): Promise<void> {
    this._clearIdleTimer();
    for (const conn of this._available) {
      await conn.closeAsync();
    }
    this._available.length = 0;
    await this._db.closeAsync();
    this._initialized = false;
  }
}

export function createPool(options: PoolOptions): Pool {
  return new Pool(options);
}
