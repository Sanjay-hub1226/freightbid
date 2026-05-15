import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

let _socket = null;

function getSocket(token) {
  if (!_socket || !_socket.connected) {
    _socket = io(window.location.origin, {
      auth: { token }, transports: ['websocket','polling'],
      reconnection: true, reconnectionAttempts: 10,
    });
  }
  return _socket;
}

export function useSocket() {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('fb_token');
    if (!token) return;
    const s = getSocket(token);
    socketRef.current = s;
    const onConn = () => setConnected(true);
    const onDisc = () => setConnected(false);
    s.on('connect', onConn);
    s.on('disconnect', onDisc);
    if (s.connected) setConnected(true);
    return () => { s.off('connect', onConn); s.off('disconnect', onDisc); };
  }, []);

  const emit = useCallback((ev, d) => socketRef.current?.emit(ev, d), []);
  const on   = useCallback((ev, h) => socketRef.current?.on(ev, h), []);
  const off  = useCallback((ev, h) => socketRef.current?.off(ev, h), []);

  return { connected, emit, on, off };
}
