# The Trust Ledger — Escrow + Reputation on Stellar Soroban

A peer-to-peer escrow dApp where two strangers can trade safely: the buyer's funds sit locked in a smart contract until they confirm the deal went well, and every completed (or failed) trade quietly builds an on-chain trust score for both sides. No middleman, no chargebacks, no "trust me bro."

I built this for the Stellar Level 3 (Orange Belt) submission, which asks for something closer to a real product than a demo — multiple contracts talking to each other, live updates instead of a refresh button, an actual CI pipeline, and tests that mean something. This is my attempt at that.

---

## Why escrow + reputation

Most escrow demos stop at "lock funds, release funds." That's one contract and it doesn't really need a second one. I wanted a project where inter-contract communication was load-bearing, not decorative, so I split it into two contracts that genuinely depend on each other:

- **Escrow contract** — holds a buyer's deposit, releases it to the seller on confirmation, or refunds it (voluntarily or after a timeout).
- **Reputation contract** — keeps a simple +1 / −1 trust score per address, and will only accept updates from whichever contract address is registered as its admin.

The interesting part: **only the Escrow contract can write to Reputation.** A human account can't call `record_outcome` directly and inflate their own score — the Reputation contract checks that the caller is the exact contract address it was initialized with, and Soroban authorizes contract-to-contract calls by checking the live invocation stack rather than a signature. That's a real architectural decision, not just two contracts existing side by side.

## How a deal actually flows

```
 buyer                         escrow contract                 seller
   │                                  │                            │
   │  create_deal(seller, amount)     │                            │
   ├─────────────────────────────────►│                            │
   │  (buyer's tokens locked here)    │                            │
   │                                  │                            │
   │  release(deal_id)                │                            │
   ├─────────────────────────────────►│──── transfer(amount) ─────►│
   │                                  │                            │
   │                                  │──── record_outcome(+1) ───► reputation contract
   │                                  │      for buyer AND seller   │
   │                                  │                            │

   if the buyer never confirms and the timeout passes:

   anyone                          escrow contract
     │  claim_timeout_refund(deal_id)   │
     ├─────────────────────────────────►│──── refund buyer ────────► buyer
     │                                  │──── record_outcome(-1) ──► seller's reputation takes a hit
```

Three ways a deal can end:
1. **Released** — buyer confirms, seller gets paid, both reputations go up.
2. **Refunded (voluntary)** — seller can't fulfil it and refunds the buyer themselves. No penalty; this is cooperative, not a failure.
3. **Refunded (timeout)** — buyer never confirms and the deadline passes. Anyone can trigger the refund, and the seller's reputation takes a −1 for not delivering in time.

## Architecture

```
stellar-escrow-dapp/
├── contracts/
│   ├── escrow/            # holds deposits, releases/refunds, calls reputation
│   └── reputation/         # +1/-1 trust score, admin-gated writes
├── frontend/                # React + Vite dApp
│   └── src/
│       ├── lib/soroban.js   # contract calls + event polling
│       ├── lib/wallet.js    # Freighter integration
│       └── components/      # the actual UI
├── scripts/
│   ├── build.sh              # compiles both contracts to wasm
│   └── deploy.sh             # deploys + wires them together on testnet
└── .github/workflows/ci.yml  # tests contracts + frontend on every push
```

## Tech stack

- **Contracts:** Rust + [soroban-sdk](https://developers.stellar.org/docs/build/smart-contracts/overview) 20.x
- **Frontend:** React 18, Vite, plain CSS (no framework — I wanted control over the visual identity)
- **Wallet:** [Freighter](https://www.freighter.app/)
- **Chain access:** `@stellar/stellar-sdk` talking to Soroban RPC
- **CI:** GitHub Actions

## Real-time updates, honestly explained

There isn't a public Soroban event websocket yet, so "real-time" here means the frontend polls Soroban RPC's `getEvents` every few seconds and re-renders when something new shows up — new deals, releases, refunds, reputation changes. It's not a persistent socket, but it's the same approach most Soroban dApps use today, and the UI updates without anyone touching refresh. This is implemented in `frontend/src/lib/soroban.js` (`watchEvents`).

## Demo mode

If you clone this before deploying your own contracts, the frontend still works — it drops into an in-memory "demo mode" (clearly labeled in the UI) so you can click through creating a deal, releasing it, and watching the reputation gauge move, without needing testnet XLM or a deployed contract yet. Once you add contract IDs to `frontend/.env`, it switches to talking to the real chain automatically.

---

## Getting started

### Prerequisites

- Rust, installed via [rustup](https://rustup.rs) — **not** a distro package like `apt install rustc`. This repo has a `rust-toolchain.toml` pinning an exact version (see below); rustup reads that automatically, a plain `rustc`/`cargo` from your OS package manager won't.
- The `wasm32-unknown-unknown` target: `rustup target add wasm32-unknown-unknown` (also picked up automatically from `rust-toolchain.toml` if you don't already have it)
- [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/cli): `cargo install --locked stellar-cli`
- Node.js 20+
- [Freighter wallet](https://www.freighter.app/) browser extension, funded with testnet XLM via [Friendbot](https://friendbot.stellar.org/)

> **Why is the Rust version pinned to 1.80.1?** Rust 1.81+ changed how the wasm32 backend encodes some instructions by default (it started emitting the `reference-types`/`multivalue` wasm proposal encoding even for code that doesn't use either), which Soroban's current VM doesn't support yet. Contracts built with a newer Rust compile fine and pass `cargo test` locally and in CI, but fail at actual on-chain deployment with `HostError: Error(WasmVm, InvalidAction)` / `"reference-types not enabled"`. This is a known, currently-unresolved Rust/Soroban compatibility gap (confirmed by a soroban-sdk maintainer: [stellar/rs-soroban-sdk#1438](https://github.com/stellar/rs-soroban-sdk/issues/1438)), not a bug in this repo — `rust-toolchain.toml` pins around it.

### 1. Build the contracts

```bash
./scripts/build.sh
```

Compiles both contracts to `target/wasm32-unknown-unknown/release/*.wasm`. This has to happen **before** running tests, not after — see the note below.

### 2. Run the contract tests

```bash
cargo test --workspace
```

This runs 15 tests across both contracts — deposits, releases, voluntary refunds, timeout refunds, reputation updates, and the authorization checks that keep the Reputation contract from being written to by anyone but Escrow.

> **Why build before test?** Escrow calls Reputation across contracts, and rather than linking Reputation's Rust source directly into Escrow (which actually breaks the wasm build — two contracts sharing a method name like `initialize` collide as duplicate wasm exports), Escrow uses `soroban_sdk::contractimport!` to generate a client from Reputation's **compiled `.wasm` file**. That macro reads the file at Escrow's own compile time, so the file has to exist first. `./scripts/build.sh` and the CI workflow both build Reputation before touching Escrow for exactly this reason.

### 3. Deploy to testnet

```bash
./scripts/deploy.sh
```

This creates (and funds) a Stellar CLI identity if you don't have one, deploys both contracts, and wires the Reputation contract to trust the Escrow contract as its admin. It prints the two contract IDs at the end — copy them into `frontend/.env`.

You'll also need a token to trade with. For testing, deploy a Stellar Asset Contract for a test asset, or use the native XLM SAC — the script prints the exact command for both.

### 4. Run the frontend

```bash
cd frontend
cp .env.example .env   # fill in the contract IDs from step 3
npm install
npm run dev
```

### 5. Run the frontend tests

```bash
cd frontend
npm test
```

---

## Deployed contracts (testnet)

> Fill these in after running `./scripts/deploy.sh`.

| Contract | Address |
|---|---|
| Escrow | `PASTE_ESCROW_CONTRACT_ID_HERE` |
| Reputation | `PASTE_REPUTATION_CONTRACT_ID_HERE` |

**Example transaction (deal created & released):** `PASTE_TRANSACTION_HASH_HERE`
[View on Stellar Expert](https://stellar.expert/explorer/testnet)

## Live demo

- **App:** `PASTE_VERCEL_OR_NETLIFY_LINK_HERE`
- **Demo video (1–2 min):** `PASTE_VIDEO_LINK_HERE`

## Screenshots

> Add screenshots here: desktop view, mobile responsive view, CI pipeline passing, and test output showing the 15 passing tests.

---

## What I'd build next

- Dispute resolution with a neutral third party instead of only buyer/seller/timeout paths
- Partial releases for milestone-based deals
- A richer reputation model (weighted by trade size, decay over time) instead of a flat ±1
- Real push notifications once Soroban has a native event subscription API

## Project status

The contracts and their 15 tests are complete and passing (`cargo test --workspace`). The frontend is fully built against real Soroban RPC calls and Freighter — it just needs to be pointed at deployed contract IDs. The one step left before the checklist items below are fully live is running `./scripts/deploy.sh` on testnet and dropping the resulting IDs into `frontend/.env`, then filling in the contract addresses, transaction hash, live demo link, and screenshots above.

## License

MIT — see [LICENSE](./LICENSE).
