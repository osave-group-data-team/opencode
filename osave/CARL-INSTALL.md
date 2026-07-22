# Carl Dev Machine Install Guide

One-command setup for the OSave OpenCode harness including the rate limiter.

## Prerequisites

- Windows with WSL2 and Ubuntu 24.04+
- Node 24 via nvm: `nvm install 24 && nvm use 24`
- OpenCode CLI installed (`npm install -g opencode`)
- Azure Foundry API keys for all 5 OSave endpoints (get from Carlos)
- GitHub access to `osave-group-data-team/opencode`

## Install

```bash
set -euo pipefail

# 1. Clone the fork
git clone https://github.com/osave-group-data-team/opencode.git ~/opencode-fork

# 2. Set up API keys (interactive — keys go to ~/.bashrc, never to a repo)
bash ~/opencode-fork/osave/scripts/setup-keys.sh
source ~/.bashrc

# 3. Create opencode config
mkdir -p ~/.config/opencode
```

Create `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "osave-dashboard-e-us/FW-DeepSeek-V4-Pro",
  "enabled_providers": [
    "osave-dashboard-main",
    "osave-dashboard-e-us",
    "osave-dashboard-e-us-2",
    "osave-dashboard-wc-us",
    "osave-dashboard-c-us"
  ],
  "provider": {
    "osave-dashboard-main": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "OSave Dashboard Main",
      "env": ["OSAVE_DASHBOARD_MAIN_API_KEY"],
      "options": {
        "baseURL": "http://127.0.0.1:8787/openai/v1",
        "timeout": 600000,
        "headerTimeout": 120000,
        "chunkTimeout": 60000
      },
      "models": {
        "DeepSeek-V4-Pro": {
          "name": "DeepSeek-V4-Pro",
          "reasoning": true, "temperature": true, "tool_call": true,
          "modalities": { "input": ["text"], "output": ["text"] },
          "limit": { "context": 1048576, "output": 32768 },
          "options": { "reasoning_effort": "max" },
          "variants": {
            "high": { "reasoning_effort": "max" },
            "medium": { "reasoning_effort": "max" }
          }
        },
        "DeepSeek-V4-Flash": {
          "name": "DeepSeek-V4-Flash",
          "reasoning": true, "temperature": true, "tool_call": true,
          "modalities": { "input": ["text"], "output": ["text"] },
          "limit": { "context": 1048576, "output": 32768 },
          "options": { "reasoning_effort": "low" }
        },
        "Kimi-K2.7-Code": {
          "name": "Kimi-K2.7-Code",
          "reasoning": true, "temperature": true, "tool_call": true,
          "modalities": { "input": ["text"], "output": ["text"] },
          "limit": { "context": 262144, "output": 16384 }
        }
      }
    },
    "osave-dashboard-e-us": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "OSave Dashboard E US",
      "env": ["OSAVE_DASHBOARD_E_US_API_KEY"],
      "options": {
        "baseURL": "http://127.0.0.1:8787/openai/v1",
        "timeout": 600000, "headerTimeout": 120000, "chunkTimeout": 60000
      },
      "models": {
        "FW-DeepSeek-V4-Pro": {
          "name": "FW-DeepSeek-V4-Pro",
          "reasoning": true, "temperature": true, "tool_call": true,
          "modalities": { "input": ["text"], "output": ["text"] },
          "limit": { "context": 1048576, "output": 32768 },
          "options": { "reasoning_effort": "max" }
        }
      }
    },
    "osave-dashboard-e-us-2": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "OSave Dashboard E US 2",
      "env": ["OSAVE_DASHBOARD_E_US_2_API_KEY"],
      "options": {
        "baseURL": "http://127.0.0.1:8787/openai/v1",
        "timeout": 600000, "headerTimeout": 120000, "chunkTimeout": 60000
      },
      "models": {
        "FW-Kimi-K2.7-Code": {
          "name": "FW-Kimi-K2.7-Code",
          "reasoning": true, "temperature": true, "tool_call": true,
          "modalities": { "input": ["text"], "output": ["text"] },
          "limit": { "context": 262144, "output": 16384 }
        }
      }
    },
    "osave-dashboard-wc-us": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "OSave Dashboard WC US",
      "env": ["OSAVE_DASHBOARD_WC_US_API_KEY"],
      "options": {
        "baseURL": "http://127.0.0.1:8787/openai/v1",
        "timeout": 600000, "headerTimeout": 120000, "chunkTimeout": 60000
      },
      "models": {
        "FW-DeepSeek-V4-Pro": {
          "name": "FW-DeepSeek-V4-Pro",
          "reasoning": true, "temperature": true, "tool_call": true,
          "modalities": { "input": ["text"], "output": ["text"] },
          "limit": { "context": 1048576, "output": 32768 }
        }
      }
    },
    "osave-dashboard-c-us": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "OSave Dashboard C US",
      "env": ["OSAVE_DASHBOARD_C_US_API_KEY"],
      "options": {
        "baseURL": "http://127.0.0.1:8787/openai/v1",
        "timeout": 600000, "headerTimeout": 120000, "chunkTimeout": 60000
      },
      "models": {
        "FW-Kimi-K2.7-Code": {
          "name": "FW-Kimi-K2.7-Code",
          "reasoning": true, "temperature": true, "tool_call": true,
          "modalities": { "input": ["text"], "output": ["text"] },
          "limit": { "context": 262144, "output": 16384 }
        }
      }
    }
  },
  "agent": {
    "general":  { "model": "osave-dashboard-e-us/FW-DeepSeek-V4-Pro", "variant": "medium" },
    "explore":  { "model": "osave-dashboard-e-us-2/FW-Kimi-K2.7-Code", "variant": "high" },
    "build":    { "model": "osave-dashboard-e-us/FW-DeepSeek-V4-Pro", "variant": "high" },
    "plan":     { "model": "osave-dashboard-e-us/FW-DeepSeek-V4-Pro", "variant": "high" },
    "review":   { "model": "osave-dashboard-e-us-2/FW-Kimi-K2.7-Code", "variant": "high" }
  }
}
```

Then:

```bash
# 4. Install and start the limiter proxy
mkdir -p ~/.config/systemd/user
cp ~/opencode-fork/osave/osave-limiter-proxy.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now osave-limiter-proxy

# 5. Verify
node ~/opencode-fork/osave/osave-limiter-proxy.mjs &
sleep 1 && curl -s http://127.0.0.1:8787/openai/v1/models | head -20
```

## Verify end-to-end

```bash
opencode run -m osave-dashboard-e-us/FW-DeepSeek-V4-Pro 'Reply CARL_INSTALL_OK.'
```

Expected: `CARL_INSTALL_OK.`

## Working rules

- All models route through `http://127.0.0.1:8787` — the limiter must be running.
- To update rate limits, edit `~/opencode-fork/osave/osave-rate-limits.json` and restart: `systemctl --user restart osave-limiter-proxy`.
- API keys live only in `~/.bashrc` and `~/.config/opencode/osave-api-keys.env`. Never commit these.
- Carlos owns `-CARLOS`/`_CARLOS` artifacts in the vault; Carl writes `-CARL`/`_CARL`.
- Product changes use a worktree off `dev-carl`, never the live checkout.
