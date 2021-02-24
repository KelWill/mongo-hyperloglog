import { Collection } from "mongodb";
import * as crypto from "crypto";
import * as EventEmitter from "events";

type Options = {
  hash?: (s: string) => string;
  syncIntervalMS?: number;
  immediateFlush?: boolean;
};

type Register = string | null;

type QueuedUpdate = { key: string; update: { $max: Record<string, string> } };

export default class MongoHyperLogLog extends EventEmitter {
  private collection: Collection<{ key: string; v: Register[] }>;
  private _hash?: (s: string) => string;
  private syncIntervalMS: number;
  private queuedUpdates: QueuedUpdate[];

  private timeoutRef?: ReturnType<typeof setTimeout>;
  private immediateFlush?: boolean;

  constructor(collection: Collection, options: Options = {}) {
    super();
    this.collection = collection;
    if (options.hash) this._hash = options.hash;

    this.syncIntervalMS = options.syncIntervalMS || 1_000;
    this.immediateFlush = !!options.immediateFlush;
    this.queuedUpdates = [];
    if (!this.immediateFlush) {
      this.startUpdateLoop();
    }
  }

  startUpdateLoop() {
    this.timeoutRef = setTimeout(() => {
      this.flush().then(() => this.startUpdateLoop());
    }, this.syncIntervalMS);
  }

  async close () {
    if (this.timeoutRef) clearTimeout(this.timeoutRef);
    await this.flush();
    this.removeAllListeners();
  }

  async flush() {
    const updates = this.queuedUpdates;
    this.queuedUpdates = [];
    await Promise.all(updates.map((update) => this.doUpdate(update)));
  }

  private async doUpdate(queuedUpdate: QueuedUpdate) {
    const { key, update } = queuedUpdate;
    try {
      const writeOpResult = await this.collection.updateOne({ key }, update);
      if (writeOpResult.modifiedCount) return;
      await this.collection.updateOne(
        { key },
        { $setOnInsert: { v: new Array(16384).fill(null) } },
        { upsert: true }
      );
      await this.collection.updateOne({ key }, update);
    } catch (err) {
      if (process.env.DEBUG) console.error("ERROR in doUpdate", err);
      this.emit("error", err);
    }
  }

  async add(key: string, value: string) {
    const hex = this.hash(value);

    const bucket = this.getBucket(hex);
    const unlikeliness = this.getLeading0Count(hex);

    const existingUpdate = this.queuedUpdates.find(
      (update) => update.key === key
    );

    if (existingUpdate) {
      const maxes = existingUpdate.update.$max;
      const bucketKey = `v.${bucket}`;

      maxes[bucketKey] =
        fromChar(toChar(unlikeliness)) > fromChar(maxes[bucketKey])
          ? toChar(unlikeliness)
          : maxes[bucketKey];
    } else {
      const update = {
        $max: {
          [`v.${bucket}`]: toChar(unlikeliness),
        },
      };
      this.queuedUpdates.push({ key, update });
    }

    if (this.immediateFlush) await this.flush();
  }

  async countIntersection(keys: string[]) {
    const docs = await this.collection.find({ key: { $in: keys } }).toArray();
    if (!docs.length) return 0;
    if (docs.length !== keys.length) return 0;

    const unionCount = this.getUnionEstimateFromRegisters(
      docs.map(({ v }) => v)
    );

    const docCounts = docs.map(({ v }) => this.getEstimateFromRegisters(v));

    return Math.abs(unionCount - docCounts.reduce((sum, n) => sum + n, 0));
  }

  async countUnion(keys: string[]) {
    const docs = await this.collection.find({ key: { $in: keys } }).toArray();
    if (!docs.length) return 0;

    return this.getUnionEstimateFromRegisters(docs.map(({ v }) => v));
  }

  async count(key: string) {
    const doc = await this.collection.findOne({ key });
    if (!doc) return 0;
    return this.getEstimateFromRegisters(doc.v);
  }

  private getEstimateFromRegisters(values: Register[]) {
    const hyperloglogEstimate = this.getHyperLogLogEstimate(values);
    if (values.some((n) => !n) && hyperloglogEstimate <= 3 * 16384) {
      return this.getLinearCountEstimate(values);
    }

    return hyperloglogEstimate;
  }

  private getUnionEstimateFromRegisters(registerList: Register[][]) {
    const unionRegisters: Register[] = new Array(16384).fill(null);

    for (let j = 0; j < registerList.length; j++) {
      const registers = registerList[j];
      for (let i = 0; i < unionRegisters.length; i++) {
        if (fromChar(registers[i]) > fromChar(unionRegisters[i])) {
          unionRegisters[i] = registers[i];
        }
      }
    }

    return this.getEstimateFromRegisters(unionRegisters);
  }

  private getBucket(hex: string) {
    const n = parseInt(hex.slice(0, 8), 16);
    const bucket = n >>> 18; // 18 = 32 - 14
    return bucket;
  }

  private getLeading0Count(hex: string) {
    const n = parseInt(hex.slice(8, 8 + 8), 16);
    return Math.clz32(n);
  }

  private getHyperLogLogEstimate(values: Register[]) {
    let Z = 0;

    for (let i = 0; i < values.length; i++) {
      Z += Math.pow(2, -fromChar(values[i]));
    }

    const a = getCollisionAdjustConstant(16384);

    return Math.round((a * Math.pow(16384, 2)) / Z);
  }

  private getLinearCountEstimate(values: Register[]) {
    const registersNotAt0 = values.filter((v) => !!v).length;
    const registerSize = 16384;
    const registersAt0 = registerSize - registersNotAt0;
    return Math.round(-registerSize * Math.log(registersAt0 / registerSize));
  }

  private hash(s: string) {
    if (this._hash) return this._hash(s);
    return hash(s);
  }
}

function toChar(n: number) {
  return String.fromCharCode(n + 65);
}

export function fromChar(c: Register) {
  if (!c) return 0;
  return c.charCodeAt(0) - 65 + 1;
}

function hash(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

const HASH_COLLISION_CONTANT_ADJUST = {
  16: 0.673,
  32: 0.697,
  64: 0.709,
  128: (m: number) => 0.7213 / (1 + 1.079 / m),
};

function getCollisionAdjustConstant(m: number) {
  if (m <= 16) return HASH_COLLISION_CONTANT_ADJUST[16];
  if (m <= 32) return HASH_COLLISION_CONTANT_ADJUST[32];
  if (m <= 64) return HASH_COLLISION_CONTANT_ADJUST[64];
  return HASH_COLLISION_CONTANT_ADJUST[128](m);
}
