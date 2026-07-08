#!/usr/bin/env bash
# Builds both contracts to optimized WASM.
# Requires: rustup with the wasm32-unknown-unknown target.
#   rustup target add wasm32-unknown-unknown

set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Building reputation-contract"
cargo build --target wasm32-unknown-unknown --release -p reputation-contract

echo "==> Building escrow-contract"
cargo build --target wasm32-unknown-unknown --release -p escrow-contract

echo ""
echo "WASM files:"
ls -la target/wasm32-unknown-unknown/release/*.wasm
