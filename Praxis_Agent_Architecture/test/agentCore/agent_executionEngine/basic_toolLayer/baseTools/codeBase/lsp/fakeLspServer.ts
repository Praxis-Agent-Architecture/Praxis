export function fakeLspServerSource(resultsByMethod: Readonly<Record<string, unknown>>): string {
  return `
const resultsByMethod = ${JSON.stringify(resultsByMethod)};
let buffer = Buffer.alloc(0);
function send(id, result) {
  const body = JSON.stringify({ jsonrpc: "2.0", id, result });
  process.stdout.write("Content-Length: " + Buffer.byteLength(body, "utf8") + "\\r\\n\\r\\n" + body);
}
function drain() {
  const separator = Buffer.from("\\r\\n\\r\\n");
  while (true) {
    const headerEnd = buffer.indexOf(separator);
    if (headerEnd === -1) return;
    const header = buffer.subarray(0, headerEnd).toString("utf8");
    const match = header.match(/Content-Length:\\s*(\\d+)/i);
    if (!match) throw new Error("missing length");
    const start = headerEnd + separator.length;
    const end = start + Number(match[1]);
    if (buffer.length < end) return;
    const message = JSON.parse(buffer.subarray(start, end).toString("utf8"));
    buffer = buffer.subarray(end);
    if (message.method === "initialize") {
      send(message.id, { capabilities: {} });
    } else if (Object.prototype.hasOwnProperty.call(resultsByMethod, message.method)) {
      send(message.id, resultsByMethod[message.method]);
    } else if (message.method === "shutdown") {
      send(message.id, null);
    } else if (message.method === "exit") {
      process.exit(0);
    }
  }
}
process.stdin.on("data", chunk => {
  buffer = Buffer.concat([buffer, chunk]);
  drain();
});
`;
}
