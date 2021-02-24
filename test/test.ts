import { Collection } from "mongodb";
import { getCollection, init, close } from "./mongo";
import MongoHyperLogLog from "../src/index";
import * as expect from "expect";
import * as fs from "fs";
import * as path from "path";

function testEstimate(estimate: number, trueCardinality: number) {
  console.log(`\testimate ${estimate} for ${trueCardinality}`);

  const threeSD = Math.ceil((trueCardinality * 1.04) / Math.sqrt(16384));
  expect(estimate).toBeGreaterThanOrEqual(
    trueCardinality - threeSD
  );
  expect(estimate).toBeLessThanOrEqual(
    trueCardinality + threeSD
  );
}

describe("MongoHyperLogLog", () => {
  let collection: Collection;
  before(async () => {
    await init();
    collection = await getCollection("hyperloglog_test");
  });

  beforeEach(async () => {
    await collection.deleteMany({});
  });

  after(async () => {
    await close();
  });

  describe("count", () => {
    it("returns 0 when nothing has been counted", async () => {
      const hyperloglog = new MongoHyperLogLog(collection);
      await hyperloglog.flush();
      const count = await hyperloglog.count(`${Math.random()}`);
      expect(count).toBe(0);
    });

    it("doesn't double count keys", async () => {
      const key = `double_count_test:${new Date().toISOString()}`;
      const hyperloglog = new MongoHyperLogLog(collection);

      for (let i = 0; i < 100; i++) {
        await hyperloglog.add(key, "hello!");
      }

      await hyperloglog.flush();
      expect(await hyperloglog.count(key)).toBe(1);
    });

    it("respsects 'immediateFlush'", async () => {
      const hyperloglog = new MongoHyperLogLog(collection, {
        immediateFlush: true,
      });

      for (let i = 0; i < 100; i++) {
        await hyperloglog.add("key", `${i}`);
      }

      testEstimate(await hyperloglog.count("key"), 100);

    });

    for (let n = 5; n <= 5_000_000; n *= 10) {
      it(`returns estimate within expected error range for ${n.toLocaleString()}`, async () => {
        const hyperloglog = new MongoHyperLogLog(collection, {
          syncIntervalMS: 500,
        });

        for (let i = 0; i < n; i++) {
          hyperloglog.add("key", `${i}${Math.random()}`);
        }

        await hyperloglog.flush();

        const estimatedCount = await hyperloglog.count("key");
        testEstimate(estimatedCount, n);
      });
    }
  });

  describe("getEstimate", () => {
    // it takes ~3ms to count a key, so it takes ~1 hour to count 1 million keys
    // `make fixtures` generates realistic mongo-like data to test hyperloglog counting functions
    function getCardinalityFromFilename(filename: string) {
      if (!filename.endsWith(".json"))
        throw new Error(
          `only works for filenames that end with .json from ${filename}`
        );
      return parseInt(filename.split(".")[0], 10);
    }
    const fixtureNames = fs
      .readdirSync(path.join(__dirname, "../fixtures"))
      .filter((filename) => filename.endsWith(".json"))
      .sort(
        (a, b) => getCardinalityFromFilename(a) - getCardinalityFromFilename(b)
      );
    const hyperloglog = new MongoHyperLogLog(collection);
    for (const fixtureName of fixtureNames) {
      const trueCardinality = getCardinalityFromFilename(fixtureName);
      // note: this currently fails (as is somewhat expected) at for the 50,000 estimate
      // switching from linear-counting to hyperloglog counting has some bias
      // (see "New cardinality estimation algorithms for HyperLogLog sketches" for discussion)
      it(`works for a cardinality of ${trueCardinality.toLocaleString()}`, () => {
        const doc = require(path.join(__dirname, "../fixtures", fixtureName));
        const estimate = (hyperloglog as any).getEstimateFromRegisters(doc.v);
        testEstimate(estimate, trueCardinality);
      });
    }
  });

  describe("countUnion", () => {
    it("returns 0 when it can't find documents", async () => {
      const hyperloglog = new MongoHyperLogLog(collection);
      await hyperloglog.flush();
      const estimate = await hyperloglog.countUnion(["not", "there"]);
      expect(estimate).toBe(0);
    });

    it("correctly returns the union count", async () => {
      const hyperloglog = new MongoHyperLogLog(collection);
      for (let i = 0; i < 1000; i++) {
        if (i > 250 && i < 1000) await hyperloglog.add("key1", `${i}`);
        if (i < 500) await hyperloglog.add("key2", `${i}`);
      }
      await hyperloglog.flush();
      const estimate = await hyperloglog.countUnion(["key1", "key2"]);
      testEstimate(estimate, 1000);
    });

    it("doesn't double count", async () => {
      const hyperloglog = new MongoHyperLogLog(collection);
      for (let i = 0; i < 1000; i++) {
        await hyperloglog.add("key1", `${i}`);
        await hyperloglog.add("key2", `${i}`);
        await hyperloglog.add("key3", `${i}`);
      }

      await hyperloglog.flush();
      const estimate = await hyperloglog.countUnion([
        "key1",
        "key2",
        "key3",
        "not a key",
      ]);
      testEstimate(estimate, 1000);
    });
  });

  describe("countIntersection", () => {
    it("returns 0 when it can't find documents", async () => {
      const hyperloglog = new MongoHyperLogLog(collection);
      const estimate = await hyperloglog.countIntersection(["not", "there"]);
      expect(estimate).toBe(0);
    });

    it("returns 0ish when there's no overlap", async () => {
      const hyperloglog = new MongoHyperLogLog(collection);
      for (let i = 0; i < 1000; i++) {
        await hyperloglog.add(`key${i % 3}`, `${i}`);
      }

      await hyperloglog.flush();
      const estimate = await hyperloglog.countIntersection(["key1", "key2"]);
      expect(estimate).toBeLessThan(4);
      expect(estimate).toBeGreaterThanOrEqual(0);
    });

    it("returns 0 when one of the hyperloglog documents doesn't exist", async () => {
      const hyperloglog = new MongoHyperLogLog(collection);
      for (let i = 0; i < 1000; i++) {
        await hyperloglog.add(`key1`, `${i}`);
        await hyperloglog.add(`key2`, `${i}`);
      }
      await hyperloglog.flush();
      const estimate = await hyperloglog.countIntersection([
        "key1",
        "key2",
        "key3",
      ]);
      expect(estimate).toBe(0);
    });

    it("correctly returns the intersection count", async () => {
      const hyperloglog = new MongoHyperLogLog(collection);
      for (let i = 0; i < 1000; i++) {
        if (i > 250 && i < 1000) await hyperloglog.add("key1", `${i}`);
        if (i < 500) await hyperloglog.add("key2", `${i}`);
      }
      await hyperloglog.flush();
      const estimate = await hyperloglog.countIntersection(["key1", "key2"]);
      testEstimate(estimate, 250);
    });
  });
});
