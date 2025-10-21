// server.js - Bun server (ESM)
// Serves static files from ./public and provides /api/key-check and /api/bypass
// Uses Bun.env.VORTEX_API_KEY (falls back to process.env)

import fs from "fs";
import path from "path";

const PUBLIC_DIR = path.join(import.meta.dir || process.cwd(), "public");
const PORT = Number(process.env.PORT || Bun.env?.PORT || 3000);

// helper to read file safely
function readPublicFile(relPath) {
  try {
    const full = path.join(PUBLIC_DIR, relPath);
    if (!full.startsWith(PUBLIC_DIR)) return null;
    return Bun.file(full);
  } catch (e) {
    return null;
  }
}

// simple mime map
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".map": "application/json"
};

// get env key
function getKey() {
  // Bun.env is preferred, but fallback to process.env
  return (typeof Bun !== "undefined" && Bun.env && Bun.env.VORTEX_API_KEY) || process.env.VORTEX_API_KEY || "";
}

function textResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

async function handleBypass(req) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }

  const key = getKey();
  if (!key) {
    return textResponse({ ok: false, error: "Server misconfiguration: VORTEX_API_KEY missing" }, 500);
  }

  let targetUrl = null;
  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      targetUrl = url.searchParams.get("url");
    } else {
      const ct = req.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const body = await req.json().catch(()=>null);
        targetUrl = body && body.url ? body.url : null;
      } else {
        // Form / fallback
        const form = await req.formData().catch(()=>null);
        if (form) targetUrl = form.get("url");
      }
    }
  } catch (e) {
    return textResponse({ ok: false, error: "Failed to parse request" }, 400);
  }

  if (!targetUrl || typeof targetUrl !== "string") {
    return textResponse({ ok: false, error: "Missing url parameter" }, 400);
  }

  const generalAPIs = ["work.ink", "linkvertise", "link-unlocker.com"];
  const v2APIs = ["pandadevelopment.net", "keyrblx.com", "krnl.cat"];

  let apiUrl = "";
  let useV2 = false;
  if (generalAPIs.some(d => targetUrl.includes(d))) {
    apiUrl = `https://trw.lat/api/bypass?url=${encodeURIComponent(targetUrl)}`;
  } else if (v2APIs.some(d => targetUrl.includes(d))) {
    apiUrl = `https://trw.lat/api/v2/bypass?url=${encodeURIComponent(targetUrl)}`;
    useV2 = true;
  } else {
    return textResponse({ ok: false, error: "Unsupported URL" }, 400);
  }

  try {
    const start = Date.now();
    const initRes = await fetch(apiUrl, { headers: { "x-api-key": key } });
    const initText = await initRes.text().catch(()=>null);
    let initJson = null;
    try { initJson = initText ? JSON.parse(initText) : null; } catch(e) { initJson = null; }

    if (!initRes.ok) {
      return textResponse({ ok: false, error: `Upstream returned ${initRes.status}`, upstream: initJson || initText }, 502);
    }

    if (useV2 && initJson && initJson.ThreadID) {
      const threadId = initJson.ThreadID;
      const pollUrl = `https://trw.lat/api/v2/threadcheck?id=${encodeURIComponent(threadId)}`;
      const maxAttempts = 120;
      const delayMs = 500;
      let attempts = 0;

      while (attempts < maxAttempts) {
        attempts++;
        const p = await fetch(pollUrl, { headers: { "x-api-key": key } });
        const pt = await p.text().catch(()=>null);
        let pj = null;
        try { pj = pt ? JSON.parse(pt) : null; } catch(e){ pj = null; }

        if (p.ok && pj) {
          if (pj.status === "Done" && pj.result) {
            const elapsed = Date.now() - start;
            return textResponse({ ok: true, result: pj.result, elapsedMs: elapsed }, 200);
          }
          if (pj.status === "Error" || pj.error) {
            return textResponse({ ok: false, error: pj.error || "Thread returned error", upstream: pj }, 502);
          }
        }

        // wait
        await new Promise(r => setTimeout(r, delayMs));
      }

      return textResponse({ ok: false, error: "Timed out waiting for thread result" }, 504);
    }

    if (initJson && initJson.result) {
      const elapsed = Date.now() - start;
      return textResponse({ ok: true, result: initJson.result, elapsedMs: elapsed }, 200);
    }

    return textResponse({ ok: false, error: "Unexpected response shape from upstream", upstream: initJson || initText }, 502);
  } catch (err) {
    return textResponse({ ok: false, error: String(err) }, 500);
  }
}

function keyCheckResponse() {
  const configured = !!getKey();
  return textResponse({ ok: true, configured }, 200);
}

function serveStaticFile(urlPath) {
  // sanitize and map root to index.html
  let p = urlPath.split("?")[0].replace(/\/+$/, "");
  if (p === "") p = "/";

  // Map to public files
  if (p === "/") p = "/index.html";

  const rel = p.startsWith("/") ? p.slice(1) : p;
  const file = readPublicFile(rel);
  if (!file) return null;

  const ext = path.extname(rel).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  return new Response(file.stream(), {
    status: 200,
    headers: { "Content-Type": type }
  });
}

console.log(`Starting Bun server on port ${PORT}... (public: ${PUBLIC_DIR})`);

Bun.serve({
  port: PORT,
  async fetch(req) {
    try {
      const url = new URL(req.url);
      const pathname = url.pathname;

      // API routes
      if (pathname === "/api/key-check") {
        return keyCheckResponse();
      }
      if (pathname === "/api/bypass") {
        return await handleBypass(req);
      }

      // Serve static from /public
      const fileResp = serveStaticFile(pathname);
      if (fileResp) return fileResp;

      // fallback index.html for SPA routes
      const indexFile = readPublicFile("index.html");
      if (indexFile) {
        return new Response(indexFile.stream(), {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" }
        });
      }

      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error("Server error:", err);
      return new Response("Internal Server Error", { status: 500 });
    }
  }
});
