// Realm refusals arrive as panic text inside Adena's failure payload.
export function explainFailure(log: string, fallback: string): { message: string; changed: boolean } {
  if (/price does not match review/.test(log)) return { message: 'The quote changed before your transaction ran. Review the new price.', changed: true };
  if (/insufficient market collateral/.test(log)) return { message: 'The market cannot cover that many shares right now. Try a smaller amount.', changed: true };
  if (/trading closed/.test(log)) return { message: 'Trading closed before your transaction ran. No position was created.', changed: true };
  if (/insufficient (funds|coins)|not enough deposit/i.test(log)) return { message: 'Your account does not have enough GNOT for this amount plus the network fee.', changed: false };
  if (/out of gas/i.test(log)) return { message: 'The transaction ran out of gas. No position was created. Try again.', changed: false };
  return { message: fallback, changed: false };
}

