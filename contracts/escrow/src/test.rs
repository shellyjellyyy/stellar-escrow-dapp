#![cfg(test)]

use super::*;
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::Env;

fn create_token_contract<'a>(
    env: &Env,
    admin: &Address,
) -> (token::Client<'a>, token::StellarAssetClient<'a>) {
    let sac_address = env.register_stellar_asset_contract(admin.clone());
    (
        token::Client::new(env, &sac_address),
        token::StellarAssetClient::new(env, &sac_address),
    )
}

struct TestSetup {
    env: Env,
    escrow: EscrowContractClient<'static>,
    reputation: reputation_contract::Client<'static>,
    token: token::Client<'static>,
    token_admin: token::StellarAssetClient<'static>,
    buyer: Address,
    seller: Address,
}

fn setup() -> TestSetup {
    let env = Env::default();
    env.mock_all_auths();

    let token_admin_addr = Address::generate(&env);
    let (token, token_admin) = create_token_contract(&env, &token_admin_addr);

    let reputation_id = env.register_contract_wasm(None, reputation_contract::WASM);
    let reputation = reputation_contract::Client::new(&env, &reputation_id);

    let escrow_id = env.register_contract(None, EscrowContract);
    let escrow = EscrowContractClient::new(&env, &escrow_id);

    reputation.initialize(&escrow_id);
    escrow.initialize(&reputation_id);

    let buyer = Address::generate(&env);
    let seller = Address::generate(&env);
    token_admin.mint(&buyer, &10_000);

    TestSetup {
        env,
        escrow,
        reputation,
        token,
        token_admin,
        buyer,
        seller,
    }
}

#[test]
fn test_create_deal_transfers_funds_into_escrow() {
    let t = setup();
    let deal_id = t.escrow.create_deal(&t.buyer, &t.seller, &t.token.address, &1_000, &100);

    assert_eq!(deal_id, 0);
    assert_eq!(t.token.balance(&t.buyer), 9_000);
    assert_eq!(t.token.balance(&t.escrow.address), 1_000);

    let deal = t.escrow.get_deal(&deal_id);
    assert_eq!(deal.amount, 1_000);
    assert_eq!(deal.status, DealStatus::Pending);
}

#[test]
fn test_release_pays_seller_and_boosts_reputation() {
    let t = setup();
    let deal_id = t.escrow.create_deal(&t.buyer, &t.seller, &t.token.address, &1_000, &100);

    t.escrow.release(&deal_id);

    assert_eq!(t.token.balance(&t.seller), 1_000);
    assert_eq!(t.token.balance(&t.escrow.address), 0);

    let deal = t.escrow.get_deal(&deal_id);
    assert_eq!(deal.status, DealStatus::Released);

    assert_eq!(t.reputation.get_reputation(&t.seller), 1);
    assert_eq!(t.reputation.get_reputation(&t.buyer), 1);
}

#[test]
fn test_cannot_release_twice() {
    let t = setup();
    let deal_id = t.escrow.create_deal(&t.buyer, &t.seller, &t.token.address, &1_000, &100);
    t.escrow.release(&deal_id);

    let result = t.escrow.try_release(&deal_id);
    assert!(result.is_err());
}

#[test]
fn test_seller_can_voluntarily_refund() {
    let t = setup();
    let deal_id = t.escrow.create_deal(&t.buyer, &t.seller, &t.token.address, &1_000, &100);

    t.escrow.refund(&deal_id);

    assert_eq!(t.token.balance(&t.buyer), 10_000);
    let deal = t.escrow.get_deal(&deal_id);
    assert_eq!(deal.status, DealStatus::Refunded);
    // voluntary refund: no reputation penalty
    assert_eq!(t.reputation.get_reputation(&t.seller), 0);
}

#[test]
fn test_timeout_refund_before_deadline_fails() {
    let t = setup();
    let deal_id = t.escrow.create_deal(&t.buyer, &t.seller, &t.token.address, &1_000, &100);

    let result = t.escrow.try_claim_timeout_refund(&deal_id);
    assert!(result.is_err());
}

#[test]
fn test_timeout_refund_after_deadline_penalizes_seller() {
    let t = setup();
    let deal_id = t.escrow.create_deal(&t.buyer, &t.seller, &t.token.address, &1_000, &100);

    t.env.ledger().with_mut(|li| {
        li.sequence_number += 200;
    });

    t.escrow.claim_timeout_refund(&deal_id);

    assert_eq!(t.token.balance(&t.buyer), 10_000);
    assert_eq!(t.reputation.get_reputation(&t.seller), -1);
}

#[test]
fn test_zero_amount_deal_rejected() {
    let t = setup();
    let result = t.escrow.try_create_deal(&t.buyer, &t.seller, &t.token.address, &0, &100);
    assert!(result.is_err());
}

#[test]
fn test_double_initialize_fails() {
    let t = setup();
    let reputation_id = t.reputation.address.clone();
    let result = t.escrow.try_initialize(&reputation_id);
    assert!(result.is_err());
}

#[test]
fn test_deal_count_increments() {
    let t = setup();
    t.token_admin.mint(&t.buyer, &10_000);
    assert_eq!(t.escrow.get_deal_count(), 0);
    t.escrow.create_deal(&t.buyer, &t.seller, &t.token.address, &500, &50);
    assert_eq!(t.escrow.get_deal_count(), 1);
    t.escrow.create_deal(&t.buyer, &t.seller, &t.token.address, &500, &50);
    assert_eq!(t.escrow.get_deal_count(), 2);
}
