#![no_std]

//! Reputation Contract
//!
//! Keeps a simple on-chain trust score per address. It is deliberately kept
//! separate from the Escrow contract so that other contracts (or a future
//! marketplace, lending pool, etc.) could plug into the same reputation
//! ledger instead of every app rolling its own trust system.
//!
//! Only the address that was registered as `admin` during `initialize`
//! (in practice, the Escrow contract) is allowed to write score updates.
//! Anyone can read a score.

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env};

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    Score(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ReputationError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
}

#[contract]
pub struct ReputationContract;

#[contractimpl]
impl ReputationContract {
    /// One-time setup. `admin` is the only address ever allowed to call
    /// `record_outcome` — in this dApp that is the deployed Escrow contract's
    /// own address, so a human account can never directly inflate scores.
    pub fn initialize(env: Env, admin: Address) -> Result<(), ReputationError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(ReputationError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        Ok(())
    }

    /// Adjust `subject`'s score by +1 (positive) or -1 (negative). Can only
    /// be invoked by the registered admin contract, and that admin must be
    /// the actual caller (Soroban authorizes contract-to-contract calls by
    /// checking the live invocation stack, not a signature).
    pub fn record_outcome(
        env: Env,
        caller: Address,
        subject: Address,
        positive: bool,
    ) -> Result<i32, ReputationError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(ReputationError::NotInitialized)?;

        if caller != admin {
            return Err(ReputationError::Unauthorized);
        }
        caller.require_auth();

        let key = DataKey::Score(subject.clone());
        let current: i32 = env.storage().persistent().get(&key).unwrap_or(0);
        let updated = if positive { current + 1 } else { current - 1 };
        env.storage().persistent().set(&key, &updated);
        // bump TTL so active reputations don't get archived
        env.storage().persistent().extend_ttl(&key, 500_000, 1_000_000);

        env.events()
            .publish((symbol_short!("rep_upd"), subject), updated);

        Ok(updated)
    }

    /// Public read of an address's current score. Defaults to 0 for
    /// addresses that have never traded.
    pub fn get_reputation(env: Env, subject: Address) -> i32 {
        env.storage()
            .persistent()
            .get(&DataKey::Score(subject))
            .unwrap_or(0)
    }

    pub fn admin(env: Env) -> Result<Address, ReputationError> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(ReputationError::NotInitialized)
    }
}

#[cfg(test)]
mod test;
