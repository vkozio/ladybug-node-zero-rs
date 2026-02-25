import { getAddon } from "./addon.ts";

export interface DatabaseOptions {
  path: string;
}

function enrichDatabaseInitError(err: unknown, path: string, callerStack?: string): Error {
  const msg = err instanceof Error ? err.message : String(err);
  const code = err instanceof Error && "code" in err ? (err as { code?: string }).code : undefined;
  const enriched = new Error(`${msg}\nDatabase path: ${path}`, {
    cause: err instanceof Error ? err : undefined,
  });
  if (code !== undefined) (enriched as { code?: string }).code = code;
  if (callerStack) {
    enriched.stack = `${enriched.name}: ${enriched.message}\n${callerStack}`;
  }
  return enriched;
}

/**
 * Database handle. init()/initSync() create native DB; close()/closeSync() release it.
 */
export class Database {
  readonly path: string;
  private _handle: number | null = null;

  constructor(path: string, _options?: DatabaseOptions) {
    this.path = path;
  }

  get handle(): number | null {
    return this._handle;
  }

  /** Async init: uses databaseCreateAsync. */
  async initAsync(): Promise<void> {
    const addon = getAddon();
    const callerStack = new Error().stack?.replace(/^Error\n/, "");
    try {
      this._handle = await addon.databaseCreateAsync(this.path);
    } catch (e) {
      throw enrichDatabaseInitError(e, this.path, callerStack);
    }
  }

  /** Sync init: uses databaseCreateSync (blocks main thread). */
  initSync(): void {
    const addon = getAddon();
    try {
      this._handle = addon.databaseCreateSync(this.path);
    } catch (e) {
      throw enrichDatabaseInitError(e, this.path);
    }
  }

  /** Async close: delegates to closeSync (addon has no async close). */
  async closeAsync(): Promise<void> {
    this.closeSync();
  }

  /** Sync close: databaseCloseSync. */
  closeSync(): void {
    if (this._handle === null) return;
    const addon = getAddon();
    addon.databaseCloseSync(this._handle);
    this._handle = null;
  }
}
