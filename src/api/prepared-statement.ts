import { getAddon } from "./addon.ts";

/**
 * Prepared statement handle. From Connection.prepareSync(statement).
 * executeSync(params) returns QueryResult (via addon connectionExecuteSync).
 */
export class PreparedStatement {
  private _connHandle: number;
  private _handle: number;
  private _closed = false;

  constructor(connHandle: number, psHandle: number) {
    this._connHandle = connHandle;
    this._handle = psHandle;
  }

  get handle(): number {
    return this._handle;
  }

  isSuccess(): boolean {
    if (this._closed) return false;
    return getAddon().preparedStatementIsSuccessSync(this._handle);
  }

  getErrorMessage(): string {
    if (this._closed) return "PreparedStatement already closed";
    return getAddon().preparedStatementGetErrorMessageSync(this._handle);
  }

  closeSync(): void {
    if (this._closed) return;
    getAddon().preparedStatementCloseSync(this._handle);
    this._closed = true;
  }

  /** Internal: execute and return result handle (Connection calls this). */
  executeSyncInternal(paramsJson: string): number {
    if (this._closed) throw new Error("PreparedStatement already closed");
    return getAddon().connectionExecuteSync(this._connHandle, this._handle, paramsJson);
  }
}
