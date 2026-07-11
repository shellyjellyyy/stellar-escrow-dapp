#!/usr/bin/env bash
# Deploys reputation-contract and escrow-contract to Stellar Testnet and
# wires them together. Requires the Stellar CLI:
#   https://developers.stellar.org/docs/tools/developer-tools/cli
#
# Usage:
#   ./scripts/deploy.sh [identity-name]
#
# If the named identity doesn't exist yet, it's created and funded via
# Friendbot automatically.

set -euo pipefail
cd "$(dirname "$0")/.."

IDENTITY="${1:-deployer}"
NETWORK="testnet"

if ! command -v stellar &> /dev/null; then
  echo "Stellar CLI not found. Install it first:"
  echo "  cargo install --locked stellar-cli"
  exit 1
fi

if ! stellar keys address "$IDENTITY" &> /dev/null; then
  echo "==> Creating and funding identity '$IDENTITY' on $NETWORK"
  stellar keys generate "$IDENTITY" --network "$NETWORK" --fund
fi

DEPLOYER_ADDRESS=$(stellar keys address "$IDENTITY")
echo "==> Deploying as $DEPLOYER_ADDRESS"

echo "==> Building contracts"
./scripts/build.sh

REPUTATION_WASM="target/wasm32-unknown-unknown/release/reputation_contract.wasm"
ESCROW_WASM="target/wasm32-unknown-unknown/release/escrow_contract.wasm"

echo "==> Deploying reputation-contract"
REPUTATION_ID=$(stellar contract deploy \
  --wasm "$REPUTATION_WASM" \
  --source "$IDENTITY" \
  --network "$NETWORK")
echo "    reputation contract id: $REPUTATION_ID"

echo "==> Deploying escrow-contract"
ESCROW_ID=$(stellar contract deploy \
  --wasm "$ESCROW_WASM" \
  --source "$IDENTITY" \
  --network "$NETWORK")
echo "    escrow contract id: $ESCROW_ID"

echo "==> Wiring reputation-contract to trust escrow-contract as admin"
stellar contract invoke \
  --id "$REPUTATION_ID" \
  --source "$IDENTITY" \
  --network "$NETWORK" \
  -- initialize --admin "$ESCROW_ID"

echo "==> Pointing escrow-contract at reputation-contract"
stellar contract invoke \
  --id "$ESCROW_ID" \
  --source "$IDENTITY" \
  --network "$NETWORK" \
  -- initialize --reputation_contract "$REPUTATION_ID"

echo ""
echo "=========================================================="
echo " Deployment complete"
echo "=========================================================="
echo " Reputation contract: $REPUTATION_ID"
echo " Escrow contract:     $ESCROW_ID"
echo ""
echo " Add these to frontend/.env:"
echo "   VITE_ESCROW_CONTRACT_ID=$ESCROW_ID"
echo "   VITE_REPUTATION_CONTRACT_ID=$REPUTATION_ID"
echo ""
echo " For a test token, deploy a Stellar Asset Contract, e.g.:"
echo "   stellar contract asset deploy --asset <CODE>:$DEPLOYER_ADDRESS --source $IDENTITY --network $NETWORK"
echo "   (or use the native XLM SAC id via: stellar contract id asset --asset native --network $NETWORK)"
echo "=========================================================="
