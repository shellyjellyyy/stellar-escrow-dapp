#![cfg(test)]

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::Env;

fn setup() -> (Env, Address, ReputationContractClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, ReputationContract);
    let client = ReputationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    (env, admin, client)
}

#[test]
fn test_initialize_sets_admin() {
    let (_, admin, client) = setup();
    client.initialize(&admin);
    assert_eq!(client.admin(), admin);
}

#[test]
fn test_double_initialize_fails() {
    let (_, admin, client) = setup();
    client.initialize(&admin);
    let result = client.try_initialize(&admin);
    assert!(result.is_err());
}

#[test]
fn test_record_positive_outcome_increments_score() {
    let (env, admin, client) = setup();
    client.initialize(&admin);
    let trader = Address::generate(&env);

    assert_eq!(client.get_reputation(&trader), 0);

    let new_score = client.record_outcome(&admin, &trader, &true);
    assert_eq!(new_score, 1);
    assert_eq!(client.get_reputation(&trader), 1);
}

#[test]
fn test_record_negative_outcome_decrements_score() {
    let (env, admin, client) = setup();
    client.initialize(&admin);
    let trader = Address::generate(&env);

    client.record_outcome(&admin, &trader, &true);
    let new_score = client.record_outcome(&admin, &trader, &false);
    assert_eq!(new_score, 0);
}

#[test]
fn test_unauthorized_caller_is_rejected() {
    let (env, admin, client) = setup();
    client.initialize(&admin);
    let impostor = Address::generate(&env);
    let trader = Address::generate(&env);

    let result = client.try_record_outcome(&impostor, &trader, &true);
    assert!(result.is_err());
}

#[test]
fn test_multiple_traders_have_independent_scores() {
    let (env, admin, client) = setup();
    client.initialize(&admin);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    client.record_outcome(&admin, &alice, &true);
    client.record_outcome(&admin, &alice, &true);
    client.record_outcome(&admin, &bob, &false);

    assert_eq!(client.get_reputation(&alice), 2);
    assert_eq!(client.get_reputation(&bob), -1);
}
