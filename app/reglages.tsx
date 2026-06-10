import { Bouton, Carte, Corps, Ecran, SousTitre, Titre } from '@/design/composants';
import { couleurs, espace, rayon, typo } from '@/design/theme';
import { useMagasin } from '@/etat/magasin';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

/** Extrait un message d'erreur affichable (ErreurSauvegarde porte déjà un message rédigé). */
function messageErreur(e: unknown): string {
  return e instanceof Error ? e.message : 'Une erreur inattendue est survenue.';
}

export default function EcranReglages() {
  const { exporterSauvegarde, importerSauvegarde, genererRapport } = useMagasin();

  const [passExport, setPassExport] = useState('');
  const [passExport2, setPassExport2] = useState('');
  const [passImport, setPassImport] = useState('');
  const [contenuImport, setContenuImport] = useState('');

  const [enCours, setEnCours] = useState<null | 'rapport' | 'export' | 'import'>(null);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);

  async function lancer(
    action: 'rapport' | 'export' | 'import',
    fn: () => Promise<void>,
    succes: string,
  ) {
    setRetour(null);
    setEnCours(action);
    try {
      await fn();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setRetour({ ok: true, texte: succes });
    } catch (e) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setRetour({ ok: false, texte: messageErreur(e) });
    } finally {
      setEnCours(null);
    }
  }

  function onExport() {
    if (passExport.length < 8) {
      setRetour({ ok: false, texte: 'Choisis une phrase secrète d’au moins 8 caractères.' });
      return;
    }
    if (passExport !== passExport2) {
      setRetour({ ok: false, texte: 'Les deux phrases secrètes ne correspondent pas.' });
      return;
    }
    void lancer(
      'export',
      () => exporterSauvegarde(passExport),
      'Sauvegarde chiffrée prête à être partagée.',
    );
  }

  function onImport() {
    if (contenuImport.trim().length === 0) {
      setRetour({ ok: false, texte: 'Colle le contenu d’un fichier de sauvegarde (.rfb).' });
      return;
    }
    void lancer(
      'import',
      () => importerSauvegarde(contenuImport.trim(), passImport),
      'Sauvegarde restaurée. Tes données ont été remplacées.',
    );
  }

  return (
    <Ecran>
      <Titre>Réglages & données</Titre>
      <Corps>
        Toutes ces actions restent locales : rien ne transite par un serveur. Le partage utilise la
        feuille système de ton téléphone.
      </Corps>

      {retour ? (
        <Carte style={retour.ok ? styles.carteSucces : styles.carteErreur}>
          <Corps style={{ color: retour.ok ? couleurs.course : couleurs.sante }}>
            {retour.texte}
          </Corps>
        </Carte>
      ) : null}

      {/* Rapport gastro PDF. */}
      <Carte>
        <SousTitre>Rapport pour le gastro-entérologue</SousTitre>
        <Corps>
          Synthèse PDF des 90 derniers jours : signaux Crohn, activité, poids et adaptations. À
          imprimer ou envoyer à ton médecin.
        </Corps>
        <Bouton
          titre={enCours === 'rapport' ? 'Génération…' : 'Générer le rapport PDF'}
          couleur={couleurs.course}
          disabled={enCours !== null}
          onPress={() =>
            void lancer('rapport', genererRapport, 'Rapport PDF généré et prêt à partager.')
          }
        />
      </Carte>

      {/* Export chiffré. */}
      <Carte>
        <SousTitre>Exporter une sauvegarde chiffrée</SousTitre>
        <Corps>
          Sauvegarde complète chiffrée (AES-256) par une phrase secrète. Indispensable pour changer
          d’appareil. Sans cette phrase, la sauvegarde est irrécupérable : note-la en lieu sûr.
        </Corps>
        <Champ
          libelle="Phrase secrète"
          valeur={passExport}
          onChange={setPassExport}
          secret
          placeholder="8 caractères minimum"
        />
        <Champ
          libelle="Confirmer la phrase secrète"
          valeur={passExport2}
          onChange={setPassExport2}
          secret
        />
        <Bouton
          titre={enCours === 'export' ? 'Chiffrement…' : 'Exporter et partager'}
          couleur={couleurs.salle}
          disabled={enCours !== null}
          onPress={onExport}
        />
      </Carte>

      {/* Import / restauration. */}
      <Carte>
        <SousTitre>Restaurer une sauvegarde</SousTitre>
        <Corps>
          Colle le contenu d’un fichier .rfb puis saisis sa phrase secrète. ⚠️ La restauration
          remplace toutes les données actuelles de l’appareil.
        </Corps>
        <Champ
          libelle="Phrase secrète de la sauvegarde"
          valeur={passImport}
          onChange={setPassImport}
          secret
        />
        <View style={styles.champ}>
          <Text style={styles.champLibelle}>Contenu chiffré (.rfb)</Text>
          <TextInput
            value={contenuImport}
            onChangeText={setContenuImport}
            multiline
            numberOfLines={4}
            placeholder="Colle ici le contenu du fichier de sauvegarde"
            placeholderTextColor={couleurs.texteAttenue}
            style={[styles.input, styles.inputMultiligne]}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <Bouton
          titre={enCours === 'import' ? 'Restauration…' : 'Restaurer (remplace tout)'}
          variante="secondaire"
          disabled={enCours !== null}
          onPress={onImport}
        />
      </Carte>
    </Ecran>
  );
}

function Champ({
  libelle,
  valeur,
  onChange,
  secret,
  placeholder,
}: {
  libelle: string;
  valeur: string;
  onChange: (v: string) => void;
  secret?: boolean;
  placeholder?: string;
}) {
  return (
    <View style={styles.champ}>
      <Text style={styles.champLibelle}>{libelle}</Text>
      <TextInput
        value={valeur}
        onChangeText={onChange}
        secureTextEntry={secret}
        placeholder={placeholder}
        placeholderTextColor={couleurs.texteAttenue}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  carteSucces: { borderColor: couleurs.course },
  carteErreur: { borderColor: couleurs.sante },
  champ: { gap: espace.xs },
  champLibelle: { fontFamily: typo.corps, fontSize: 13, color: couleurs.texteAttenue },
  input: {
    fontFamily: typo.donnees,
    fontSize: 15,
    color: couleurs.texte,
    borderWidth: 1,
    borderColor: couleurs.trait,
    borderRadius: rayon.sm,
    paddingHorizontal: espace.md,
    paddingVertical: espace.sm,
  },
  inputMultiligne: { minHeight: 90, textAlignVertical: 'top' },
});
