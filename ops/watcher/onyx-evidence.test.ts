import { createHash } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { marketPhase, selection, verifyReceipt } from './onyx-evidence.ts';

test('accepts a room or market ID and rejects values that are not IDs', () => {
  assert.deepEqual(selection(['market', 'nfl-car-phi-2026-10-18']), { kind: 'market', id: 'nfl-car-phi-2026-10-18' });
  assert.deepEqual(selection(['room', '1']), { kind: 'room', id: '1' });
  for (const args of [['room', '0'], ['room', '9007199254740992'], ['market', 'a")'], ['market'], ['room', '1', '2']]) {
    assert.throws(() => selection(args), /Usage/);
  }
});

test('uses the chain clock at the dispute boundary and accounts for remaining positions', () => {
  const proposal = 100_000;
  const duration = 86_400;
  const finalFrom = new Date((proposal + duration) * 1000).toISOString();
  assert.deepEqual(marketPhase('proposed', proposal, duration, proposal + duration - 1, 1, 0n), { next: 'Dispute window', finalFrom });
  assert.deepEqual(marketPhase('proposed', proposal, duration, proposal + duration, 1, 0n), { next: 'Finalize', finalFrom });
  assert.deepEqual(marketPhase('open', 0, duration, proposal, 0, 0n), { next: 'Awaiting proposal', finalFrom: null });
  assert.equal(marketPhase('final', proposal, duration, proposal + duration, 1, 50n).next, 'Claim if eligible');
  assert.equal(marketPhase('final', proposal, duration, proposal + duration, 0, 50n).next, 'Payout recorded');
  assert.equal(marketPhase('final', proposal, duration, proposal + duration, 0, 0n).next, 'No open positions');
});

test('checks receipt bytes and the exact realm, event type and subject', () => {
  const bytes = Buffer.from('example transaction bytes');
  const hash = createHash('sha256').update(bytes).digest();
  const realm = 'gno.land/r/example/rooms';
  const indexed = { hash: hash.toString('base64'), block_height: 25, success: true };
  const validEvent = { type: 'Settled', pkg_path: realm, attrs: [{ key: 'id', value: '1' }, { key: 'version', value: '4' }] };
  const tx = {
    hash: hash.toString('base64'), height: '25', index: 0, tx: bytes.toString('base64'),
    tx_result: {
      GasUsed: '10',
      ResponseBase: {
        Events: [
          { ...validEvent, pkg_path: 'gno.land/r/elsewhere/rooms' },
          { ...validEvent, attrs: [{ key: 'id', value: '2' }] },
          validEvent,
          { '@type': '/bank.TransferEvent', coins: '100ugnot' },
        ],
      },
    },
  };
  const expected = verifyReceipt(tx, indexed, realm, 'id', '1', ['Settled']);
  assert.deepEqual(expected.events, [{ type: 'Settled', attributes: { id: '1', version: '4' } }]);
  assert.equal(expected.hash, hash.toString('hex').toUpperCase());
  assert.equal(expected.transfers.length, 1);
  assert.throws(() => verifyReceipt(tx, indexed, realm, 'id', '3', ['Settled']), /lacks the expected event/);
  assert.throws(() => verifyReceipt({ ...tx, tx: Buffer.from('different bytes').toString('base64') }, indexed, realm, 'id', '1', ['Settled']), /does not confirm/);
  assert.throws(() => verifyReceipt({ ...tx, tx_result: { GasUsed: '10', ResponseBase: { Error: 'out of gas' } } }, indexed, realm, 'id', '1', ['Settled']), /does not confirm/);
});
