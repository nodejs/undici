const { execSync } = require("node:child_process");
const { test } = require("tap");

test("Respect --max-http-header-size Node.js flag", (t) => {
  const command =
    'node -e "require(`../undici-fetch`);fetch(`https://httpbin.org/get`)"';
  try {
    execSync(`${command} --max-http-header-size=1}`, { cwd: __dirname });
  } catch (error) {
    t.same(error.message.includes("UND_ERR_HEADERS_OVERFLOW"), true);
  }

  execSync(command, { cwd: __dirname });

  t.end();
});
