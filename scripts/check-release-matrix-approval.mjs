import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const digest = value => createHash('sha256').update(value).digest('hex');
const approvedContract = 'fa2a61688da96bc2f15a43e32f66dd87a4a520cd277a240523f86ac08fbfcb95';
const contract = await readFile('docs/contracts/release-matrix.v1.html');
const checksum = await readFile('docs/contracts/release-matrix.v1.sha256', 'utf8');
if (digest(contract) !== approvedContract || checksum !== `${approvedContract}  release-matrix.v1.html\n`) {
  throw new Error('Release matrix contract or checksum differs from the approved artifact.');
}
const approvedV2 = '1ec76cfba36147cee4d480ebcb53a0342666aaa339f2092f4437266bd2221d1a';
const v2 = await readFile('docs/contracts/release-matrix.v2.html');
const v2Checksum = await readFile('docs/contracts/release-matrix.v2.sha256', 'utf8');
if (digest(v2) !== approvedV2 || v2Checksum !== `${approvedV2}  release-matrix.v2.html\n`) {
  throw new Error('Release matrix v2 contract or checksum differs from the approved artifact.');
}
const approvedV3 = '9555894a8598f9da8e494949fbc765e7cc23f3ff25c402de94d9d42e42db6e14';
const v3 = await readFile('docs/contracts/release-matrix.v3.html');
const v3Checksum = await readFile('docs/contracts/release-matrix.v3.sha256', 'utf8');
if (digest(v3) !== approvedV3 || v3Checksum !== `${approvedV3}  release-matrix.v3.html\n`) {
  throw new Error('Release matrix v3 contract or checksum differs from the approved artifact.');
}
if (digest(await readFile('docs/contracts/release-matrix.v1.tests.json')) !== '4860a2e6c1e41277d041d6fb0f31eba678bb89daa6b1aa414333c0608d2b4d4e') {
  throw new Error('Release matrix frozen test manifest differs from the reviewed version.');
}
if (digest(await readFile('docs/contracts/release-matrix.v2.tests.json')) !== '993007a149c9eae0d139bf0262bdea52465ca39f1de2fb96b64c9238d2ca2c52') {
  throw new Error('Release matrix v2 frozen test manifest differs from the reviewed version.');
}
if (digest(await readFile('docs/contracts/release-matrix.v3.tests.json')) !== '379e321c00f44bf353ca672520952243ec18ff23b706efae75c0d0d9b7b2268c') {
  throw new Error('Release matrix v3 frozen test manifest differs from the reviewed version.');
}
await import('./check-frozen-tests.mjs');
console.log('Verified approved release matrix contract.');
