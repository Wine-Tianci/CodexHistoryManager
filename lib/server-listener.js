function listenWithPortFallback(server, { port, host, maxAttempts = 10 } = {}) {
  const requestedPort = normalizePort(port);
  const attempts = Math.max(1, Number(maxAttempts) || 1);

  return new Promise((resolve, reject) => {
    let attempt = 0;

    function tryListen(nextPort) {
      const onError = (error) => {
        server.off("listening", onListening);
        if (error?.code === "EADDRINUSE" && nextPort !== 0 && attempt < attempts - 1) {
          attempt += 1;
          tryListen(nextPort + 1);
          return;
        }
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        const address = server.address();
        resolve({
          requestedPort,
          port: address && typeof address === "object" ? address.port : nextPort,
        });
      };

      server.once("error", onError);
      server.once("listening", onListening);
      if (host) {
        server.listen(nextPort, host);
      } else {
        server.listen(nextPort);
      }
    }

    tryListen(requestedPort);
  });
}

function normalizePort(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    return 4173;
  }
  return parsed;
}

module.exports = {
  listenWithPortFallback,
};
