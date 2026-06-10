// Design system « registre opérationnel » : sombre, dense, sans gamification.
// Source unique de vérité pour couleurs, typographie et espacements.

export const couleurs = {
  fond: '#0F141B',
  surface: '#18202B',
  trait: '#2A3442',
  texte: '#E6ECF2',
  texteAttenue: '#8C99A8',
  // Accents par domaine (= pastilles du semainier).
  course: '#FF8A3D',
  salle: '#5B8DEF',
  freeletics: '#3FD0A4',
  sante: '#E66B8A',
  alerte: '#E66B8A',
} as const;

/** Couleur d'accent associée à un type de séance. */
export const couleurType = {
  course: couleurs.course,
  salle: couleurs.salle,
  freeletics: couleurs.freeletics,
  sante: couleurs.sante,
} as const;

export const typo = {
  // Space Grotesk pour les titres, JetBrains Mono pour les données chiffrées.
  titre: 'SpaceGrotesk_600SemiBold',
  titreRegular: 'SpaceGrotesk_400Regular',
  donnees: 'JetBrainsMono_500Medium',
  corps: 'SpaceGrotesk_400Regular',
} as const;

export const espace = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const rayon = {
  sm: 6,
  md: 10,
  lg: 14,
} as const;
