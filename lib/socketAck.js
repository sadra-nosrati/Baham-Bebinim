export function emitWithAckTimeout(socket, event, payload, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) {
      const error = new Error('socket-disconnected');
      error.code = 'disconnected';
      reject(error);
      return;
    }

    socket.timeout(timeoutMs).emit(event, payload, (error, response) => {
      if (error) {
        const timeoutError = new Error('socket-ack-timeout');
        timeoutError.code = 'timeout';
        reject(timeoutError);
        return;
      }
      resolve(response);
    });
  });
}
