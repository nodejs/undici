'use strict'
const undici = require('.')

const undiciOptions = {
  path: '/',
  method: 'GET'
}

const pool = new undici.Client(`http://localhost:3009`, {
  pipelining: 10,
  requestTimeout: 0
})

const shoot = async (max = 1e5) => {
  const promises = [];

  for (let n = 0; n < 1e5; ++n) {
    const p = new Promise((resolve) => {
      pool.request(undiciOptions, (err, { body }) => {
        if (err) {
          console.error(err)
          resolve();
          return;
        }

        body.resume()
        body.on('end', resolve);
      })
    });
    promises.push(p);
  }
  await Promise.all(promises);
};

const bench = async () => {
  let count = 0;
  let sum = 0;
  let squaresSum = 0;

  const maxRequests = 1e5;

  for (;;) {

    const start = Date.now();
    await shoot(count);
    const end = Date.now();

    const duration = end - start;
    const rps = maxRequests * 1000 / duration;

    count++;
    sum += rps;
    squaresSum += rps ** 2;

    const mean = sum / count;
    const stddev = Math.sqrt((squaresSum / count) - mean ** 2);

    console.log(
      `n=${count} mean=${mean.toFixed(3)} stddev=${stddev.toFixed(3)}`);
  }
};

bench().catch((err) => {
  console.error(err.stack);
  process.exit(1);
});
