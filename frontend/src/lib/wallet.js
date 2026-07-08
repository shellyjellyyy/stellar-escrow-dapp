import {
  isConnected,
  isAllowed,
  setAllowed,
  requestAccess,
  getAddress,
  getNetwork,
  signTransaction,
} from '@stellar/freighter-api';

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

  const allowed = await isAllowed();
  if (!allowed?.isAllowed) {
    await setAllowed();
    await requestAccess();
  }

  const { address, error: addrError } = await getAddress();
  if (addrError) throw new Error(addrError);

  const network = await getNetwork();
  return { address, network: network?.network, networkPassphrase: network?.networkPassphrase };
}

export async function signXdr(xdr, networkPassphrase) {
  const result = await signTransaction(xdr, { networkPassphrase });
  if (result?.error) throw new Error(result.error);
  return result.signedTxXdr ?? result.signedXDR;
}
