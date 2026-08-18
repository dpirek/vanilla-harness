class SocketService {
  socket = null;

  constructor({ onOpen, onClose, onError, onMessage }) {
    this.handlers = { onOpen, onClose, onError, onMessage };
  }

  get isOpen() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  connect() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    this.socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
    this.socket.addEventListener("open", () => this.handlers.onOpen?.());
    this.socket.addEventListener("close", () => this.handlers.onClose?.());
    this.socket.addEventListener("error", () => this.handlers.onError?.());
    this.socket.addEventListener("message", (event) => {
      try {
        Promise.resolve(this.handlers.onMessage?.(JSON.parse(event.data)))
          .catch((error) => this.handlers.onError?.(error));
      } catch (error) {
        this.handlers.onError?.(error);
      }
    });
  }

  send(payload) {
    if (!this.isOpen) return false;
    this.socket.send(JSON.stringify(payload));
    return true;
  }
}

export default SocketService;
