import { MongoClient } from "mongodb";

// Connection URL
const url = `mongodb://local_user:local_password@mongo:27027`;
const client = new MongoClient(url, {
  poolSize: 20,
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

let db;
export async function getCollection(collectionName) {
  db = db || client.db("testing");
  return db.collection(collectionName);
}

let connectP;
export async function init() {
  return connectP || (connectP = client.connect());
}

export async function close() {
  return client.close();
}
