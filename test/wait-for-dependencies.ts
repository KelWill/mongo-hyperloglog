import * as Bluebird from "bluebird";
import { init } from "./mongo";

async function main() {
  let up = false;
  for (let i = 0; i < 10 && !up; i++) {
    try {
      await Bluebird.race([
        init()
          .then(() => {
            up = true;
          })
          .catch((err) => {
            console.log("mongo error", err, err.stack);
          }),
        Bluebird.delay(1000).then(() =>
          Promise.reject(`mongo not up after ${i} seconds`)
        ),
      ]);
    } catch (err) {
      console.error(err);
    }
  }

  if (up) {
    process.exit(0);
  } else {
    console.error("DIDN'T COME UP IN TIME. FAILING");
    process.exit(1);
  }
}

if (require.main === module) main();
