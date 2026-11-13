export type TypeDocument = 'cni' | 'permis' | 'passeport';
export const TYPES: TypeDocument[] = ['cni', 'permis', 'passeport'];

export function normaliserNumero(n: string): string {
  return n.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
export function normaliserNom(n: string): string {
  return n.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().split(/[^A-Z]+/).filter(Boolean).sort().join(' ');
}
/** Garde les 3 derniers caractères : « *********123 ». */
export function masquerNumero(n: string): string {
  const s = normaliserNumero(n);
  return s.length <= 3 ? '*'.repeat(s.length) : '*'.repeat(s.length - 3) + s.slice(-3);
}
/** « Awa Diop » devient « A** D*** ». */
export function masquerNom(n: string): string {
  return n.split(/\s+/).filter(Boolean).map((p) => p[0].toUpperCase() + '*'.repeat(Math.max(p.length - 1, 2))).join(' ');
}
