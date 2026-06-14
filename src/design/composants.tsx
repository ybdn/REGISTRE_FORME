import { Feather } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import {
  Platform,
  Pressable,
  type PressableProps,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextProps,
  View,
  type ViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Polyline } from 'react-native-svg';
import { couleurs, espace, largeurMaxContenu, rayon, typo } from './theme';

// Briques UI réutilisables. Esthétique sobre et dense, zéro gamification.

// État fourni par le callback `style` d'un Pressable. `hovered` est ajouté par react-native-web
// (survol pointeur) mais absent des types RN : on l'expose ici pour les affordances desktop.
type EtatSurvol = { pressed: boolean; hovered?: boolean };

/** L'app cible le pointeur (souris) uniquement sur web : ailleurs `hovered` reste indéfini. */
const SUR_WEB = Platform.OS === 'web';

/**
 * Conteneur d'écran. Par défaut le bord haut N'est PAS inclus dans le safe-area : les écrans
 * sont rendus sous un header de Stack qui gère déjà l'encoche (sinon double marge en haut).
 * Passer `bordHaut` pour les écrans sans header (ex. onboarding).
 */
export function Ecran({ children, bordHaut = false }: { children: ReactNode; bordHaut?: boolean }) {
  const edges = bordHaut ? (['top', 'left', 'right'] as const) : (['left', 'right'] as const);
  return (
    <SafeAreaView style={styles.ecran} edges={edges}>
      {/* Le contenu reste une colonne centrée à largeur de lecture : sur desktop web il ne
          s'étire pas sur toute la fenêtre, sur mobile la contrainte est sans effet. */}
      <ScrollView contentContainerStyle={styles.scrollExterne}>
        <View style={styles.contenu}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function Carte({ children, style, ...rest }: ViewProps & { children: ReactNode }) {
  return (
    <View style={[styles.carte, style]} {...rest}>
      {children}
    </View>
  );
}

export function Titre({ children, style, ...rest }: TextProps & { children: ReactNode }) {
  return (
    <Text style={[styles.titre, style]} {...rest}>
      {children}
    </Text>
  );
}

export function SousTitre({ children, style, ...rest }: TextProps & { children: ReactNode }) {
  return (
    <Text style={[styles.sousTitre, style]} {...rest}>
      {children}
    </Text>
  );
}

export function Corps({ children, style, ...rest }: TextProps & { children: ReactNode }) {
  return (
    <Text style={[styles.corps, style]} {...rest}>
      {children}
    </Text>
  );
}

/** Donnée chiffrée mise en valeur (JetBrains Mono). */
export function Donnee({
  valeur,
  unite,
  couleur = couleurs.texte,
}: {
  valeur: string | number;
  unite?: string;
  couleur?: string;
}) {
  return (
    <Text style={[styles.donnee, { color: couleur }]}>
      {valeur}
      {unite ? <Text style={styles.unite}> {unite}</Text> : null}
    </Text>
  );
}

export function Bouton({
  titre,
  variante = 'principal',
  couleur = couleurs.salle,
  disabled,
  style,
  ...rest
}: PressableProps & {
  titre: string;
  variante?: 'principal' | 'secondaire';
  couleur?: string;
}) {
  const principal = variante === 'principal';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      style={({ pressed, hovered }: EtatSurvol) => [
        styles.bouton,
        principal ? { backgroundColor: couleur } : { borderWidth: 1, borderColor: couleurs.trait },
        hovered && !disabled && styles.boutonSurvol,
        pressed && styles.boutonPresse,
        disabled && styles.boutonInactif,
        style as object,
      ]}
      {...rest}
    >
      <Text style={[styles.boutonTexte, !principal && { color: couleurs.texte }]}>{titre}</Text>
    </Pressable>
  );
}

/** Sélecteur segmenté à deux ou trois options (ex. Aujourd'hui / Hier). */
export function Segments<T extends string>({
  options,
  valeur,
  onChange,
  couleur = couleurs.sante,
}: {
  options: { valeur: T; libelle: string }[];
  valeur: T;
  onChange: (v: T) => void;
  couleur?: string;
}) {
  return (
    <View style={styles.segments}>
      {options.map((o) => {
        const actif = o.valeur === valeur;
        return (
          <Pressable
            key={o.valeur}
            accessibilityRole="button"
            accessibilityState={{ selected: actif }}
            onPress={() => onChange(o.valeur)}
            style={({ hovered }: EtatSurvol) => [
              styles.segment,
              hovered && !actif && styles.survol,
              actif && { backgroundColor: couleur, borderColor: couleur },
            ]}
          >
            <Text style={[styles.segmentTexte, actif && styles.segmentTexteActif]}>
              {o.libelle}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Navigateur de date : ◀ libellé ▶. Permet de défiler jour par jour dans
 * l'historique (journal, alimentation). La flèche « suivant » se désactive
 * quand on ne peut pas avancer (futur bloqué).
 */
export function NavigateurDate({
  libelle,
  onPrecedent,
  onSuivant,
  suivantDesactive = false,
  precedentDesactive = false,
}: {
  libelle: string;
  onPrecedent: () => void;
  onSuivant: () => void;
  suivantDesactive?: boolean;
  precedentDesactive?: boolean;
}) {
  return (
    <View style={styles.navDate}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Jour précédent"
        disabled={precedentDesactive}
        onPress={onPrecedent}
        style={({ hovered }: EtatSurvol) => [
          styles.navDateFleche,
          hovered && !precedentDesactive && styles.navDateFlecheSurvol,
          precedentDesactive && styles.navDateFlecheInactive,
        ]}
      >
        <Feather name="chevron-left" size={22} color={couleurs.texte} />
      </Pressable>
      <Text style={styles.navDateLibelle}>{libelle}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Jour suivant"
        disabled={suivantDesactive}
        onPress={onSuivant}
        style={({ hovered }: EtatSurvol) => [
          styles.navDateFleche,
          hovered && !suivantDesactive && styles.navDateFlecheSurvol,
          suivantDesactive && styles.navDateFlecheInactive,
        ]}
      >
        <Feather name="chevron-right" size={22} color={couleurs.texte} />
      </Pressable>
    </View>
  );
}

/** Chip activable (tags du journal, aliments). */
export function Chip({
  libelle,
  actif,
  onPress,
  couleur = couleurs.salle,
}: {
  libelle: string;
  actif: boolean;
  onPress: () => void;
  couleur?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: actif }}
      onPress={onPress}
      style={({ hovered }: EtatSurvol) => [
        styles.chip,
        hovered && !actif && styles.survol,
        actif && { backgroundColor: couleur, borderColor: couleur },
      ]}
    >
      <Text style={[styles.chipTexte, actif && styles.chipTexteActif]}>{libelle}</Text>
    </Pressable>
  );
}

/** Champ de saisie avec libellé (texte ou numérique). */
export function Champ({
  libelle,
  valeur,
  onChange,
  clavier = 'default',
  secret,
  placeholder,
  multiligne,
  style,
}: {
  libelle: string;
  valeur: string;
  onChange: (v: string) => void;
  clavier?: 'default' | 'numeric';
  secret?: boolean;
  placeholder?: string;
  multiligne?: boolean;
  style?: object;
}) {
  return (
    <View style={[styles.champ, style]}>
      <Text style={styles.champLibelle}>{libelle}</Text>
      <TextInput
        value={valeur}
        onChangeText={onChange}
        keyboardType={clavier}
        secureTextEntry={secret}
        multiline={multiligne}
        placeholder={placeholder}
        placeholderTextColor={couleurs.texteAttenue}
        autoCapitalize={clavier === 'default' && !secret ? 'sentences' : 'none'}
        autoCorrect={false}
        style={[styles.champInput, multiligne && styles.champInputMultiligne]}
      />
    </View>
  );
}

/** Ligne « libellé : valeur » avec filet — listes de stats (bilan, records, historique). */
export function LigneInfo({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <View style={styles.ligneInfo}>
      <Text style={styles.ligneInfoLibelle}>{libelle}</Text>
      <Text style={styles.ligneInfoValeur}>{valeur}</Text>
    </View>
  );
}

/** Ligne de navigation avec icône et chevron (hubs : réglages, accès rapides). */
export function LigneNavigation({
  titre,
  detail,
  icone,
  couleur = couleurs.texteAttenue,
  onPress,
}: {
  titre: string;
  detail?: string;
  icone: keyof typeof Feather.glyphMap;
  couleur?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed, hovered }: EtatSurvol) => [
        styles.ligneNav,
        hovered && styles.survol,
        pressed && styles.boutonPresse,
      ]}
    >
      <Feather name={icone} size={18} color={couleur} />
      <View style={styles.ligneNavTextes}>
        <Text style={styles.ligneNavTitre}>{titre}</Text>
        {detail ? <Text style={styles.ligneNavDetail}>{detail}</Text> : null}
      </View>
      <Feather name="chevron-right" size={18} color={couleurs.texteAttenue} />
    </Pressable>
  );
}

/** Barre de progression horizontale (0-100). */
export function Jauge({ valeur, couleur = couleurs.salle }: { valeur: number; couleur?: string }) {
  const pct = Math.max(0, Math.min(100, valeur));
  return (
    <View style={styles.jauge}>
      <View style={[styles.jaugeRemplie, { width: `${pct}%`, backgroundColor: couleur }]} />
    </View>
  );
}

/** Sélecteur segmenté (échelle 0-10 / 1-5) — saisie rapide sans clavier. */
export function Echelle({
  min,
  max,
  valeur,
  onChange,
  couleur = couleurs.salle,
}: {
  min: number;
  max: number;
  valeur: number;
  onChange: (v: number) => void;
  couleur?: string;
}) {
  const valeurs = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <View style={styles.echelle}>
      {valeurs.map((v) => {
        const actif = v === valeur;
        return (
          <Pressable
            key={v}
            accessibilityRole="button"
            accessibilityState={{ selected: actif }}
            onPress={() => onChange(v)}
            style={({ hovered }: EtatSurvol) => [
              styles.echelleItem,
              hovered && !actif && styles.survol,
              actif && { backgroundColor: couleur, borderColor: couleur },
            ]}
          >
            <Text style={[styles.echelleTexte, actif && styles.echelleTexteActif]}>{v}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Courbe de tendance minimaliste (sans axes ni labels) — ex. évolution du poids. */
export function Courbe({
  valeurs,
  couleur = couleurs.salle,
  hauteur = 80,
}: {
  valeurs: number[];
  couleur?: string;
  hauteur?: number;
}) {
  const min = Math.min(...valeurs);
  const max = Math.max(...valeurs);
  const etendue = max - min || 1;
  const points = valeurs
    .map((v, i) => {
      const x = valeurs.length > 1 ? (i / (valeurs.length - 1)) * 100 : 50;
      const y = hauteur - ((v - min) / etendue) * hauteur;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <Svg width="100%" height={hauteur} viewBox={`0 0 100 ${hauteur}`} preserveAspectRatio="none">
      <Polyline
        points={points}
        fill="none"
        stroke={couleur}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </Svg>
  );
}

/** Pastille colorée du semainier. */
export function Pastille({ couleur, plein }: { couleur: string; plein: boolean }) {
  return (
    <View
      style={[
        styles.pastille,
        plein ? { backgroundColor: couleur } : { borderColor: couleur, borderWidth: 2 },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: couleurs.fond },
  // Conteneur du ScrollView : centre la colonne de contenu horizontalement (desktop web).
  scrollExterne: { flexGrow: 1, alignItems: 'center' },
  contenu: {
    width: '100%',
    maxWidth: largeurMaxContenu,
    padding: espace.lg,
    gap: espace.lg,
    paddingBottom: espace.xxl,
  },
  // Retour visuel au survol pointeur (web). `pointerEvents` reste géré par Pressable.
  survol: SUR_WEB
    ? { backgroundColor: couleurs.surfaceSurvol, borderColor: couleurs.texteAttenue }
    : {},
  carte: {
    backgroundColor: couleurs.surface,
    borderRadius: rayon.lg,
    borderWidth: 1,
    borderColor: couleurs.trait,
    padding: espace.lg,
    gap: espace.sm,
  },
  titre: { fontFamily: typo.titre, fontSize: 22, color: couleurs.texte },
  sousTitre: { fontFamily: typo.titre, fontSize: 16, color: couleurs.texte },
  corps: { fontFamily: typo.corps, fontSize: 14, color: couleurs.texteAttenue, lineHeight: 20 },
  donnee: { fontFamily: typo.donnees, fontSize: 28 },
  unite: { fontFamily: typo.donnees, fontSize: 14, color: couleurs.texteAttenue },
  bouton: {
    borderRadius: rayon.md,
    paddingVertical: espace.md,
    paddingHorizontal: espace.lg,
    alignItems: 'center',
  },
  boutonPresse: { opacity: 0.7 },
  // Survol bouton : léger éclaircissement (conserve la couleur d'accent du bouton plein).
  boutonSurvol: SUR_WEB ? { opacity: 0.9 } : {},
  boutonInactif: { opacity: 0.5 },
  boutonTexte: { fontFamily: typo.titre, fontSize: 15, color: couleurs.encre },
  segments: { flexDirection: 'row', gap: espace.sm },
  segment: {
    flex: 1,
    paddingVertical: espace.sm,
    borderRadius: rayon.md,
    borderWidth: 1,
    borderColor: couleurs.trait,
    alignItems: 'center',
  },
  segmentTexte: { fontFamily: typo.corps, fontSize: 13, color: couleurs.texteAttenue },
  segmentTexteActif: { color: couleurs.encre, fontFamily: typo.titre },
  navDate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: couleurs.trait,
    borderRadius: rayon.md,
    paddingHorizontal: espace.xs,
  },
  navDateFleche: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: rayon.sm,
  },
  navDateFlecheSurvol: SUR_WEB ? { backgroundColor: couleurs.surfaceSurvol } : {},
  navDateFlecheInactive: { opacity: 0.25 },
  navDateLibelle: { fontFamily: typo.titre, fontSize: 15, color: couleurs.texte },
  chip: {
    paddingHorizontal: espace.md,
    paddingVertical: espace.xs + 2,
    borderRadius: rayon.lg,
    borderWidth: 1,
    borderColor: couleurs.trait,
  },
  chipTexte: { fontFamily: typo.corps, fontSize: 12, color: couleurs.texteAttenue },
  chipTexteActif: { color: couleurs.encre },
  champ: { gap: espace.xs },
  champLibelle: { fontFamily: typo.corps, fontSize: 13, color: couleurs.texteAttenue },
  champInput: {
    fontFamily: typo.donnees,
    fontSize: 15,
    color: couleurs.texte,
    borderWidth: 1,
    borderColor: couleurs.trait,
    borderRadius: rayon.sm,
    paddingHorizontal: espace.md,
    paddingVertical: espace.sm,
  },
  champInputMultiligne: { minHeight: 90, textAlignVertical: 'top' },
  ligneInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: espace.xs,
    borderBottomWidth: 1,
    borderBottomColor: couleurs.trait,
  },
  ligneInfoLibelle: { fontFamily: typo.corps, fontSize: 14, color: couleurs.texte },
  ligneInfoValeur: { fontFamily: typo.donnees, fontSize: 14, color: couleurs.texteAttenue },
  ligneNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espace.md,
    backgroundColor: couleurs.surface,
    borderRadius: rayon.lg,
    borderWidth: 1,
    borderColor: couleurs.trait,
    paddingVertical: espace.md,
    paddingHorizontal: espace.lg,
  },
  ligneNavTextes: { flex: 1, gap: 2 },
  ligneNavTitre: { fontFamily: typo.titre, fontSize: 14, color: couleurs.texte },
  ligneNavDetail: { fontFamily: typo.corps, fontSize: 12, color: couleurs.texteAttenue },
  jauge: {
    height: 6,
    backgroundColor: couleurs.fond,
    borderRadius: 3,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: couleurs.trait,
  },
  jaugeRemplie: { height: '100%' },
  echelle: { flexDirection: 'row', flexWrap: 'wrap', gap: espace.xs },
  echelleItem: {
    minWidth: 38,
    height: 38,
    borderRadius: rayon.sm,
    borderWidth: 1,
    borderColor: couleurs.trait,
    alignItems: 'center',
    justifyContent: 'center',
  },
  echelleTexte: { fontFamily: typo.donnees, fontSize: 14, color: couleurs.texteAttenue },
  echelleTexteActif: { color: couleurs.encre },
  pastille: { width: 14, height: 14, borderRadius: 7 },
});
