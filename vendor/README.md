# vendor/ethnum-1.5.0-patched

This is upstream `ethnum` 1.5.0's source — byte-identical to what
`soroban-env-common` already depends on — with **one function** changed in
`src/error.rs`. It exists to work around a real upstream bug, not to fork
the crate for any feature reason.

## The problem

`soroban-env-common` 20.3.0 hard-pins `ethnum = "=1.5.0"` (an exact
requirement, not a caret range). That version constructs a
`TryFromIntError` with:

```rust
pub const fn tfie() -> TryFromIntError {
    unsafe { mem::transmute(()) }
}
```

This assumes `core::num::TryFromIntError` is zero-sized. A recent Rust
stable release changed that type's size, so the transmute now fails to
compile with:

```
error[E0512]: cannot transmute between types of different sizes, or dependently-sized types
  --> ethnum-1.5.0/src/error.rs:16:14
   |
16 |     unsafe { mem::transmute(()) }
   |
   = note: source type: `()` (0 bits)
   = note: target type: `TryFromIntError` (8 bits)
```

This is a confirmed upstream regression, not something specific to this
project — see
[rust-lang/rust#157363](https://github.com/rust-lang/rust/issues/157363).
It was fixed in `ethnum` 1.5.3.

## Why a hand-patched 1.5.0 instead of just using 1.5.3

`cargo update -p ethnum --precise 1.5.3` fails outright, because
`soroban-env-common`'s `=1.5.0` pin leaves no room to bump the version
through normal dependency resolution:

```
error: failed to select a version for the requirement `ethnum = "=1.5.0"`
candidate versions found which didn't match: 1.5.3
required by package `soroban-env-common v20.3.0`
```

The first attempt at fixing this vendored 1.5.3's entire `error.rs`
wholesale (relabeled to claim version `1.5.0`, since Cargo's
`[patch.crates-io]` can only replace a dependency with something that still
satisfies the *original* requirement). That turned out to be more than
necessary: 1.5.3 also rewrote the unrelated `pie()` (`ParseIntError`)
helper to use `const fn` calls into `u8::from_str_radix`, which itself
requires a newer Rust than this project otherwise needs, trading one
compatibility problem for a different one.

So instead: **only `tfie()` is patched**, replacing the unsafe transmute
with the same safe, non-const construction upstream eventually shipped —
`u8::try_from(-1i8).unwrap_err()`. Every call site of `tfie()` in the crate
is inside a regular (non-const) function, so dropping `const` from its
signature doesn't break anything. Everything else in this vendored copy —
`pie()` included — is untouched, unmodified upstream 1.5.0 source.

## What was stripped from the manifest

The published `ethnum` crate's `Cargo.toml` declares a `[workspace]` with
`bench`, `fuzz`, and `intrinsics` sub-crates, none of which are published
as part of the crate itself (and so aren't present in this vendored copy),
plus an optional dependency on `ethnum-intrinsics` behind the
`llvm-intrinsics` feature. soroban only uses the default (non-LLVM)
integer path, so this copy drops the nested `[workspace]` table and the
`ethnum-intrinsics` dependency, turning `llvm-intrinsics` into a no-op
feature flag so the crate is still a drop-in API match without the extra
dependency. `src/`, the license files, and the README are otherwise
untouched.

## Reverting this once upstream is fixed

Once `soroban-env-common` bumps its own `ethnum` requirement past 1.5.2,
delete this directory and the `[patch.crates-io]` entry in the root
`Cargo.toml` — this whole workaround becomes unnecessary.
