import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const contractsDirectory = path.resolve("docs/contracts");
const entries = await readdir(contractsDirectory, { withFileTypes: true });
const checksumFiles = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".sha256"))
  .map((entry) => entry.name)
  .sort();

if (checksumFiles.length === 0) {
  throw new Error("No frozen contract checksum files found.");
}

for (const checksumFile of checksumFiles) {
  const checksumPath = path.join(contractsDirectory, checksumFile);
  const content = (await readFile(checksumPath, "utf8")).trim();
  const match = /^(?<hash>[a-f0-9]{64})  (?<name>[^/]+\.html)$/u.exec(content);
  if (!match?.groups) {
    throw new Error(`Invalid checksum format in ${checksumFile}.`);
  }
  const contractPath = path.join(contractsDirectory, match.groups.name);
  const actualHash = createHash("sha256").update(await readFile(contractPath)).digest("hex");
  if (actualHash !== match.groups.hash) {
    throw new Error(`Frozen contract differs from ${checksumFile}: ${match.groups.name}`);
  }
}

console.log(`Verified ${checksumFiles.length} frozen contract checksum(s).`);
