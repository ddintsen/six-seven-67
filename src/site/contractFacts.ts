// What the 67 realm does, written from contracts/markets.gno. Every guard
// listed here is a require() in the source; if the source changes, this file
// changes with it.

export interface RealmFunction {
  name: string;
  who: string;
  signature: string;
  text: string;
  guards: string[];
}

export const WRITE_FUNCTIONS: RealmFunction[] = [
  {
    name: 'CreateMarket', who: 'Administrator',
    signature: 'CreateMarket(cur, id, question, rules, conditionID, yesTokenID, noTokenID string, closesAt, yesPricePpm int64, oracle address)',
    text: 'Lists a market and freezes every field used to match the external result: the question, the rules and their hash, the Polymarket condition, both outcome tokens, the closing time and the oracle. There is no function that edits any of them afterwards.',
    guards: ['administrator only', 'market already exists', 'closing time must be in the future', 'invalid fixed price'],
  },
  {
    name: 'Fund', who: 'Anyone',
    signature: 'Fund(cur, id string)',
    text: 'Adds reserve collateral to one market. The money belongs to that market only and nothing withdraws it, not even the administrator.',
    guards: ['market funding closed'],
  },
  {
    name: 'SetQuote', who: 'Administrator',
    signature: 'SetQuote(cur, id string, yesPricePpm, expectedVersion int64)',
    text: 'Publishes a new fixed Yes price while trading is open and adds it to the quote history. The expected version stops an operator from overwriting a quote they have not seen.',
    guards: ['trading closed', 'quote version changed', 'quote unchanged'],
  },
  {
    name: 'Buy', who: 'Any account',
    signature: 'Buy(cur, id, outcome string, microShares, expectedPricePpm int64)',
    text: 'Buys Yes or No shares at the price the buyer reviewed. The payment must be the exact cost, and the market’s collateral must cover the larger side if it wins.',
    guards: ['trading closed', 'price does not match review', 'send the exact quoted ugnot amount', 'insufficient market collateral'],
  },
  {
    name: 'FinalizeByOracle', who: 'The market’s oracle',
    signature: 'FinalizeByOracle(cur, id, conditionID, rulesHash, yesTokenID, noTokenID, winner, evidenceHash string)',
    text: 'Records the final outcome once, with a hash of the evidence. The call must repeat the market’s whole source binding, so a result for another question cannot land here. Trading stops in the same transaction.',
    guards: ['oracle only', 'outcome already final', 'source binding mismatch'],
  },
  {
    name: 'Claim', who: 'A position holder',
    signature: 'Claim(cur, id string) int64',
    text: 'Pays the caller’s winning shares, 1 GNOT each, from that market’s collateral. A losing position closes with zero; a second claim is refused.',
    guards: ['outcome is not final', 'no position', 'position already claimed'],
  },
  {
    name: 'ProposeAdministrator', who: 'Administrator',
    signature: 'ProposeAdministrator(cur, next address)',
    text: 'Starts a two-step handover. Nothing changes until the proposed address accepts from its own account, so a mistyped address cannot take over. Markets keep the oracle they were created with.',
    guards: ['administrator only', 'invalid administrator'],
  },
  {
    name: 'AcceptAdministrator', who: 'The proposed address',
    signature: 'AcceptAdministrator(cur)',
    text: 'Completes the handover.',
    guards: ['pending administrator only'],
  },
];

export const READ_FUNCTIONS = ['MarketsJSON()', 'MarketJSON(id)', 'PositionsJSON(owner)', 'QuoteHistory(id)', 'Quote(id, outcome, microShares)', 'Render(path)'];
export const EVENTS = ['MarketCreated', 'QuoteUpdated', 'Funded', 'Bought', 'Finalized', 'Claimed', 'AdministratorProposed', 'AdministratorAccepted'];

export const SOURCE_EXCERPT = [
  ['k', 'func'], ['f', ' Buy'], ['p', '(cur realm, id, outcome '], ['k', 'string'], ['p', ', microShares, expectedPricePpm '], ['k', 'int64'], ['p', ') {\n'],
  ['c', '\t// …\n'], ['p', '\tprice := outcomePrice(m, outcome)\n\trequire(expectedPricePpm == price, '], ['s', '"price does not match review"'], ['p', ')\n'],
  ['p', '\tcost := quoteCost(microShares, price)\n\trequire(singleSend() == cost, '], ['s', '"send the exact quoted ugnot amount"'], ['p', ')\n'],
  ['c', '\t// …\n'], ['p', '\trequire(maximum(nextYes, nextNo) <= nextEscrow, '], ['s', '"insufficient market collateral"'], ['p', ')\n'], ['c', '\t// …\n'], ['p', '}'],
] as const;
