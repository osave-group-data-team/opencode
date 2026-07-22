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

# 3. Copy the ready-to-copy config (includes providers, agent role mapping,
#    and the hardened permission/compaction blocks — same as Carlos's)
mkdir -p ~/.config/opencode
cp ~/opencode-fork/osave/opencode-config.carl.json ~/.config/opencode/opencode.json
```

Do not hand-copy the config from this doc — `osave/opencode-config.carl.json` is the
single source of truth; a copy pasted here would drift out of sync with it exactly
like the old inline block used to.

```

Create `~/.config/opencode/opencode.json`:

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
opencode run -m osave-dashboard-wc-us/FW-DeepSeek-V4-Pro 'Reply CARL_INSTALL_OK.'
```

Expected: `CARL_INSTALL_OK.`

## Working rules

- All models route through `http://127.0.0.1:8787` — the limiter must be running.
- To update rate limits, edit `~/opencode-fork/osave/osave-rate-limits.json` and restart: `systemctl --user restart osave-limiter-proxy`.
- API keys live only in `~/.bashrc` and `~/.config/opencode/osave-api-keys.env`. Never commit these.
- Carlos owns `-CARLOS`/`_CARLOS` artifacts in the vault; Carl writes `-CARL`/`_CARL`.
- Product changes use a worktree off `dev-carl`, never the live checkout.
