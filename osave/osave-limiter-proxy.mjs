#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { parse } from "node:url";

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
    return Math.max(1, Math.ceil(chars / 4));
  } catch {
    return Math.max(1, Math.ceil(body.length / 4));
  }
}

const buckets = {};

function getBucket(endpointId, modelName) {
  const key = `${endpointId}:${modelName}`;
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

const server = createServer((req, res) => {
  const parsed = parse(req.url);
  const modelName = parseModelFromPath(parsed.pathname);
  const endpointId = findEndpointForModel(modelName);

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

  const bodyChunks = [];
  req.on("data", (chunk) => bodyChunks.push(chunk));
  req.on("end", () => {
    const body = Buffer.concat(bodyChunks);
    const estimatedTokens = estimateTokens(body);
    const ep = config.endpoints[endpointId];
    const ml = ep.models[modelName];

    let cost = 1;
    if (ml.unit === "TPM") {
      cost = estimatedTokens;
    }

    if (!bucket.acquire(cost)) {
      const retryAfter = Math.max(1, Math.ceil((cost - bucket.tokens()) / (ml.limit / 60_000)));
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

    const upstream = new URL(parsed.pathname + (parsed.search || ""), ep.baseURL);
    const upstreamOpts = {
      hostname: upstream.hostname,
      port: upstream.port || 443,
      path: upstream.pathname + upstream.search,
      method: req.method,
      headers: { ...req.headers, host: upstream.hostname },
    };

    const apiKey = process.env[ep.env_key];
    if (apiKey) {
      upstreamOpts.headers["api-key"] = apiKey;
    }

    const transport = upstream.protocol === "https:" ? httpsRequest : httpRequest;
    const proxyReq = transport(upstreamOpts, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on("error", (err) => {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "upstream error", detail: err.message }));
    });

    proxyReq.write(body);
    proxyReq.end();
  });
});

server.listen(PORT, "127.0.0.1", () => {
  const endpoints = Object.keys(config.endpoints).join(", ");
  console.log(`[osave-limiter] listening on 127.0.0.1:${PORT}`);
  console.log(`[osave-limiter] endpoints: ${endpoints}`);
});

process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());
