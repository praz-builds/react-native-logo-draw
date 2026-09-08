/**
 * Write a file without destroying anything the user did not mean to lose.
 *
 * `wx` refuses to write over a file that already exists, which also means it
 * refuses to follow a symlink into somewhere else — `O_EXCL` fails on the link
 * itself. `--force` opts back into overwriting, but not into following: a
 * symlink is still refused, because "overwrite my output file" is never a
 * request to write through a link to a target you cannot see from the command
 * line.
 */
import { lstatSync, writeFileSync } from 'node:fs';

export function writeOut(
  path: string,
  payload: string | Uint8Array,
  force: boolean,
): void {
  let link: ReturnType<typeof lstatSync> | null = null;
  try {
    link = lstatSync(path);
  } catch {
    link = null; // nothing there, which is the happy path
  }
  if (link?.isSymbolicLink()) {
    throw new Error(`${path} is a symlink; refusing to write through it. Pick a real path.`);
  }
  if (!force && link) {
    throw new Error(`${path} already exists. Pass --force to overwrite it.`);
  }
  writeFileSync(path, payload, force ? undefined : { flag: 'wx' });
}
