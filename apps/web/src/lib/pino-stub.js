// Empty stub — replaces pino-pretty in the browser bundle.
// pino@7 wraps its pino-pretty require in a try-catch; returning a no-op
// function satisfies the call-site without crashing in the browser.
module.exports = () => ({});
