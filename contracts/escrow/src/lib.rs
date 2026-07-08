#![no_std]

//! Escrow Contract
//!
//! Holds a buyer's token deposit for a trade with a seller until the buyer
//! confirms delivery, at which point funds move to the seller and both
//! parties' reputation scores are updated via a cross-contract call into
//! the Reputation contract. If the buyer never confirms, the seller can
//! voluntarily refund, or — after a configurable ledger timeout — anyone
//! can trigger a timeout refund back to the buyer (and the seller's
//! reputation takes a hit for non-delivery).

use reputation_contract::ReputationContractClient;
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env};

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    ReputationContract,
    NextId,
    Deal(u64),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[contracttype]
pub enum DealStatus {
    Pending,
    Released,
    Refunded,
}

#[derive(Clone)]
#[contracttype]
pub struct Deal {
    pub buyer: Address,
    pub seller: Address,
    pub token: Address,
    pub amount: i128,
    pub status: DealStatus,
    pub created_at_ledger: u32,
    pub timeout_ledgers: u32,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum EscrowError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    DealNotFound = 3,
    NotPending = 4,
    Unauthorized = 5,
    TimeoutNotReached = 6,
    InvalidAmount = 7,
}

const LEDGER_BUMP: u32 = 500_000;
const LEDGER_THRESHOLD: u32 = 400_000;

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// One-time setup pointing this Escrow deployment at a Reputation
    /// contract instance. In production these are two separate deployments
    /// wired together with this call right after both go live.
    pub fn initialize(env: Env, reputation_contract: Address) -> Result<(), EscrowError> {
        if env.storage().instance().has(&DataKey::ReputationContract) {
            return Err(EscrowError::AlreadyInitialized);
        }
        env.storage()
            .instance()
            .set(&DataKey::ReputationContract, &reputation_contract);
        env.storage().instance().set(&DataKey::NextId, &0u64);
        Ok(())
    }

    /// Buyer deposits `amount` of `token` into escrow for `seller`.
    /// Requires the buyer's authorization since it pulls funds from them.
    /// `timeout_ledgers` is how many ledgers must pass before anyone can
    /// force a refund if the buyer never confirms.
    pub fn create_deal(
        env: Env,
        buyer: Address,
        seller: Address,
        token: Address,
        amount: i128,
        timeout_ledgers: u32,
    ) -> Result<u64, EscrowError> {
        if amount <= 0 {
            return Err(EscrowError::InvalidAmount);
        }
        buyer.require_auth();

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&buyer, &env.current_contract_address(), &amount);

        let deal_id: u64 = env.storage().instance().get(&DataKey::NextId).unwrap_or(0);
        let deal = Deal {
            buyer: buyer.clone(),
            seller: seller.clone(),
            token,
            amount,
            status: DealStatus::Pending,
            created_at_ledger: env.ledger().sequence(),
            timeout_ledgers,
        };

        let key = DataKey::Deal(deal_id);
        env.storage().persistent().set(&key, &deal);
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_BUMP);
        env.storage()
            .instance()
            .set(&DataKey::NextId, &(deal_id + 1));

        env.events()
            .publish((symbol_short!("created"), deal_id), (buyer, seller, amount));

        Ok(deal_id)
    }

    /// Buyer confirms the trade went well. Releases funds to the seller and
    /// bumps both parties' reputation up by one via the Reputation contract.
    pub fn release(env: Env, deal_id: u64) -> Result<(), EscrowError> {
        let key = DataKey::Deal(deal_id);
        let mut deal: Deal = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(EscrowError::DealNotFound)?;

        if deal.status != DealStatus::Pending {
            return Err(EscrowError::NotPending);
        }
        deal.buyer.require_auth();

        let token_client = token::Client::new(&env, &deal.token);
        token_client.transfer(&env.current_contract_address(), &deal.seller, &deal.amount);

        deal.status = DealStatus::Released;
        env.storage().persistent().set(&key, &deal);

        Self::notify_reputation(&env, &deal.seller, true);
        Self::notify_reputation(&env, &deal.buyer, true);

        env.events().publish((symbol_short!("released"), deal_id), &deal.seller);
        Ok(())
    }

    /// Seller voluntarily refunds the buyer before the timeout (e.g. they
    /// can't fulfil the order). No reputation penalty since this is
    /// cooperative, not a failure to deliver.
    pub fn refund(env: Env, deal_id: u64) -> Result<(), EscrowError> {
        let key = DataKey::Deal(deal_id);
        let mut deal: Deal = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(EscrowError::DealNotFound)?;

        if deal.status != DealStatus::Pending {
            return Err(EscrowError::NotPending);
        }
        deal.seller.require_auth();

        let token_client = token::Client::new(&env, &deal.token);
        token_client.transfer(&env.current_contract_address(), &deal.buyer, &deal.amount);

        deal.status = DealStatus::Refunded;
        env.storage().persistent().set(&key, &deal);

        env.events().publish((symbol_short!("refunded"), deal_id), &deal.buyer);
        Ok(())
    }

    /// Anyone can call this once the timeout has elapsed with no release.
    /// Refunds the buyer and dings the seller's reputation for failing to
    /// deliver in time.
    pub fn claim_timeout_refund(env: Env, deal_id: u64) -> Result<(), EscrowError> {
        let key = DataKey::Deal(deal_id);
        let mut deal: Deal = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(EscrowError::DealNotFound)?;

        if deal.status != DealStatus::Pending {
            return Err(EscrowError::NotPending);
        }

        let current_ledger = env.ledger().sequence();
        if current_ledger < deal.created_at_ledger + deal.timeout_ledgers {
            return Err(EscrowError::TimeoutNotReached);
        }

        let token_client = token::Client::new(&env, &deal.token);
        token_client.transfer(&env.current_contract_address(), &deal.buyer, &deal.amount);

        deal.status = DealStatus::Refunded;
        env.storage().persistent().set(&key, &deal);

        Self::notify_reputation(&env, &deal.seller, false);

        env.events()
            .publish((symbol_short!("timeout"), deal_id), &deal.buyer);
        Ok(())
    }

    pub fn get_deal(env: Env, deal_id: u64) -> Result<Deal, EscrowError> {
        env.storage()
            .persistent()
            .get(&DataKey::Deal(deal_id))
            .ok_or(EscrowError::DealNotFound)
    }

    pub fn get_deal_count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::NextId).unwrap_or(0)
    }

    fn notify_reputation(env: &Env, subject: &Address, positive: bool) {
        let reputation_id: Address = env
            .storage()
            .instance()
            .get(&DataKey::ReputationContract)
            .expect("escrow not initialized");
        let client = ReputationContractClient::new(env, &reputation_id);
        client.record_outcome(&env.current_contract_address(), subject, &positive);
    }
}

#[cfg(test)]
mod test;
