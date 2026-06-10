import { JSONPath } from 'jsonpath-plus';

/** Resolve a JSONPath to the list of JSON Pointers it matches in `json`. */
export function pointersFor(path: string, json: unknown): string[] {
  return JSONPath({ path, json: json as object, resultType: 'pointer' }) as string[];
}

function unescape(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

/**
 * Set the value at a JSON Pointer within `root` (mutating). The pointer must
 * reference an existing location (which is always true for pointers produced by
 * pointersFor). The empty pointer "" (whole document) is ignored.
 */
export function setAtPointer(root: unknown, pointer: string, value: unknown): void {
  if (pointer === '') return;
  const tokens = pointer.split('/').slice(1).map(unescape);
  let node: any = root;
  for (let i = 0; i < tokens.length - 1; i++) {
    if (node == null || typeof node !== 'object') return;
    node = node[tokens[i]!];
  }
  if (node == null || typeof node !== 'object') return;
  node[tokens[tokens.length - 1]!] = value;
}
