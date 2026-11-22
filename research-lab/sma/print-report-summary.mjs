import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const dir = process.argv[2] ?? "/tmp/sma-artifact";
const files = (await readdir(dir)).filter(name => name.endsWith(".json")).sort();
if (!files.length) throw new Error("No SMA JSON reports found in downloaded artifact");

for (const file of files) {
  const report = JSON.parse(await readFile(path.join(dir, file), "utf8"));
  console.log(JSON.stringify({
    file,
    evaluationPeriod: report.evaluationPeriod,
    featureStartYear: report.featureStartYear,
    fixedHoldoutStartYear: report.fixedHoldoutStartYear,
    tours: Object.fromEntries(Object.entries(report.reports ?? {}).map(([tour, data]) => [
      tour,
      {
        sourceRows: data.sourceRows,
        featureMatches: data.featureMatches,
        predictionsWithoutFeatureRecord: data.predictionsWithoutFeatureRecord,
        specifications: Object.fromEntries(Object.entries(data.specifications ?? {}).map(([name, spec]) => [
          name,
          {
            eligibleMatches: spec.eligibleMatches,
            fixedHoldout: spec.fixedHoldout,
            outOfSample: spec.outOfSample
          }
        ]))
      }
    ]))
  }));
}
