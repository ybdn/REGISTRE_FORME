import { Bouton, Carte, Corps, Ecran, SousTitre } from '@/design/composants';
import { couleurs } from '@/design/theme';
import { FENETRE_IMPORT_SANTE_CONNECT_JOURS } from '@/domaine';
import { useMagasin } from '@/etat/magasin';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

// Écran Santé Connect : import local des séances faites dans Strava, Freeletics,
// Google Fit… Aucune connexion ni compte : Android gère les permissions, tout
// reste sur l'appareil.

/** Extrait un message d'erreur affichable (ErreurSanteConnect porte déjà un message rédigé). */
function messageErreur(e: unknown): string {
  return e instanceof Error ? e.message : 'Une erreur inattendue est survenue.';
}

export default function EcranSanteConnect() {
  const { santeConnectDisponible, importerSeancesExternes } = useMagasin();

  const [disponible, setDisponible] = useState<boolean | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);

  useEffect(() => {
    void santeConnectDisponible().then(setDisponible);
  }, [santeConnectDisponible]);

  function onImporter() {
    setRetour(null);
    setEnCours(true);
    void (async () => {
      try {
        const r = await importerSeancesExternes();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setRetour({
          ok: true,
          texte:
            r.importees === 0 && r.dejaPresentes === 0
              ? `Aucune séance trouvée dans Santé Connect sur les ${FENETRE_IMPORT_SANTE_CONNECT_JOURS} derniers jours.`
              : `${r.importees} séance(s) importée(s), ${r.dejaPresentes} déjà présente(s).`,
        });
      } catch (e) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setRetour({ ok: false, texte: messageErreur(e) });
      } finally {
        setEnCours(false);
      }
    })();
  }

  return (
    <Ecran>
      <Corps>
        Santé Connect est la base santé locale de ton téléphone : les séances que Strava, Freeletics
        ou Google Fit y écrivent peuvent être importées ici comme séances réalisées. Tout reste sur
        l’appareil, aucune donnée ne transite par un serveur.
      </Corps>

      {retour ? (
        <Carte style={retour.ok ? styles.carteSucces : styles.carteErreur}>
          <Corps style={{ color: retour.ok ? couleurs.course : couleurs.sante }}>
            {retour.texte}
          </Corps>
        </Carte>
      ) : null}

      {disponible === false ? (
        <Carte style={styles.carteErreur}>
          <SousTitre>Santé Connect indisponible</SousTitre>
          <Corps>
            Installe l’app « Santé Connect » depuis le Play Store (incluse dans Android 14+), puis
            reviens ici.
          </Corps>
        </Carte>
      ) : (
        <>
          <Carte>
            <SousTitre>Avant le premier import</SousTitre>
            <Corps>
              Active l’écriture vers Santé Connect dans chaque app source : dans Strava, Réglages →
              Applications et appareils → Health Connect ; dans Freeletics, Profil → Réglages → «
              Sync with Health Connect ». Au premier import, Android te demandera d’autoriser la
              lecture (révocable à tout moment).
            </Corps>
          </Carte>
          <Carte>
            <SousTitre>Importer tes séances</SousTitre>
            <Corps>
              Récupère les sessions d’exercice des {FENETRE_IMPORT_SANTE_CONNECT_JOURS} derniers
              jours et les enregistre comme séances réalisées : elles comptent dans ta charge
              d’entraînement comme les autres. Chaque session n’est importée qu’une fois, et le RPE
              est estimé par une règle lisible, notée sur chaque séance.
            </Corps>
            <Bouton
              titre={
                enCours
                  ? 'Import…'
                  : `Importer les ${FENETRE_IMPORT_SANTE_CONNECT_JOURS} derniers jours`
              }
              couleur={couleurs.course}
              disabled={enCours || disponible === null}
              onPress={onImporter}
            />
          </Carte>
        </>
      )}
    </Ecran>
  );
}

const styles = StyleSheet.create({
  carteSucces: { borderColor: couleurs.course },
  carteErreur: { borderColor: couleurs.sante },
});
