/**
 * JSON-RPC 2.0 Protocol — message parsing, serialization, and types.
 */

// ── Types ──

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
  id?: string | number;
}

export interface JsonRpcSuccessResponse {
  jsonrpc: '2.0';
  result: unknown;
  id: string | number;
}

export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
  id: string | number | null;
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;
export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse;

// ── Standard Error Codes ──

export const RPC_PARSE_ERROR = -32700;
export const RPC_INVALID_REQUEST = -32600;
export const RPC_METHOD_NOT_FOUND = -32601;
export const RPC_INVALID_PARAMS = -32602;
export const RPC_INTERNAL_ERROR = -32603;

// ── Helpers ──

export function createRequest(method: string, params?: unknown, id?: string | number): JsonRpcRequest {
  return {
    jsonrpc: '2.0',
    method,
    ...(params !== undefined && { params }),
    ...(id !== undefined && { id }),
  };
}

export function createNotification(method: string, params?: unknown): JsonRpcRequest {
  return {
    jsonrpc: '2.0',
    method,
    ...(params !== undefined && { params }),
  };
}

export function createSuccessResponse(id: string | number, result: unknown): JsonRpcSuccessResponse {
  return { jsonrpc: '2.0', result, id };
}

export function createErrorResponse(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcErrorResponse {
  return {
    jsonrpc: '2.0',
    error: { code, message, ...(data !== undefined && { data }) },
    id,
  };
}

/**
 * Parse a JSON-RPC message from a string.
 * Returns null if the string is not valid JSON-RPC.
 */
export function parseMessage(raw: string): JsonRpcMessage | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed['jsonrpc'] !== '2.0') return null;
    return parsed as unknown as JsonRpcMessage;
  } catch {
    return null;
  }
}

export function serializeMessage(msg: JsonRpcMessage): string {
  return JSON.stringify(msg);
}

export function isRequest(msg: JsonRpcMessage): msg is JsonRpcRequest {
  return 'method' in msg;
}

export function isResponse(msg: JsonRpcMessage): msg is JsonRpcResponse {
  return 'result' in msg || 'error' in msg;
}

export function isNotification(msg: JsonRpcMessage): boolean {
  return isRequest(msg) && msg.id === undefined;
}
