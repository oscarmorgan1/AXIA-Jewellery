/** Product types (the `cat` field). The storefront knows these (assets/js/catalogue.js,
 *  AXIA_TYPE) and names their sizes to suit: rings get "Ring size", chains "Length".
 *  Any other type typed in the editor works too; its sizes are just called "Size". */
export const PRODUCT_TYPES: { key: string; label: string; art?: string }[] = [
  { key: 'chain', label: 'Chain' },
  { key: 'bracelet', label: 'Bracelet' },
  { key: 'pendant', label: 'Pendant' },
  { key: 'necklace', label: 'Necklace' },
  { key: 'ring', label: 'Ring', art: 'none' },
  { key: 'earrings', label: 'Earrings', art: 'none' },
];

export function typeLabel(key: string): string {
  const t = PRODUCT_TYPES.find(x => x.key === key);
  if (t) return t.label;
  return key.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
