const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { listenWithPortFallback } = require("./server-listener.js");

test("listenWithPortFallback uses the requested port when available", async (t) => {
  const server = http.createServer((req, res) => res.end("ok"));
  t.after(() => closeServer(server));

  const result = await listenWithPortFallback(server, { port: 0 });

  assert.equal(result.requestedPort, 0);
  assert.ok(Number.isInteger(result.port));
  assert.ok(result.port > 0);
});

test("listenWithPortFallback tries the next port when the requested port is in use", async (t) => {
  const occupied = http.createServer((req, res) => res.end("occupied"));
  await new Promise((resolve) => occupied.listen(0, "127.0.0.1", resolve));
  t.after(() => closeServer(occupied));

  const occupiedPort = occupied.address().port;
  const server = http.createServer((req, res) => res.end("ok"));
  t.after(() => closeServer(server));

  const result = await listenWithPortFallback(server, {
    host: "127.0.0.1",
    port: occupiedPort,
    maxAttempts: 2,
  });

  assert.equal(result.requestedPort, occupiedPort);
  assert.equal(result.port, occupiedPort + 1);
});

async function closeServer(server) {
  if (!server.listening) {
    return;
  }
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
