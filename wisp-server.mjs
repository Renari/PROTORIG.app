import http from "node:http";
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";

// Configure logging
logging.set_level(logging.INFO);

// Security: only allow connections to the Endfield domain
wisp.options.allow_direct_ip = false;
wisp.options.hostname_whitelist = [
  /^ef-webview\.gryphline\.com$/
];

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("PROTORIG.app wisp proxy is running");
});

server.on("upgrade", (req, socket, head) => {
  wisp.routeRequest(req, socket, head);
});

const PORT = parseInt(process.env.PORT || "5001");
server.listen(PORT, "127.0.0.1", () => {
  logging.info(`Wisp proxy listening on 127.0.0.1:${PORT}`);
});
