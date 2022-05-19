import Arweave from 'arweave';
import { GQLNodeInterface, GQLTagInterface, SigningFunction, WarpTags } from '@warp';
import Transaction from 'arweave/node/lib/transaction';
import { CreateTransactionInterface } from 'arweave/node/common';
import { BlockData } from 'arweave/node/blocks';

export async function createTx(
  arweave: Arweave,
  signer: SigningFunction,
  contractId: string,
  input: any,
  tags: { name: string; value: string }[],
  target = '',
  winstonQty = '0',
  bundle = false
): Promise<Transaction> {
  const options: Partial<CreateTransactionInterface> = {
    data: Math.random().toString().slice(-4)
  };

  if (target && target.length) {
    options.target = target.toString();
    if (winstonQty && +winstonQty > 0) {
      options.quantity = winstonQty.toString();
    }
  }

  // both reward and last_tx are irrelevant in case of interactions
  // that are bundled. So to speed up the procees (and prevent the arweave-js
  // from calling /tx_anchor and /price endpoints) - we're presetting theses
  // values here
  if (bundle) {
    options.reward = '72600854';
    options.last_tx = 'p7vc1iSP6bvH_fCeUFa9LqoV5qiyW-jdEKouAT0XMoSwrNraB9mgpi29Q10waEpO';
  }

  const interactionTx = await arweave.createTransaction(options);

  if (!input) {
    throw new Error(`Input should be a truthy value: ${JSON.stringify(input)}`);
  }

  if (tags && tags.length) {
    for (const tag of tags) {
      interactionTx.addTag(tag.name.toString(), tag.value.toString());
    }
  }
  interactionTx.addTag(WarpTags.APP_NAME, 'SmartWeaveAction');
  // use real SDK version here?
  interactionTx.addTag(WarpTags.APP_VERSION, '0.3.0');
  interactionTx.addTag(WarpTags.SDK, 'RedStone');
  interactionTx.addTag(WarpTags.CONTRACT_TX_ID, contractId);
  interactionTx.addTag(WarpTags.INPUT, JSON.stringify(input));

  if (signer) {
    await signer(interactionTx);
  }
  return interactionTx;
}

export function createDummyTx(tx: Transaction, from: string, block: BlockData): GQLNodeInterface {
  // transactions loaded from gateway (either arweave.net GQL or RedStone) have the tags decoded
  // - so to be consistent, the "dummy" tx, which is used for viewState and dryWrites, also has to have
  // the tags decoded.
  const decodedTags = unpackTags(tx);

  return {
    id: tx.id,
    owner: {
      address: from,
      key: ''
    },
    recipient: tx.target,
    tags: decodedTags,
    fee: {
      winston: tx.reward,
      ar: ''
    },
    quantity: {
      winston: tx.quantity,
      ar: ''
    },
    block: {
      id: block.indep_hash,
      height: block.height,
      timestamp: block.timestamp,
      previous: null
    },
    // note: calls within dry runs cannot be cached (per block - like the state cache)!
    // that's super important, as the block height used for
    // the dry-run is the current network block height
    // - and not the block height of the real transaction that
    // will be mined on Arweave.
    // If we start caching results of the dry-runs, we can completely fuck-up
    // the consecutive state evaluations.
    // - that's why we're setting "dry" flag to true here
    // - this prevents the caching layer from saving
    // the state evaluated for such interaction in cache.
    dry: true,
    anchor: null,
    signature: null,
    data: null,
    parent: null,
    bundledIn: null
  };
}

export function unpackTags(tx: Transaction): GQLTagInterface[] {
  const tags = tx.get('tags') as any;
  const result: GQLTagInterface[] = [];

  for (const tag of tags) {
    try {
      const name = tag.get('name', { decode: true, string: true }) as string;
      const value = tag.get('value', { decode: true, string: true }) as string;

      result.push({ name, value });
    } catch (e) {
      // ignore tags with invalid utf-8 strings in key or value.
    }
  }
  return result;
}
