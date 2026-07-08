import {
  Contract,
  TransactionBuilder,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
  Address,
  Account,
  rpc,
} from '@stellar/stellar-sdk';
import { config } from './config';
import { signXdr } from './wallet';

const server = new rpc.Server(config.rpcUrl, { allowHttp: config.rpcUrl.startsWith('http://') });

/**
 * Builds, simulates, signs, and submits a contract-invocation transaction
 * from a connected wallet. Throws with a readable message on any failure
 * so the UI can surface it instead of a raw RPC error blob.
 */
async function invoke({ contractId, method, args, sourceAddress }) {
  const account = await server.getAccount(sourceAddress);
  const contract = new Contract(contractId);

  let tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(60)
    .build();

  const simulated = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simulated)) {
    throw new Error(`Simulation failed: ${simulated.error}`);
  }

  const prepared = rpc.assembleTransaction(tx, simulated).build();
  const signedXdr = await signXdr(prepared.toXDR(), config.networkPassphrase);

  const signedTx = TransactionBuilder.fromXDR(signedXdr, config.networkPassphrase);
  const sendResult = await server.sendTransaction(signedTx);

  if (sendResult.status === 'ERROR') {
    throw new Error(`Submission failed: ${sendResult.errorResult?.toString() ?? 'unknown error'}`);
  }

  return pollTransactionStatus(sendResult.hash);
}

async function pollTransactionStatus(hash, attempts = 15) {
  for (let i = 0; i < attempts; i++) {
    const result = await server.getTransaction(hash);
    if (result.status === 'SUCCESS') {
      return { hash, result };
    }
    if (result.status === 'FAILED') {
      throw new Error(`Transaction ${hash} failed on-chain.`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Timed out waiting for transaction ${hash} to confirm.`);
}

/** Read-only simulated call — no signature, no fee, no wallet needed. */
async function readOnly({ contractId, method, args = [], callerAddress }) {
  const source = callerAddress
    ? await server.getAccount(callerAddress)
    : new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '0');
  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const simulated = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simulated)) {
    throw new Error(`Read failed: ${simulated.error}`);
  }
  return scValToNative(simulated.result.retval);
}

export async function createDeal({ buyer, seller, amount, timeoutLedgers }) {
  const args = [
    new Address(buyer).toScVal(),
    new Address(seller).toScVal(),
    new Address(config.tokenContractId).toScVal(),
    nativeToScVal(BigInt(amount), { type: 'i128' }),
    nativeToScVal(timeoutLedgers, { type: 'u32' }),
  ];
  return invoke({ contractId: config.escrowContractId, method: 'create_deal', args, sourceAddress: buyer });
}

export async function releaseDeal({ dealId, callerAddress }) {
  const args = [nativeToScVal(BigInt(dealId), { type: 'u64' })];
  return invoke({ contractId: config.escrowContractId, method: 'release', args, sourceAddress: callerAddress });
}

export async function refundDeal({ dealId, callerAddress }) {
  const args = [nativeToScVal(BigInt(dealId), { type: 'u64' })];
  return invoke({ contractId: config.escrowContractId, method: 'refund', args, sourceAddress: callerAddress });
}

export async function claimTimeoutRefund({ dealId, callerAddress }) {
  const args = [nativeToScVal(BigInt(dealId), { type: 'u64' })];
  return invoke({
    contractId: config.escrowContractId,
    method: 'claim_timeout_refund',
    args,
    sourceAddress: callerAddress,
  });
}

export async function getDeal(dealId, callerAddress) {
  const args = [nativeToScVal(BigInt(dealId), { type: 'u64' })];
  return readOnly({ contractId: config.escrowContractId, method: 'get_deal', args, callerAddress });
}

export async function getDealCount(callerAddress) {
  return readOnly({ contractId: config.escrowContractId, method: 'get_deal_count', callerAddress });
}

export async function getReputation(address, callerAddress) {
  const args = [new Address(address).toScVal()];
  return readOnly({
    contractId: config.reputationContractId,
    method: 'get_reputation',
    args,
    callerAddress,
  });
}

/**
 * Real-time updates without a persistent socket: Soroban RPC exposes
 * getEvents() for polling. This drives the live ledger feed — every
 * `pollIntervalMs` it asks "anything new since the last ledger I saw?"
 * and hands new events to the callback. This is the standard approach
 * used by Soroban dApps today (there is no public Soroban event
 * websocket yet).
 */
export function watchEvents({ onEvents, onError }) {
  let stopped = false;
  let lastLedger = null;

  async function tick() {
    if (stopped) return;
    try {
      const latest = await server.getLatestLedger();
      const startLedger = lastLedger ?? Math.max(latest.sequence - 100, 1);

      const response = await server.getEvents({
        startLedger,
        filters: [
          {
            type: 'contract',
            contractIds: [config.escrowContractId, config.reputationContractId],
          },
        ],
        limit: 50,
      });

      if (response.events?.length) {
        onEvents(response.events);
      }
      lastLedger = latest.sequence + 1;
    } catch (err) {
      onError?.(err);
    } finally {
      if (!stopped) setTimeout(tick, config.pollIntervalMs);
    }
  }

  tick();
  return () => {
    stopped = true;
  };
}
