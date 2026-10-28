// client/src/lib/accountTree.ts
//
// The chart of accounts is a TREE (2026-10-28): 4 → 40 → 401 → 4011 → 40110001.
// The server sends a flat list (code, parentCode); this puts it in tree order
// (each group followed by what is under it) and gives each account its level
// (1 = a class like "4 Third parties").

export interface TreeAccount {
  code: string;
  parentCode: string | null;
  isGroup: boolean;
}

export function treeOrder<T extends TreeAccount>(rows: T[]): Array<T & { level: number }> {
  const children = new Map<string | null, T[]>();
  const codes = new Set(rows.map((r) => r.code));
  for (const r of rows) {
    // an account whose parent is missing is shown at the top
    const p = r.parentCode && codes.has(r.parentCode) ? r.parentCode : null;
    if (!children.has(p)) children.set(p, []);
    children.get(p)!.push(r);
  }
  for (const list of children.values()) list.sort((a, b) => a.code.localeCompare(b.code));
  const out: Array<T & { level: number }> = [];
  const walk = (parent: string | null, level: number) => {
    for (const r of children.get(parent) ?? []) {
      out.push({ ...r, level });
      walk(r.code, level + 1);
    }
  };
  walk(null, 1);
  return out;
}

// Every group above an account (to open them all when searching).
export function ancestors(rows: TreeAccount[], code: string): string[] {
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const out: string[] = [];
  let p = byCode.get(code)?.parentCode ?? null;
  while (p && byCode.has(p) && !out.includes(p)) {
    out.push(p);
    p = byCode.get(p)!.parentCode;
  }
  return out;
}
