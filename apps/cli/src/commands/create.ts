import { runCreate } from '../creator';

export async function create(args: string[]): Promise<void> {
  await runCreate(args);
}
