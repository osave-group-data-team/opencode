# OSave OpenCode Provider & Rate Limiter

Model definitions, rate limits, and setup for OSave Azure Foundry AI deployments.

## Files

| File | Purpose |
|---|---|
| `osave-rate-limits.json` | Rate limits per endpoint/model — **edit this to update limits** |
| `osave-limiter-proxy.mjs` | Local HTTP proxy that enforces per-model rate limits |
| `provider-config.template.json` | Provider definitions for `opencode.json` |
| `scripts/setup-keys.sh` | Interactive API key collector (writes to `~/.bashrc`) |
| `osave-api-keys.env.example` | Env file template for systemd |
| `osave-limiter-proxy.service` | systemd user service unit |

## Quick start

```bash
# 1. Set up API keys (interactive)
bash osave/scripts/setup-keys.sh

# 2. Start the rate limiter proxy
node osave/osave-limiter-proxy.mjs &

# 3. Merge provider-config.template.json into ~/.config/opencode/opencode.json
```

## Rate limits

Edit `osave-rate-limits.json` to update limits. Restart the proxy to apply.

```json
{
  "endpoints": {
    "osave-dashboard-e-us": {
      "models": {
        "FW-DeepSeek-V4-Pro": { "type": "tpm", "limit": 500000, "unit": "TPM" }
      }
    }
  }
}
```

Supported unit types: `TPM` (tokens per minute), `RPM` (requests per minute).

## Architecture

```
opencode → http://127.0.0.1:8787 (limiter proxy) → Azure Foundry
                ↑ enforces per-model token/request buckets
```

The proxy inspects the deployment name from the request path, looks up the rate limit config, acquires tokens from a token bucket, and forwards to the real Azure endpoint.
