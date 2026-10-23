// Local test server: mimics Vercel (serves index.html, routes /api/ai).
// Run: GEMINI_API_KEY=... node dev-server.js
import http from "node:http";
import { readFile } from "node:fs/promises";
import handler from "./api/ai.js";

http.createServer(async (req, res) => {
  if (req.url.startsWith("/api/ai")) {
    let raw = "";
    for await (const c of req) raw += c;
    req.body = raw ? JSON.parse(raw) : {};
    res.status = code => { res.statusCode = code; return res; };
    res.json = obj => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(obj)); };
    return handler(req, res);
  }
  res.setHeader("Content-Type", "text/html");
  res.end(await readFile(new URL("./index.html", import.meta.url)));
}).listen(3000, () => console.log("http://localhost:3000"));
