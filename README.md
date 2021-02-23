# Mongo HyperLogLog

A 32 bit implementation of the [hyperloglog](https://en.wikipedia.org/wiki/HyperLogLog) algorithm using a MongoDB collection for storage. Each counted `key` will take 1.6kb of memory, and will be accurate within ~1% up to cardinalities of 2^27.

```typescript
import MongoHyperLogLog from "mongo-hyperloglog";
// mongo collection
const collection: Collection = myCollection;
const hyperloglog = new MongoHyperLogLog(collection);

async function trackPurchase (userId: string) {
  await hyperloglog.add("bought_thing", userId);
}

async function getUserViewEstimate () {
  return hyperloglog.count("bought_thing");
}

async function trackPageView (userId: string) {
  await hyperloglog.add("page_view", userId);
}
```

## Details & Caveats

**If you need a hyperloglog counter & can use redis's hyperloglog implementation instead, you should**. The redis implementation is much faster because it's supported natively by redis (and because redis is simply much faster than mongo), and uses hyperloglog++ optimizations for sparse data sets & increased accuracy.

- this is a 32 bit implementation of hyperloglog, and will be slightly inaccurate for cardinalities above 2 ^ 32 / 30
- this does not include hyperloglog++ bias correction when switching from linear counting to hyperloglog
- WiredTiger's snapshotting model is well suited to this type of counting, but it's still not as fast as it would be if these counting operations were natively supported
- Mongo HyperLogLog registers store the characters as characters to represent estimates between 0-31, which makes each register use 1 byte of memory. This is similar to redis's implementation.

## Further reading

- [a simple hyperloglog explanation](https://stackoverflow.com/questions/12327004/how-does-the-hyperloglog-algorithm-work)
- [redis hyperloglog](http://antirez.com/news/75)