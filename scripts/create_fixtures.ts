import MongoHyperLogLog from "../src/index";
import { Collection } from "mongodb";
import * as fs from "fs";
import * as path from "path";
import { fromChar } from "../src/index";

function FakeCollection() {
  const v = new Array(16384).fill(null);
  return {
    updateOne: (query: any, update: any) => {
      const updateKey = Object.keys(update.$max)[0];
      const bucket = parseInt(updateKey.split(".")[1], 10);

      const updateValue = update.$max[`v.${bucket}`];
      v[bucket] = fromChar(updateValue) > fromChar(v[bucket]) ? updateValue : v[bucket];

      return { modifiedCount: 1 };
    },
    findOne: () => {
      return { v: v.slice() };
    },
  };
}


const FIXTURE_SIZES = [
  // we switch over from linear counting to hyperloglog counts around 50k
  40_000,
  50_000, 
  60_000,

  100_000,
  500_000,
  10_000_0000,
  100_000_000,

  // not worrying about testing 2^32 / 30
];

; (async function main() {
  const fakeCollection = (FakeCollection() as unknown) as Collection;
  const hyperloglog = new MongoHyperLogLog(fakeCollection);
  const n = FIXTURE_SIZES[FIXTURE_SIZES.length - 1];
  const key = `fixtures`;
  for (let i = 0; i <= n; i++) {
    await hyperloglog.add(key, `${Math.random()}-${i}`);

    if (i % 100_000 === 0) {
      console.log(i, await hyperloglog.count(key));
    }

    if (FIXTURE_SIZES.includes(i)) {
      fs.writeFileSync(path.join(__dirname, "../fixtures/", `${i}.json`), JSON.stringify(fakeCollection.findOne({})));
    }
  }
})();
