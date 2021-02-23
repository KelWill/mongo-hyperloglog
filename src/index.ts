import { Collection } from "mongodb";
import * as crypto from "crypto";

type Resolution = 4 | 6 | 8 | 10 | 12 | 14;

type Options = {
  hash?: (s: string) => string;
  resolution?: Resolution;
};

type Register = string | null;

export default class MongoHyperLogLog {
  private collection: Collection<{ key: string; v: Register[] }>;
  private _hash?: (s: string) => string;
  // private resolution?: Resolution;

  constructor(collection: Collection, options: Options = {}) {
    this.collection = collection;
    if (options.hash) this._hash = options.hash;
    // this.resolution = options.resolution || 14;
  }

  async add(key: string, value: string) {
    const hex = this.hash(value);

    const bucket = this.getBucket(hex);
    const unlikeliness = this.getLeading0Count(hex);
    const update = {
      $max: {
        [`v.${bucket}`]: toChar(unlikeliness),
      },
    };

    const writeOpResult = await this.collection.updateOne({ key }, update);
    if (!writeOpResult.modifiedCount) {
      await this.collection.updateOne(
        { key },
        { $setOnInsert: { v: new Array(16384).fill(null) } },
        { upsert: true }
      );
      await this.collection.updateOne({ key }, update);
    }
  }

  async count(key: string) {
    const doc = await this.collection.findOne({ key });
    if (!doc) return 0;

    const hyperloglogEstimate = this.getHyperLogLogEstimate(doc.v);
    if (doc.v.some((n) => !n) && hyperloglogEstimate <= 3 * 16384) {
      return this.getLinearCountEstimate(doc.v);
    }

    return hyperloglogEstimate;
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
