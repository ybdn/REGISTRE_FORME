import {
  Bouton,
  Carte,
  Champ,
  Corps,
  Ecran,
  LigneNavigation,
  SousTitre,
} from '@/design/composants';
import { couleurs } from '@/design/theme';
import { useMagasin } from '@/etat/magasin';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

/** Extrait un message d'erreur affichable (ErreurSauvegarde porte déjà un message rédigé). */
function messageErreur(e: unknown): string {
  return e instanceof Error ? e.message : 'Une erreur inattendue est survenue.';
}

export default function EcranReglages() {
  const router = useRouter();
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
      {/* Comprendre l'app : seuils personnels et règles du moteur. */}
      <LigneNavigation
        titre="Mes seuils"
        detail="Ta normale personnelle et les garde-fous absolus"
        icone="sliders"
        couleur={couleurs.sante}
        onPress={() => router.push('/seuils')}
      />
      <LigneNavigation
        titre="Comment ça marche"
        detail="Les règles du moteur, lisibles et vérifiables"
        icone="help-circle"
        couleur={couleurs.freeletics}
        onPress={() => router.push('/apropos')}
      />
      <LigneNavigation
        titre="Importer des séances"
        detail="Strava, Freeletics… via Santé Connect, en local"
        icone="activity"
        couleur={couleurs.course}
        onPress={() => router.push('/sante-connect')}
      />

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
        <Champ
          libelle="Contenu chiffré (.rfb)"
          valeur={contenuImport}
          onChange={setContenuImport}
          multiligne
          placeholder="Colle ici le contenu du fichier de sauvegarde"
        />
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

const styles = StyleSheet.create({
  carteSucces: { borderColor: couleurs.course },
  carteErreur: { borderColor: couleurs.sante },
});
