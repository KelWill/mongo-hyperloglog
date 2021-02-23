process.env.NODE_ENV = "testing";

module.exports = {
  extension: ['js', 'ts'],
  reporter: 'spec',
  timeout: 600000,
  require: [
    "ts-node/register/transpile-only",
  ],
  file: [],
  exit: true,
  recursive: true,
}
