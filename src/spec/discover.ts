import { glob } from 'tinyglobby';

/** Resolve a glob (or literal path) to a sorted list of absolute file paths. */
export async function discover(pattern: string, cwd: string = process.cwd()): Promise<string[]> {
  const matches = await glob([pattern], { cwd, absolute: true, dot: false });
  return matches.sort();
}
