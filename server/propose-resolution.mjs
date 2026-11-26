import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isConditionId, POLYMARKET_ORIGIN } from './polymarket.mjs';
import { createResolutionRegistry } from './resolution-proposal.mjs';
import { GatewayError, requestJson } from './upstream.mjs';

const USAGE = 'Usage: node server/propose-resolution.mjs <0x-condition-id>\nReads server/bindings.json and the fixed Polymarket CLOB endpoint. Outputs an unsigned advisory proposal; no signature or transaction is submitted.\n';
async function loadOperatorBindings() {
  const bytes = await readFile(new URL('./bindings.json', import.meta.url));
  if (bytes.byteLength > 1048576) throw new GatewayError('REGISTRY_TOO_LARGE', 'Operator binding file exceeds 1 MiB.', 400);
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { throw new GatewayError('INVALID_REGISTRY', 'Operator binding file must contain valid JSON.', 400); }
}

export async function runProposalCli(argv, { loadBindings = loadOperatorBindings, request = requestJson,
  writeOutput = value => process.stdout.write(value), writeError = value => process.stderr.write(value) } = {}) {
  if (argv.length === 1 && argv[0] === '--help') { writeOutput(USAGE); return 0; }
  try {
    if (argv.length !== 1 || !isConditionId(argv[0])) throw new GatewayError('INVALID_ARGUMENTS', 'Supply one explicit lowercase Polymarket condition ID (0x plus 64 hex digits).', 400);
    const conditionId = argv[0];
    const registry = createResolutionRegistry(await loadBindings());
    registry.requireBinding(conditionId); // Reject unbound or incomplete targets before any upstream request.
    const raw = await request(`${POLYMARKET_ORIGIN}/markets/${conditionId}`);
    const proposal = registry.propose(raw, conditionId);
    writeOutput(`${JSON.stringify(proposal, null, 2)}\n`);
    return 0;
  } catch (error) {
    const known = error instanceof GatewayError;
    writeError(`${JSON.stringify({ status: 'proposal-not-created', settlementAllowed: false,
      error: { code: known ? error.code : 'OPERATOR_CONFIG_UNAVAILABLE',
        message: known ? error.message : 'Could not read the operator-owned binding registry.' } }, null, 2)}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await runProposalCli(process.argv.slice(2));
