// The robot as a Vercel Function, run by Vercel Cron (scripts/prepare-deploy.mjs
// bundles it into api/robot.js and lists the schedule in vercel.json). Vercel
// sends the project's CRON_SECRET with every scheduled call; anything else is
// refused. The key, the realm and the limits come from the project's encrypted
// environment variables; the report goes to the function log.
import { runRobot } from './robot.ts';
import { robotSettings } from './settings.ts';
import { walletSigner } from './signer.ts';

interface Req { headers: Record<string, string | string[] | undefined> }
interface Res { status(code: number): Res; json(body: unknown): void }

export default async function handler(req: Req, res: Res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) { res.status(401).json({ error: 'unauthorized' }); return; }
  const rpc = process.env.ROBOT_RPC || 'https://rpc.onyx.testnets.gno.land';
  const realm = process.env.ROBOT_REALM || '';
  const mnemonic = process.env.ROBOT_MNEMONIC || '';
  if (!realm || !mnemonic) { res.status(503).json({ error: 'the robot is not configured' }); return; }
  try {
    const signer = await walletSigner(rpc, mnemonic);
    // The robot-oracle, a separate key: proposes results for markets listed with it as the oracle.
    const oracleMnemonic = process.env.ROBOT_ORACLE_MNEMONIC || '';
    const oracle = oracleMnemonic ? await walletSigner(rpc, oracleMnemonic) : undefined;
    const report = await runRobot(signer, {
      rpc, realm, oracle, v1Realm: process.env.ROBOT_V1_REALM || 'gno.land/r/nym-sixseven067/markets',
      ...robotSettings(process.env),
    });
    console.log(JSON.stringify({ robot: report.robot, balanceUgnot: report.balanceUgnot, tradable: report.tradable, roles: report.roles, v1: report.v1, steps: report.steps.map(s => `${s.ok ? 'ok' : 'FAIL'} ${s.kind} ${s.market ?? ''} ${s.error ?? ''}`), skipped: report.skipped.slice(0, 12), errors: report.errors }));
    res.status(200).json(report);
  } catch (error) {
    console.error('robot run failed', (error as Error).message);
    res.status(500).json({ error: String((error as Error).message ?? error).slice(0, 300) });
  }
}
