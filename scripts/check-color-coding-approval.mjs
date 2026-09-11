import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const digest = value => createHash("sha256").update(value).digest("hex");

// Both contracts were approved on 2026-09-11. V2 supersedes only the explicitly
// documented V1 scope restriction; regenerated hashes without approval are rejected.
const approvedContracts = [
  ["color-coding.v1", "4e0a188ad1ab5aba9587ef9ef5b4bfe7b4c9e827a0e16b81a675ef5460fbc0ce"],
  ["color-coding.v2", "4e462ba940a2e9dbcb6f557c276fc8402ae1d436d3a675404bd7b5a311d2ad87"]
];
for (const [baseName, approvedHash] of approvedContracts) {
  const contractName = `${baseName}.html`;
  const contract = await readFile(`docs/contracts/${contractName}`);
  const checksum = await readFile(`docs/contracts/${baseName}.sha256`, "utf8");
  if (digest(contract) !== approvedHash || checksum !== `${approvedHash}  ${contractName}\n`) {
    throw new Error(`Color coding contract or checksum differs from the approved artifact: ${contractName}`);
  }
}

const approvedTestManifests = [
  ["color-coding.v1.tests.json", "ce4b6e0777f7ab9a3dc1f18e920282310e32e7ff8659a8f11cd3072452fd20ba"],
  ["color-coding.v2.tests.json", "d069dc7422fd0eb055b83c3f3e8200bc055e2a5565fc9d382cee64ad7c6a7402"]
];
for (const [manifestName, approvedHash] of approvedTestManifests) {
  if (digest(await readFile(`docs/contracts/${manifestName}`)) !== approvedHash) {
    throw new Error(`Color coding test manifest differs from the independently reviewed gate: ${manifestName}`);
  }
}
await import("./check-frozen-tests.mjs");
console.log("Verified approved color coding contracts.");
