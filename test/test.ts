import { Collection } from "mongodb";
import { getCollection, init, close } from "./mongo";
import MongoHyperLogLog from "../src/index";
import * as expect from "expect";

describe("MongoHyperLogLog", () => {
  let collection: Collection;
  before(async () => {
    await init();
    collection = await getCollection("hyperloglog_test");
  });

  after(async () => {
    await collection.deleteMany({});
    await close();
  });

  describe("count", () => {
    it("returns 0 when nothing has been counted", async () => {
      const hyperloglog = new MongoHyperLogLog(collection);
      const count = await hyperloglog.count(`${Math.random()}`);
      expect(count).toBe(0);
    });

    it("doesn't double count keys", async () => {
      const key = `double_count_test:${new Date().toISOString()}`;
      const hyperloglog = new MongoHyperLogLog(collection);

      for (let i = 0; i < 100; i++) {
        await hyperloglog.add(key, "hello!");
      }

      expect(await hyperloglog.count(key)).toBe(1);
    });

    it("counts unions of keys", () => {});

    it("counts intersections of keys", () => {});

    for (let n = 1; n <= 100_000; n *= 10) {
      it(`returns estimate within expected error range for ${n}`, async () => {
        const key = `${n}:${new Date().toISOString()}`;
        const hyperloglog = new MongoHyperLogLog(collection);

        let p: Promise<void>[] = [];
        for (let i = 0; i < n; i++) {
          p.push(hyperloglog.add(key, `${i}${Math.random()}`));

          if (p.length >= 100) {
            await Promise.all(p);
            p = [];
          }
        }
        await Promise.all(p);

        const estimatedCount = await hyperloglog.count(key);

        console.log(`\t\testimated ${estimatedCount} for ${n}`);
        // 1.04 / Math.sqrt(register_count) is the expected error
        // so we bump that up a bit to avoid false positives
        expect(estimatedCount).toBeGreaterThan(
          n - (n * 1.06) / Math.sqrt(16384)
        );
        expect(estimatedCount).toBeLessThan(n + (n * 1.06) / Math.sqrt(16384));
      });
    }
  });

  describe("getHyperLogLogEstimate", () => {
    // it takes ~3ms to count a key, so it takes ~1 hour to count 1 million keys
    // `make fixtures` generates realistic mongo-like data to test hyperloglog counting functions



  });

  describe("getLinearCountEstimate", () => {});

  describe("countUnion", () => {});

  describe("countIntersection", () => {});
});
