#!/usr/bin/env bash
set -euo pipefail

echo "=== OSave OpenCode API Key Setup ==="
echo "This script collects your Azure Foundry API keys and saves them to ~/.bashrc"
echo "and ~/.config/opencode/osave-api-keys.env (for the limiter proxy)."
echo "Keys are NOT saved to any repository."
echo ""

ENVFILE="${HOME}/.config/opencode/osave-api-keys.env"
mkdir -p "$(dirname "$ENVFILE")"
: > "$ENVFILE"

declare -A ENDPOINTS=(
  ["osave-dashboard-main"]="OSAVE_DASHBOARD_MAIN_API_KEY|OSave Dashboard Main (Global)|DeepSeek-V4-Pro, DeepSeek-V4-Flash, Kimi-K2.7-Code"
  ["osave-dashboard-e-us"]="OSAVE_DASHBOARD_E_US_API_KEY|OSave Dashboard East US|FW-DeepSeek-V4-Pro"
  ["osave-dashboard-e-us-2"]="OSAVE_DASHBOARD_E_US_2_API_KEY|OSave Dashboard East US 2|FW-Kimi-K2.7-Code"
  ["osave-dashboard-wc-us"]="OSAVE_DASHBOARD_WC_US_API_KEY|OSave Dashboard West Central US|FW-DeepSeek-V4-Pro"
  ["osave-dashboard-c-us"]="OSAVE_DASHBOARD_C_US_API_KEY|OSave Dashboard Central US|FW-Kimi-K2.7-Code"
)

ADDED=0
SKIPPED=0

for endpoint in "${!ENDPOINTS[@]}"; do
  IFS='|' read -r env_key label models <<< "${ENDPOINTS[$endpoint]}"

  current_val="${!env_key:-}"
  if [ -n "$current_val" ]; then
    echo "[SKIP] ${label} — ${env_key} already set"
    echo "${env_key}=${current_val}" >> "$ENVFILE"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  echo ""
  echo "--- ${label} ---"
  echo "Models: ${models}"
  echo "Find the key in Azure Portal → AI Services → ${endpoint}-resource → Keys"
  echo ""
  read -rsp "Paste ${env_key}: " key
  echo ""

  if [ -z "$key" ]; then
    echo "[SKIP] ${label} — no key provided"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  cat >> "$HOME/.bashrc" << EOF
export ${env_key}='${key}'
EOF
  echo "${env_key}=${key}" >> "$ENVFILE"
  export "${env_key}=${key}"
  echo "[OK] ${label} — ${env_key} saved to ~/.bashrc and env file"
  ADDED=$((ADDED + 1))
done

chmod 600 "$ENVFILE"

echo ""
echo "=== Done: ${ADDED} keys added, ${SKIPPED} skipped ==="
echo "Env file: ${ENVFILE}"
echo "Run 'source ~/.bashrc' or start a new shell to load the keys."
echo ""
echo "To start the rate limiter proxy manually:"
echo "  node ~/opencode-fork/osave/osave-limiter-proxy.mjs &"
echo ""
echo "To install as a systemd user service:"
echo "  cp ~/opencode-fork/osave/osave-limiter-proxy.service ~/.config/systemd/user/"
echo "  systemctl --user daemon-reload"
echo "  systemctl --user enable --now osave-limiter-proxy"
