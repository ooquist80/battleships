const DEFAULT_WS_URL = 'ws://localhost:8000/ws';
const PROXY_WS_PATH = '/ws';

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
    this.url = resolveWsUrl();
    this.socket = null;
    this.listeners = new Map();
  }

  connect(url = this.url) {
    const currentState = this.socket?.readyState;
    if (currentState === WebSocket.OPEN || currentState === WebSocket.CONNECTING) {
      return;
    }

    this.url = url || resolveWsUrl();
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
