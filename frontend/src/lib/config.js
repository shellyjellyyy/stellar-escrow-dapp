export const config = {
  rpcUrl: import.meta.env.VITE_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org',
  networkPassphrase:
    import.meta.env.VITE_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015',
  escrowContractId: import.meta.env.VITE_ESCROW_CONTRACT_ID || '',
  reputationContractId: import.meta.env.VITE_REPUTATION_CONTRACT_ID || '',
  tokenContractId: import.meta.env.VITE_TOKEN_CONTRACT_ID || '',
  pollIntervalMs: Number(import.meta.env.VITE_POLL_INTERVAL_MS || 6000),
};

export function isConfigured() {
  return Boolean(config.escrowContractId && config.reputationContractId && config.tokenContractId);
}
