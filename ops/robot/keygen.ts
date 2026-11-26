// Makes a new robot key: prints the mnemonic to stdout (for a pipe straight into
// `vercel env add ROBOT_MNEMONIC production`) and the address to stderr. The
// mnemonic is never written to a file by this tool.
import { Bip39, EnglishMnemonic, Random } from '@cosmjs/crypto';
import { GnoWallet } from '@gnolang/gno-js-client';

const mnemonic = Bip39.encode(Random.getBytes(32)) as EnglishMnemonic;
const wallet = await GnoWallet.fromMnemonic(mnemonic.toString());
process.stderr.write(`${await wallet.getAddress()}\n`);
process.stdout.write(mnemonic.toString());
