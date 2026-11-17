/// <reference types="vite/client" />

// 统一 API 请求入口。
// base 优先级：fitplan.api（现有项目运行时配置）> VITE_API_BASE_URL > VITE_API_BASE > 同源 /api。
const runtimeBase =
  typeof localStorage !== 'undefined' ? (localStorage.getItem('fitplan.api') ?? '').trim() : '';

export const API_BASE_URL = (
  runtimeBase ||
  import.meta.env?.VITE_API_BASE_URL ||
  import.meta.env?.VITE_API_BASE ||
  '/api'
).replace(/\/+$/, '');

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

type ApiRequestOptions = RequestInit;

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { headers, ...rest } = options;
  const token =
    typeof localStorage !== 'undefined' ? localStorage.getItem('fitplan.token') : null;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    // 兼容 Cookie 会话；如果项目使用 Bearer Token，会自动读取 fitplan.token。
    credentials: 'include',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
  });

  const text = await response.text();
  let payload: unknown = undefined;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    let message = `请求失败 (${response.status})`;
    if (payload && typeof payload === 'object') {
      const record = payload as Record<string, unknown>;
      if (typeof record.message === 'string' && record.message) message = record.message;
      else if (typeof record.error === 'string' && record.error) message = record.error;
    }
    throw new ApiError(message, response.status, payload);
  }

  if (response.status === 204 || !text) return undefined as T;
  return payload as T;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) {
    if (error.name === 'AbortError') return '';
    return error.message || '网络异常，请稍后重试';
  }
  return '网络异常，请稍后重试';
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}
