# Mongo HyperLogLog

A 32 bit implementation of the [hyperloglog](https://en.wikipedia.org/wiki/HyperLogLog) algorithm using a MongoDB collection for storage. Each counted `key` will take 1.6kb of memory, and will be accurate within ~1% up to cardinalities of 2^27.

## Basic Usage

```typescript
import MongoHyperLogLog from "mongo-hyperloglog";
// mongo collection
const collection: Collection = myCollection;
const hyperloglog = new MongoHyperLogLog(collection);
hyperloglog.on("error", console.error);

async function trackPurchase (userId: string) {
  await hyperloglog.add("bought_thing", userId);
}
async function trackPageView (userId: string) {
  await hyperloglog.add("page_view", userId);
}

async function getCounts () {
  return {
    boughtCount: await hyperloglog.count("bought_thing"),
    viewedCount: await hyperloglog.count("page_view"),
    boughtViewedUnion = await hyperloglog.countUnion(["bought_thing", "page_view"]),
    boughtViewedIntersection = await hyperloglog.countIntersection(["bought_thing", "page_view"]),
  }
}
```

## Details & Caveats

**If you need a hyperloglog counter & can use redis's hyperloglog implementation instead, you should**. The redis implementation is much faster because it's supported natively by redis (and because redis is simply much faster than mongo), and uses hyperloglog++ optimizations for sparse data sets & forumalae from _New cardinality estimation algorithms for
HyperLogLog sketches_ for increased accuracy.

- this is a 32 bit implementation of hyperloglog, and will be slightly inaccurate for cardinalities above 2 ^ 32 / 30
- this does not include hyperloglog++ bias correction when switching from linear counting to hyperloglog or other estimation algorithm improvements
- WiredTiger's snapshotting model is well suited to this type of counting, but it's still not as fast as it would be if these counting operations were natively supported
- by default, a `MongoHyperLogLog` will send updates to mongo every 1000ms (configurable by `syncIntervalMS`). To flush manually before exiting: `await hyperloglog.flush()`.
- Mongo HyperLogLog registers store the characters as characters to represent estimates between 0-31, which makes each register use 1 byte of memory.

## Further reading

- [a simple hyperloglog explanation](https://stackoverflow.com/questions/12327004/how-does-the-hyperloglog-algorithm-work)
- [redis hyperloglog](http://antirez.com/news/75)