import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeSource } from "../src/cli-app/classify/index.ts";
import { DEFAULT_CONFIG } from "../src/cli-app/config.ts";

/** "name:line kind" for each declaration */
async function declared(file: string, source: string): Promise<string[]> {
  const model = await analyzeSource(file, source, DEFAULT_CONFIG);
  return (model?.declarations ?? []).map((d) => `${d.name}:${d.line} ${d.kind}`);
}

test("declarations: top-level names, exported or not, and class members, each on its name's line", async () => {
  const source = `import { db } from "./db";
export async function findOrders(userId: string) {
  const result = await db.query(userId);
  return result;
}
const LIMIT = 10, OFFSET = 0;
let { a, b } = pair();
export default class OrderStore {
  private cache = new Map();
  /** doc */
  get(id: string) { return this.cache.get(id); }
}
export interface Order { id: string }
type Id = string;
enum Status { Open }
declare function legacy(): void;
namespace Util {}
`;
  assert.deepEqual(await declared("orders.ts", source), [
    "findOrders:2 function",
    "LIMIT:6 variable",
    "OFFSET:6 variable",
    "OrderStore:8 class",
    "cache:9 property",
    "get:11 method",
    "Order:13 type",
    "Id:14 type",
    "Status:15 enum",
    "legacy:16 function",
    "Util:17 namespace",
  ], "a function's locals and destructured names aren't listed");
});

test("declarations: js and tsx files have them too; a file with syntax errors has none", async () => {
  assert.deepEqual(await declared("a.js", "function run() {}\nexport const x = 1;\n"), ["run:1 function", "x:2 variable"]);
  assert.deepEqual(await declared("Card.tsx", "export function Card() { return <div />; }\n"), ["Card:1 function"]);
  assert.deepEqual(await declared("broken.ts", "function run( {\n"), []);
});
