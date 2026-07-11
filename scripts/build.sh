#!/usr/bin/env bash
# Builds both contracts to optimized WASM.
# Requires: rustup with the wasm32-unknown-unknown target.
#   rustup target add wasm32-unknown-unknown
#
# Order matters: escrow-contract's contractimport! macro reads
# reputation-contract's compiled .wasm directly at escrow's own compile
# time (this is true for `cargo test`/`cargo check` too, not just wasm
# builds), so reputation-contract MUST be built first every time.

set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Building reputation-contract (must happen before escrow-contract)"
cargo build --target wasm32-unknown-unknown --release -p reputation-contract

echo "==> Building escrow-contract"
cargo build --target wasm32-unknown-unknown --release -p escrow-contract

echo ""
echo "WASM files:"
ls -la target/wasm32-unknown-unknown/release/*.wasm
