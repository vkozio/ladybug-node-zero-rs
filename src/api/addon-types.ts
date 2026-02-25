/**
 * Shared addon API types (Node and browser). Used by addon.ts, addon-browser.ts, addon-wasm-binding.ts.
 */
export interface NativeTopology {
  sources: Int32Array;
  targets: Int32Array;
  dictionary: string[];
}

/** Addon exports use camelCase (napi-rs convention). Async methods return Promise directly. */
export interface AddonBinding {
  databaseCreateSync(path: string): number;
  databaseCreateAsync(path: string): Promise<number>;
  databaseCloseSync(dbHandle: number): void;
  databaseConnectSync(dbHandle: number, numThreads: number): number;
  connectionCloseSync(connHandle: number): void;
  connectionQuerySync(connHandle: number, statement: string): number;
  connectionQueryAsync(connHandle: number, statementHex: string): Promise<number>;
  connectionPrepareSync(connHandle: number, statement: string): number;
  connectionExecuteSync(connHandle: number, psHandle: number, paramsJson: string): number;
  connectionLoadArrowSync(connHandle: number, batchesJson: string, optionsJson: string): void;
  connectionLoadArrowAsync(
    connHandle: number,
    batchesJson: string,
    optionsJson: string,
  ): Promise<void>;
  preparedStatementCloseSync(psHandle: number): void;
  preparedStatementIsSuccessSync(psHandle: number): boolean;
  preparedStatementGetErrorMessageSync(psHandle: number): string;
  queryResultGetArrowSchemaSync(resultHandle: number): string;
  queryResultGetNextArrowChunkSync(resultHandle: number, chunkSize: number): string;
  queryResultGetArrowSchemaBinarySync(resultHandle: number): Uint8Array;
  queryResultGetNextArrowChunkBinarySync(resultHandle: number, chunkSize: number): Uint8Array;
  getAllArrowChunksBinaryAsync(resultHandle: number, chunkSize: number): Promise<Uint8Array[]>;
  queryResultCloseSync(resultHandle: number): void;
  queryResultGetNumTuplesSync(resultHandle: number): number;
  queryResultGetColumnNamesSync(resultHandle: number): string[];
  queryResultGetColumnDataTypesSync(resultHandle: number): string[];
  queryResultHasNextSync(resultHandle: number): boolean;
  queryResultGetNextRowSync(resultHandle: number): string;
  getAllArrowChunksAsync(resultHandle: number, chunkSize: number): Promise<string[]>;
  getTopology(): NativeTopology;
}
