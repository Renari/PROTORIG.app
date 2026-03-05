import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";

let serverModule;
let options = {};

if (process.env.NODE_ENV !== "production") {
  serverModule = await import("node:http");
  logging.set_level(logging.DEBUG);
} else {
  serverModule = await import("node:https");
  logging.set_level(logging.INFO);
  options = {
    key: fs.readFileSync("/etc/ssl/cloudflare-origin.key"),
    cert: fs.readFileSync("/etc/ssl/cloudflare-origin.pem")
  };
};

// Only allow connections to the Endfield domain
wisp.options.allow_direct_ip = false;
wisp.options.hostname_whitelist = [
  /^ef-webview\.gryphline\.com$/
];

const server = serverModule.createServer(options, (req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("PROTORIG.app wisp proxy is running");
});

server.on("upgrade", (req, socket, head) => {
  wisp.routeRequest(req, socket, head);
});

const PORT = parseInt(process.env.PORT || "5001");
server.listen(PORT, process.env.HOST || "127.0.0.1", () => {
  logging.info(`Wisp proxy listening on ${process.env.HOST || "127.0.0.1"}:${PORT}`);
});
