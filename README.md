# Mongo HyperLogLog

Mongo version 4.4 is **much slower** than previous Mongo versions at updating the same in-memory document. On that version of Mongo, you should expect this library to cause ~5-10x as much load as it used to. I'm unsure whether subsequent versions of Mongo improve things, but I **strongly recommend using the redis hyperloglog** if that's an option.

A 32 bit implementation of the [hyperloglog](https://en.wikipedia.org/wiki/HyperLogLog) algorithm using a MongoDB collection for storage. Each counted `key` will take 16kb of memory, and will be accurate with minimal error up to cardinalities of 2^27.

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

#### Options

```typescript
const hll = new MonogHyperLogLog(collection, {
  immediateFlush: false,
  // should this immediately send all updates to mongodb? queueing is the default

  syncIntervalMS: 5000, 
  // how often this flushes the queued updates to mongodb. ignored if immediateFlush is set to `true`

  hash: (s: string) => myCustomHashingFunction(s),
  // mongologlog uses sha256 for hashing, but you're welcome to provide your own hash function
});
```

#### Methods

```typescript
add(key: string, value: string): Promise<void>; // queues value to add to sketch for key
count(key: string): Promise<number>; // estimated count for key
countUnion(keys: string[]): Promise<number>; // estimated count for union of keys
countIntersection(keys: string[]): Promise<number>; // estimated count for intersection of keys

close (): Promise<void> // flushes data & removes listeners
```

## Details & Caveats

**If you need a hyperloglog counter & can use redis's hyperloglog implementation instead, you should**. The redis implementation is much faster because it's supported natively by redis (and because redis is simply much faster than mongo), and uses hyperloglog++ optimizations for sparse data sets & forumalae from _New cardinality estimation algorithms for
HyperLogLog sketches_ for increased accuracy.

- this is a 32 bit implementation of hyperloglog, and will be slightly inaccurate for cardinalities above 2 ^ 32 / 30
- this does not include hyperloglog++ bias correction when switching from linear counting to hyperloglog or other estimation algorithm improvements
- WiredTiger's snapshotting model is well suited to this type of counting, but it's still not as fast as it would be if these counting operations were natively supported
- by default, a `MongoHyperLogLog` will send updates to mongo every 1000ms (configurable by `syncIntervalMS`). To flush manually before exiting: `await hyperloglog.close()`.
- Mongo HyperLogLog registers store single characters to represent estimates between 0-31, which makes each register use 1 byte of memory.

## Further reading

- [a simple hyperloglog explanation](https://stackoverflow.com/questions/12327004/how-does-the-hyperloglog-algorithm-work)
- [redis hyperloglog](http://antirez.com/news/75)
