import chalk from 'chalk';

export interface TaskLog {
  success(): void;
  fail(): void;
}

const SPINNER_FRAMES = ['|', '/', '-', '\\'];

function createTask(message: string): TaskLog {
  const interactive = Boolean(process.stdout.isTTY);
  let frame = 0;
  let timer: NodeJS.Timeout | undefined;

  const render = () => {
    process.stdout.write(`\r${chalk.cyan(SPINNER_FRAMES[frame])} ${message}`);
    frame = (frame + 1) % SPINNER_FRAMES.length;
  };
  const finish = (symbol: string, color: (text: string) => string) => {
    if (timer) clearInterval(timer);
    if (interactive) {
      process.stdout.write(`\r\x1b[2K${color(symbol + ' ' + message)}\n`);
    } else {
      console.log(color(symbol + ' ' + message));
    }
  };

  if (interactive) {
    render();
    timer = setInterval(render, 80);
  } else {
    console.log(chalk.bold(`\n▸ ${message}...`));
  }

  return {
    success: () => finish('✓', chalk.green),
    fail: () => finish('✗', chalk.red),
  };
}

export const log = {
  info: (msg: string) => console.log(chalk.cyan('ℹ') + ' ' + msg),
  success: (msg: string) => console.log(chalk.green('✓ ' + msg)),
  warn: (msg: string) => console.log(chalk.yellow('⚠') + ' ' + msg),
  error: (msg: string) => console.error(chalk.red('✗') + ' ' + msg),
  step: (msg: string) => console.log(chalk.bold('\n▸ ' + msg)),
  task: createTask,
};
