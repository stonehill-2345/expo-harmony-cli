export function validateInstall(log, hap) {
  return log.split(/\r?\n/).some(line => line.includes(`App install path:${hap} msg:install bundle successfully.`)) && log.includes('AppMod finish');
}
export function validateMetro(log, project) {
  return log.split(/\r?\n/).some(line => line === `Starting project at ${project}`) && /harmony Bundled \d+ms index\.ts \(\d+ modules\)/.test(log);
}
