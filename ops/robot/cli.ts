// node --experimental-strip-types ops/robot/cli.ts --rpc <url> --realm <v2 path> [--v1 <path>] [--dry] [--list 2] [--all] [--reserve 3000000]
// Runs the robot once from a shell. The key comes from ROBOT_MNEMONIC in the
// environment (ROBOT_ORACLE_MNEMONIC adds the robot-oracle); with --dry and no
// key it plans with a throwaway address.
import { runRobot, type Signer } from './robot.ts';
import { walletSigner } from './signer.ts';

const args = process.argv.slice(2);
const option = (name: string, fallback = '') => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const rpc = option('--rpc', 'http://127.0.0.1:26657');
const realm = option('--realm');
if (!realm) throw new Error('--realm is required');
const dryRun = args.includes('--dry');
const mnemonic = process.env.ROBOT_MNEMONIC ?? '';
let signer: Signer;
if (mnemonic) signer = await walletSigner(rpc, mnemonic);
else if (dryRun) signer = { address: option('--as', 'g1robotdryrun000000000000000000000000000'), balance: async () => 1_000_000_000n, call: async () => '' };
else throw new Error('ROBOT_MNEMONIC is not set');
const oracleMnemonic = process.env.ROBOT_ORACLE_MNEMONIC ?? '';
const oracle = oracleMnemonic ? await walletSigner(rpc, oracleMnemonic) : undefined;
const report = await runRobot(signer, {
  rpc, realm, oracle, v1Realm: option('--v1') || undefined, dryRun,
  listPerRun: Number(option('--list', '2')), listKinds: args.includes('--all') ? 'all' : 'games', reserveUgnot: BigInt(option('--reserve', '3000000')),
  maxCalls: Number(option('--max-calls', '30')), renewAfterSeconds: Number(option('--renew-after', String(14 * 3600))),
});
console.log(JSON.stringify(report, null, 2));
