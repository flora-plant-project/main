/** Stop the API started by live-setup.cjs. */
module.exports = async function globalTeardown() {
  const child = globalThis.__FLORA_API__;
  if (!child || child.exitCode !== null) return;

  await new Promise((resolve) => {
    child.once('exit', resolve);
    child.kill('SIGTERM');
    // SIGTERM is not delivered the same way on Windows; make sure the job ends.
    setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
      resolve(undefined);
    }, 5_000).unref?.();
  });
};
