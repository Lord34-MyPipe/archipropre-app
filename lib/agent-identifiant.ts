// Identifiant de connexion agent SANS email obligatoire.
//
// Beaucoup d'agents terrain n'ont pas d'adresse email, mais Supabase Auth
// exige un email valide comme identifiant. Solution : un identifiant simple
// côté humain ("andre"), complété par un domaine technique interne côté
// machine ("andre@archipropre.local"), de façon transparente pour l'agent —
// il ne voit jamais le suffixe, ni à la création, ni à la connexion, ni dans
// les écrans manager/directeur.
//
// Module pur (aucune dépendance serveur/client) : importable tel quel depuis
// un Client Component (AgentFormModal, page de login) ET une route API.

export const AGENT_TECH_DOMAIN = 'archipropre.local'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Identifiant simple : lettres/chiffres, éventuellement '.', '-', '_' à
// l'intérieur — commence et finit par un caractère alphanumérique.
const IDENTIFIANT_RE = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/

/**
 * Nettoie un identifiant simple saisi par l'utilisateur : minuscules, sans
 * accents ni espaces, uniquement [a-z0-9._-]. "André Dupont" → "andre.dupont".
 */
export function slugifyIdentifiant(raw: string): string {
  return raw
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // andré → andre (retire les accents)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._-]/g, '')
}

export interface IdentifiantResolu {
  /** Valeur réelle envoyée à Supabase Auth — toujours un email valide pour GoTrue. */
  email: string
  /** true = identifiant simple complété par le domaine technique (pas un vrai email agent). */
  technique: boolean
}

/**
 * Résout la saisie d'un formulaire (création/édition agent) en email Supabase
 * Auth. Accepte soit un vrai email (contient "@"), soit un identifiant simple
 * qui sera slugifié puis complété par le domaine technique. Retourne `null`
 * si la saisie ne correspond à aucun des deux formats valides.
 */
export function resolveIdentifiant(raw: string): IdentifiantResolu | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (trimmed.includes('@')) {
    const email = trimmed.toLowerCase()
    return EMAIL_RE.test(email) ? { email, technique: false } : null
  }

  const slug = slugifyIdentifiant(trimmed)
  if (!IDENTIFIANT_RE.test(slug)) return null
  return { email: `${slug}@${AGENT_TECH_DOMAIN}`, technique: true }
}

/**
 * Résout la saisie du champ de connexion en valeur à passer à
 * signInWithPassword — complète avec le domaine technique si pas de "@",
 * sinon renvoie tel quel. Contrairement à resolveIdentifiant(), ne valide ni
 * ne rejette rien : une saisie invalide échouera simplement à l'authentification
 * (comportement Supabase existant, message générique "identifiants incorrects").
 */
export function resolveLoginValue(raw: string): string {
  const trimmed = raw.trim().toLowerCase()
  return trimmed.includes('@') ? trimmed : `${trimmed}@${AGENT_TECH_DOMAIN}`
}

/**
 * Pour l'affichage (liste agents, fiche, pré-remplissage du formulaire) :
 * masque le suffixe technique pour ne montrer que l'identifiant simple.
 * Les vrais emails (agents qui en ont un) restent affichés intégralement.
 */
export function displayIdentifiant(email: string | null | undefined): string {
  if (!email) return ''
  const suffix = `@${AGENT_TECH_DOMAIN}`
  return email.toLowerCase().endsWith(suffix) ? email.slice(0, -suffix.length) : email
}

/** Détecte une erreur Supabase Auth "email/identifiant déjà utilisé". */
export function isIdentifiantDejaPris(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  return err.code === 'email_exists' || /already.*registered|already.*exists|duplicate/i.test(err.message ?? '')
}
