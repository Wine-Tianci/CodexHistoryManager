const { StringDecoder } = require("node:string_decoder");

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload ?? {});
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(body));
  res.end(body);
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const decoder = new StringDecoder("utf8");
    let buffer = "";
    req.on("data", (chunk) => {
      buffer += decoder.write(chunk);
    });
    req.on("end", () => {
      buffer += decoder.end();
      if (!buffer) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(buffer));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

module.exports = {
  sendJson,
  sendError,
  readJsonBody,
};
