import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const digest = value => createHash('sha256').update(value).digest('hex');
const approvedContract = 'fa2a61688da96bc2f15a43e32f66dd87a4a520cd277a240523f86ac08fbfcb95';
const contract = await readFile('docs/contracts/release-matrix.v1.html');
const checksum = await readFile('docs/contracts/release-matrix.v1.sha256', 'utf8');
if (digest(contract) !== approvedContract || checksum !== `${approvedContract}  release-matrix.v1.html\n`) {
  throw new Error('Release matrix contract or checksum differs from the approved artifact.');
}
if (digest(await readFile('docs/contracts/release-matrix.v1.tests.json')) !== '4860a2e6c1e41277d041d6fb0f31eba678bb89daa6b1aa414333c0608d2b4d4e') {
  throw new Error('Release matrix frozen test manifest differs from the reviewed version.');
}
await import('./check-frozen-tests.mjs');
console.log('Verified approved release matrix contract.');
