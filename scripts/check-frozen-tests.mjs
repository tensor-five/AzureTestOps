import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const contractsDirectory = path.resolve("docs/contracts");
const manifests = (await readdir(contractsDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith(".tests.json"))
  .map((entry) => entry.name)
  .sort();

if (manifests.length === 0) {
  throw new Error("No frozen test manifests found.");
}

for (const manifestName of manifests) {
  const manifestPath = path.join(contractsDirectory, manifestName);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error(`Invalid frozen test manifest: ${manifestName}`);
  }
  for (const entry of manifest.files) {
    if (typeof entry?.path !== "string" || !/^[a-f0-9]{64}$/u.test(entry.sha256 ?? "")) {
      throw new Error(`Invalid frozen test entry in ${manifestName}`);
    }
    const actualHash = createHash("sha256").update(await readFile(path.resolve(entry.path))).digest("hex");
    if (actualHash !== entry.sha256) {
      throw new Error(`Frozen test differs from ${manifestName}: ${entry.path}`);
    }
  }
}

console.log(`Verified ${manifests.length} frozen test manifest(s).`);
