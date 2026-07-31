import {
  isConnected,
  isAllowed,
  requestAccess,
  getNetwork,
  signTransaction,
} from '@stellar/freighter-api';
import { config } from './config';

/**
 * Thin wrapper around the Freighter browser extension so the rest of the
 * app never has to think about "is Freighter installed / unlocked / on the
 * right network" edge cases directly.
 */
export async function connectWallet() {
  const available = await isConnected();
  if (!available?.isConnected) {
    throw new Error(
      'Freighter wallet not found. Install the Freighter browser extension to connect.'
    );
  }

  // requestAccess() is the canonical site-authorization flow. getAddress() uses
  // requestPublicKey() and can return an address even when the site is not
  // connected for signing — which is what triggers Freighter's
  // "<site> is not currently connected" warning at sign time.
  const access = await requestAccess();
  if (access.error) throw new Error(access.error);
  if (!access.address) {
    throw new Error('Freighter did not return a wallet address.');
  }

  const network = await getNetwork();
  if (network.error) throw new Error(network.error);
  if (network.networkPassphrase !== config.networkPassphrase) {
    throw new Error(
      'Freighter is on the wrong network. Open Freighter and switch to Testnet, then connect again.'
    );
  }

  return {
    address: access.address,
    network: network.network,
    networkPassphrase: network.networkPassphrase,
  };
}

/** Ensure the current site is authorized before signing (mirrors signMessage/signAuthEntry). */
export async function ensureWalletAccess() {
  const allowed = await isAllowed();
  if (allowed?.isAllowed) return;

  const access = await requestAccess();
  if (access.error) throw new Error(access.error);
}

export async function signXdr(xdr, networkPassphrase, address) {
  await ensureWalletAccess();

  const result = await signTransaction(xdr, { networkPassphrase, address });
  if (result?.error) throw new Error(result.error);
  if (!result.signedTxXdr) {
    throw new Error('Freighter did not return a signed transaction.');
  }
  return result.signedTxXdr;
}
