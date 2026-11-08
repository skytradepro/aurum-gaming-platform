/**
 * Creates the Super Admin account. There is no other way to create one: the website and the
 * API can never create or promote a Super Admin.
 *
 *   npm run create-super-admin -w @aurum/api -- --username boss --email boss@example.com \
 *        --first-name Ada --last-name Lovelace
 *
 * The password is asked for twice, with no echo. For automation only, it can be passed in the
 * environment variable SUPER_ADMIN_PASSWORD (it may then be visible to other users of the machine).
 */
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { createDb } from '@aurum/db';
import { AppError } from '@aurum/shared';
import { loadConfig } from '../src/config.ts';
import { SUPER_ADMIN_MIN_PASSWORD_LENGTH, createSuperAdmin } from '../src/services/bootstrap.ts';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    }),
  );
}

async function askHidden(question: string): Promise<string> {
  process.stdout.write(question);
  let muted = true;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) process.stdout.write(chunk, encoding);
      callback();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolve) =>
    rl.question('', (answer) => {
      muted = false;
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    }),
  );
}

const config = loadConfig();
const username = option('username') ?? (await ask('Username: '));
const email = option('email') ?? (await ask('E-mail: '));
const firstName = option('first-name') ?? (await ask('First name: '));
const lastName = option('last-name') ?? (await ask('Last name: '));

let password = process.env.SUPER_ADMIN_PASSWORD ?? '';
if (!password) {
  password = await askHidden(`Password (at least ${SUPER_ADMIN_MIN_PASSWORD_LENGTH} characters): `);
  const again = await askHidden('Repeat the password: ');
  if (password !== again) {
    console.error('The two passwords are different. Nothing was created.');
    process.exit(1);
  }
}

const db = createDb({ connectionString: config.databaseUrl, ssl: config.databaseSsl, max: 1, applicationName: 'aurum-bootstrap' });
try {
  const created = await createSuperAdmin(db, { username, email, firstName, lastName, password }, config.scryptLog2N);
  console.log(`Super Admin "${created.username}" created. Sign in at /admin.`);
} catch (error) {
  if (error instanceof AppError) {
    const fields = error.fields ? ` (${Object.entries(error.fields).map(([k, c]) => `${k}: ${c}`).join(', ')})` : '';
    console.error(`Nothing was created: ${error.code}${fields}`);
  } else {
    console.error('Nothing was created:', error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
} finally {
  await db.close();
}
