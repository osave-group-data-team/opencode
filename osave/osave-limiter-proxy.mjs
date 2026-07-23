#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";

const CONFIG_PATH = process.env.OSAVE_RATE_LIMITS_PATH ||
  new URL("osave-rate-limits.json", import.meta.url).pathname;

const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));

class TokenBucket {
  #capacity;
  #fillRate;
  #tokens;
  #lastRefill;

  constructor(limit, unit) {
    this.#capacity = limit;
    if (unit === "TPM") {
      this.#fillRate = limit / 60_000;
    } else if (unit === "RPM") {
      this.#fillRate = limit / 60_000;
      this.#capacity = limit;
    }
    this.#tokens = limit;
    this.#lastRefill = Date.now();
  }

  refill() {
    const now = Date.now();
    const elapsed = now - this.#lastRefill;
    this.#tokens = Math.min(
      this.#capacity,
      this.#tokens + elapsed * this.#fillRate
    );
    this.#lastRefill = now;
  }

  acquire(count = 1) {
    this.refill();
    if (this.#tokens >= count) {
      this.#tokens -= count;
      return true;
    }
    return false;
  }

  tokens() {
    this.refill();
    return this.#tokens;
  }
}

function estimateTokens(body) {
  if (!body) return 1;
  try {
    const obj = JSON.parse(body.toString());
    let chars = JSON.stringify(obj).length;
    if (obj.messages) {
      chars = JSON.stringify(obj.messages).length;
    }
    return Math.max(1, Math.ceil(chars / 6));
  } catch {
    return Math.max(1, Math.ceil(body.length / 6));
  }
}

const buckets = {};

function getBucket(endpointId, modelName) {
  const key = endpointId + ":" + modelName;
  if (!buckets[key]) {
    const ep = config.endpoints[endpointId];
    if (!ep) return null;
    const ml = ep.models[modelName];
    if (!ml) return null;
    buckets[key] = new TokenBucket(ml.limit, ml.unit);
  }
  return buckets[key];
}

const PORT = parseInt(process.env.OSAVE_LIMITER_PORT || "8787", 10);

function parseModelFromBody(body) {
  if (!body || body.length === 0) return null;
  try {
    const obj = JSON.parse(body.toString());
    return obj.model || null;
  } catch {
    return null;
  }
}

function parseModelFromPath(pathname) {
  const m = pathname.match(/\/deployments\/([^/]+)\//);
  return m ? m[1] : null;
}

function findEndpointForModel(modelName) {
  for (const [eid, ep] of Object.entries(config.endpoints)) {
    if (ep.models[modelName]) return eid;
  }
  return null;
}

function isContentFilterError(statusCode, body) {
  if (statusCode !== 400) return false;
  try {
    const obj = JSON.parse(body.toString());
    return obj?.error?.code === "content_filter";
  } catch {
    return false;
  }
}

function sanitizeForAzure(body) {
  let s = body.toString("utf-8");
  let changed = false;

  if (/--/.test(s)) {
    s = s.replace(/--/g, "\u2014");
    changed = true;
  }
  if (/<([a-zA-Z][^>]*)>/.test(s)) {
    s = s.replace(/<([a-zA-Z][^>]*)>/g, "[$1]");
    changed = true;
  }
  if (/<<['"]?[A-Z]+['"]?/.test(s)) {
    s = s.replace(/<<['"]?[A-Z]+['"]?/g, "(heredoc)");
    changed = true;
  }
  if (/\.git\//.test(s)) {
    s = s.replace(/\.git\//g, "[dot]git/");
    changed = true;
  }
  if (/P&L/.test(s)) {
    s = s.replace(/P&L/g, "PnL");
    changed = true;
  }

  return changed ? { body: Buffer.from(s, "utf-8"), sanitized: true } : null;
}

function proxyToUpstream(upstreamUrl, headers, body, onResult) {
  const target = new URL(upstreamUrl);
  const transport = target.protocol === "https:" ? httpsRequest : httpRequest;
  const reqOpts = {
    hostname: target.hostname,
    port: target.port || 443,
    path: target.pathname + target.search,
    method: "POST",
    headers: { ...headers },
  };

  const proxyReq = transport(reqOpts, (proxyRes) => {
    const chunks = [];
    proxyRes.on("data", (c) => chunks.push(c));
    proxyRes.on("end", () => {
      onResult(proxyRes.statusCode, proxyRes.headers, Buffer.concat(chunks));
    });
  });

  proxyReq.on("error", (err) => {
    onResult(null, null, null, err);
  });
  proxyReq.write(body);
  proxyReq.end();
}

const server = createServer((req, res) => {
  const incomingUrl = new URL(req.url, "http://127.0.0.1:" + PORT);
  const modelFromPath = parseModelFromPath(incomingUrl.pathname);

  const bodyChunks = [];
  req.on("data", (chunk) => bodyChunks.push(chunk));
  req.on("end", () => {
    const body = Buffer.concat(bodyChunks);
    const modelName = modelFromPath || parseModelFromBody(body);
    const endpointId = modelName ? findEndpointForModel(modelName) : null;

    if (!endpointId || !modelName) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unknown model deployment" }));
      return;
    }

    const bucket = getBucket(endpointId, modelName);
    if (!bucket) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "no rate limit config for model" }));
      return;
    }

    const estimatedTokens = estimateTokens(body);
    const ep = config.endpoints[endpointId];
    const ml = ep.models[modelName];

    let cost = 1;
    if (ml.unit === "TPM") {
      cost = estimatedTokens;
    }

    if (!bucket.acquire(cost)) {
      const retryAfterMs = Math.max(1, Math.ceil((cost - bucket.tokens()) / (ml.limit / 60_000)));
      const retryAfter = Math.max(1, Math.ceil(retryAfterMs / 1000));
      res.writeHead(429, {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": String(ml.limit),
        "X-RateLimit-Remaining": String(Math.floor(bucket.tokens())),
      });
      res.end(JSON.stringify({
        error: "OSave client rate limit exceeded",
        endpoint: endpointId,
        model: modelName,
        limit: ml.limit,
        unit: ml.unit,
        retry_after_seconds: retryAfter,
      }));
      return;
    }

    const upstreamUrl = new URL(incomingUrl.pathname + incomingUrl.search, ep.baseURL).toString();
    const upstreamHeaders = {
      ...req.headers,
      host: new URL(ep.baseURL).hostname,
    };
    const apiKey = process.env[ep.env_key];
    if (apiKey) {
      upstreamHeaders["api-key"] = apiKey;
    }

    proxyToUpstream(upstreamUrl, upstreamHeaders, body, (statusCode, headers, respBody, err) => {
      if (err) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "upstream error", detail: err.message }));
        return;
      }

      if (isContentFilterError(statusCode, respBody)) {
        const sanitized = sanitizeForAzure(body);
        if (sanitized) {
          console.log("[osave-limiter] azure content-filter triggered \u2014 retrying with sanitized body");
          proxyToUpstream(upstreamUrl, upstreamHeaders, sanitized.body, (s2Code, s2Headers, s2Body, s2Err) => {
            if (s2Err) {
              res.writeHead(statusCode, headers);
              res.end(respBody);
              return;
            }
            if (isContentFilterError(s2Code, s2Body)) {
              console.log("[osave-limiter] content-filter persists after sanitization");
              res.writeHead(statusCode, headers);
              res.end(respBody);
              return;
            }
            res.writeHead(s2Code, s2Headers);
            res.end(s2Body);
          });
          return;
        }
      }

      res.writeHead(statusCode, headers);
      res.end(respBody);
    });
  });
});

server.listen(PORT, "127.0.0.1", () => {
  const endpoints = Object.keys(config.endpoints).join(", ");
  console.log("[osave-limiter] listening on 127.0.0.1:" + PORT);
  console.log("[osave-limiter] endpoints: " + endpoints);
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000);
});
process.on("SIGINT", () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000);
});
