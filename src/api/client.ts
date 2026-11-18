/// <reference types="vite/client" />

/**
 * 统一 API 请求入口。
 * 默认使用同源 /api，由 Vite server.proxy 代理到本地后端；
 * 生产环境可通过 VITE_API_BASE 指向网关。
 */
export const API_BASE_URL = (
  import.meta.env?.VITE_API_BASE ||
  import.meta.env?.VITE_API_BASE_URL ||
  '/api'
).replace(/\/+$/, '') || '/api';

export type ApiErrorCode =
  | 'BACKEND_UNAVAILABLE'
  | 'INVALID_RESPONSE'
  | 'HTTP_ERROR';

export class ApiError extends Error {
  status: number;
  payload: unknown;
  code: ApiErrorCode;

  constructor(
    message: string,
    status: number,
    payload?: unknown,
    code: ApiErrorCode = 'HTTP_ERROR',
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
    this.code = code;
  }
}

type ApiRequestOptions = RequestInit;

function buildUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (API_BASE_URL === '/api' && normalized.startsWith('/api/')) return normalized;
  return `${API_BASE_URL}${normalized}`;
}

function errorMessageFromPayload(payload: unknown) {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (typeof record.message === 'string' && record.message) return record.message;
    if (typeof record.error === 'string' && record.error) return record.error;
  }
  return '';
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { headers, ...rest } = options;
  const token =
    typeof localStorage !== 'undefined' ? localStorage.getItem('fitplan.token') : null;

  let response: Response;
  try {
    response = await fetch(buildUrl(path), {
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
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ApiError(
      '网络异常，请检查后端是否启动',
      0,
      error,
      'BACKEND_UNAVAILABLE',
    );
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = /application\/(?:[\w.+-]+\+)?json\b/i.test(contentType);

  // 后端没起来时，Vite 可能把 /api 请求 fallback 成 index.html。
  // 这里必须先拦住 HTML，绝对不能把字符串当对象继续解析。
  if (!isJson) {
    const preview = await response.text().catch(() => '');
    throw new ApiError(
      '网络异常，请检查后端是否启动',
      502,
      { contentType, preview: preview.slice(0, 120) },
      'BACKEND_UNAVAILABLE',
    );
  }

  const text = await response.text();
  let payload: unknown = undefined;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ApiError(
        '后端返回了无法解析的数据',
        502,
        { preview: text.slice(0, 120) },
        'INVALID_RESPONSE',
      );
    }
  }

  if (!response.ok) {
    const message =
      errorMessageFromPayload(payload) || `请求失败 (${response.status})`;
    throw new ApiError(message, response.status, payload, 'HTTP_ERROR');
  }

  return payload as T;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'BACKEND_UNAVAILABLE') {
      return '网络异常，请检查后端是否启动';
    }
    return error.message || '请求失败，请稍后重试';
  }
  if (error instanceof Error) {
    if (error.name === 'AbortError') return '';
    if (/failed to fetch|networkerror|load failed/i.test(error.message)) {
      return '网络异常，请检查后端是否启动';
    }
    return error.message || '网络异常，请稍后重试';
  }
  return '网络异常，请稍后重试';
}

export function isBackendUnavailable(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'BACKEND_UNAVAILABLE';
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}
