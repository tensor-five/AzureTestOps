import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

// Approved in this task on 2026-09-11, including icon placement beside each filter.
// Contract edits require renewed user approval, not merely a regenerated checksum.
const approvedContract = "4e0a188ad1ab5aba9587ef9ef5b4bfe7b4c9e827a0e16b81a675ef5460fbc0ce";
const contractName = "color-coding.v1.html";
const digest = value => createHash("sha256").update(value).digest("hex");
const contract = await readFile(`docs/contracts/${contractName}`);
const checksum = await readFile("docs/contracts/color-coding.v1.sha256", "utf8");
if (digest(contract) !== approvedContract || checksum !== `${approvedContract}  ${contractName}\n`) {
  throw new Error("Color coding contract or checksum differs from the approved artifact.");
}
const approvedTestManifest = "cfbb668fde106a845f4ce259c5ce884313c9cdf4975619d4ccf04b2b911fdcd3";
if (digest(await readFile("docs/contracts/color-coding.v1.tests.json")) !== approvedTestManifest) {
  throw new Error("Color coding test manifest differs from the independently reviewed gate.");
}
await import("./check-frozen-tests.mjs");
console.log("Verified approved color coding contract.");
