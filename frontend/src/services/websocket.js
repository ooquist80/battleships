const DEFAULT_WS_URL = 'ws://localhost:8000/ws';
const PROXY_WS_PATH = '/ws';
const SESSION_ID_STORAGE_KEY = 'battleships.session_id';
const SESSION_ID_QUERY_PARAM = 'session_id';

function normalizeSessionId(value) {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}

function generateSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function readStoredSessionId() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  try {
    return normalizeSessionId(window.localStorage.getItem(SESSION_ID_STORAGE_KEY));
  } catch {
    return null;
  }
}

function persistSessionId(sessionId) {
  if (typeof window === 'undefined' || !window.localStorage || !sessionId) {
    return;
  }

  try {
    window.localStorage.setItem(SESSION_ID_STORAGE_KEY, sessionId);
  } catch {
    // Ignore storage write errors (private mode / quota)
  }
}

function resolveClientSessionId() {
  const existing = readStoredSessionId();
  if (existing) {
    return existing;
  }

  const generated = generateSessionId();
  persistSessionId(generated);
  return generated;
}

function resolveWsBaseForRelativeUrls() {
  if (typeof window === 'undefined' || !window.location?.host) {
    return DEFAULT_WS_URL;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}

function buildSessionAwareUrl(url, sessionId) {
  const normalizedUrl = String(url ?? '').trim();
  const baseUrl = normalizedUrl.length > 0 ? normalizedUrl : resolveWsUrl();

  if (!sessionId) {
    return baseUrl;
  }

  try {
    const hasProtocol = /^[a-z][a-z\d+.-]*:/i.test(baseUrl);
    const parsedUrl = hasProtocol
      ? new URL(baseUrl)
      : new URL(baseUrl, resolveWsBaseForRelativeUrls());
    parsedUrl.searchParams.set(SESSION_ID_QUERY_PARAM, sessionId);
    return parsedUrl.toString();
  } catch {
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}${SESSION_ID_QUERY_PARAM}=${encodeURIComponent(sessionId)}`;
  }
}

function resolveProductionWsUrl() {
  if (typeof window === 'undefined' || !window.location?.host) {
    return DEFAULT_WS_URL;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${PROXY_WS_PATH}`;
}

function resolveWsUrl() {
  const envUrl = import.meta.env.VITE_WS_URL;
  if (typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return envUrl.trim();
  }

  if (import.meta.env.PROD) {
    return resolveProductionWsUrl();
  }

  return DEFAULT_WS_URL;
}

class WebSocketService {
  constructor() {
    this.baseUrl = resolveWsUrl();
    this.sessionId = resolveClientSessionId();
    this.url = buildSessionAwareUrl(this.baseUrl, this.sessionId);
    this.socket = null;
    this.listeners = new Map();
  }

  setSessionId(sessionId) {
    const normalizedSessionId = normalizeSessionId(sessionId);
    if (!normalizedSessionId) {
      return;
    }

    this.sessionId = normalizedSessionId;
    persistSessionId(normalizedSessionId);
    this.url = buildSessionAwareUrl(this.baseUrl, this.sessionId);
  }

  connect(url = this.baseUrl) {
    const currentState = this.socket?.readyState;
    if (currentState === WebSocket.OPEN || currentState === WebSocket.CONNECTING) {
      return;
    }

    this.baseUrl = url || resolveWsUrl();
    this.url = buildSessionAwareUrl(this.baseUrl, this.sessionId);
    this.socket = new WebSocket(this.url);

    this.socket.addEventListener('open', (event) => {
      this.emit('open', event);
    });

    this.socket.addEventListener('close', (event) => {
      this.emit('close', event);
    });

    this.socket.addEventListener('error', (event) => {
      this.emit('error', event);
    });

    this.socket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(event.data);
        const sessionIdFromServer = normalizeSessionId(
          payload?.session_id ?? payload?.sessionId ?? payload?.client_session_id ?? payload?.clientSessionId,
        );
        if (sessionIdFromServer && sessionIdFromServer !== this.sessionId) {
          this.setSessionId(sessionIdFromServer);
        }

        this.emit('message', payload);

        if (payload?.type) {
          this.emit(payload.type, payload);
        }
      } catch (error) {
        this.emit('error', error);
      }
    });
  }

  isOpen() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  send(payload) {
    if (!this.isOpen()) {
      return false;
    }

    this.socket.send(JSON.stringify(payload));
    return true;
  }

  close(code = 1000, reason = 'Client closed') {
    if (!this.socket) {
      return;
    }

    this.socket.close(code, reason);
  }

  on(eventName, handler) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    this.listeners.get(eventName).add(handler);
    return () => this.off(eventName, handler);
  }

  off(eventName, handler) {
    const handlers = this.listeners.get(eventName);
    if (!handlers) {
      return;
    }

    handlers.delete(handler);
    if (handlers.size === 0) {
      this.listeners.delete(eventName);
    }
  }

  emit(eventName, payload) {
    const handlers = this.listeners.get(eventName);
    if (!handlers) {
      return;
    }

    handlers.forEach((handler) => {
      handler(payload);
    });
  }
}

const websocketService = new WebSocketService();

export default websocketService;
