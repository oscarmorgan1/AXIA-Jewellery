// Reads the static catalogue (assets/data/products.js) the way a browser would.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export const CATALOGUE_PATH = new URL('../assets/data/products.js', import.meta.url);

export function loadStaticCatalogue() {
  const ctx = { window: {} };
  vm.runInNewContext(readFileSync(CATALOGUE_PATH, 'utf8'), ctx);
  const products = ctx.window.AXIA_PRODUCTS;
  if (!Array.isArray(products)) throw new Error('assets/data/products.js did not define window.AXIA_PRODUCTS');
  return JSON.parse(JSON.stringify(products));
}
