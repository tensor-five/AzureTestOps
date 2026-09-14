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
if (digest(await readFile('docs/contracts/release-matrix.v2.tests.json')) !== '6be204027f7ad2a05e69bbd8372141d0340eaaff448242094392d91e6ceef7ee') {
  throw new Error('Release matrix v2 frozen test manifest differs from the reviewed version.');
}
if (digest(await readFile('docs/contracts/release-matrix.v3.tests.json')) !== '80a9c98d15206ef93d98a5b77755da7bd3659dd55486122c105be080f60e830a') {
  throw new Error('Release matrix v3 frozen test manifest differs from the reviewed version.');
}
const approvedV4 = '92184250ef76fe23744ab2c82ba78d663bcff20848e69c1b9820d22d9b3b31c3';
if (digest(await readFile('docs/contracts/release-matrix.v4.html')) !== approvedV4 || await readFile('docs/contracts/release-matrix.v4.sha256', 'utf8') !== `${approvedV4}  release-matrix.v4.html\n`) {
  throw new Error('Release matrix v4 contract differs from approved artifact.');
}
if (digest(await readFile('docs/contracts/release-matrix.v4.tests.json')) !== '172628c884831e0f39acb71174d794d59134e03533e826facdc6379cc7afafbf') {
  throw new Error('Release matrix v4 frozen test manifest differs from reviewed version.');
}
await import('./check-frozen-tests.mjs');
console.log('Verified approved release matrix contract.');
