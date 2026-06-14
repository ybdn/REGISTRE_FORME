import {
  Bouton,
  Carte,
  Champ,
  Corps,
  Ecran,
  LigneNavigation,
  SousTitre,
} from '@/design/composants';
import { couleurs, espace } from '@/design/theme';
import { type StatutSync, useMagasin } from '@/etat/magasin';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

/** Le chiffrement de bout en bout concerne tout contexte cloud : web (toujours connecté) ou mobile connecté. */
const EST_WEB = Platform.OS === 'web';

/** Libellé lisible de l'état de synchronisation. */
function libelleSync(statut: StatutSync, derniere: string | null): string {
  switch (statut) {
    case 'enCours':
      return 'Synchronisation en cours…';
    case 'ok':
      return derniere ? `À jour — ${new Date(derniere).toLocaleString('fr-FR')}` : 'À jour';
    case 'erreur':
      return 'Échec de la dernière synchronisation';
    case 'confirmationRequise':
      return 'Premier rapprochement à confirmer';
    default:
      return 'Connecté';
  }
}

/** Couleur de la pastille d'état de synchronisation. */
function couleurSync(statut: StatutSync): string {
  switch (statut) {
    case 'ok':
      return couleurs.freeletics;
    case 'erreur':
      return couleurs.alerte;
    case 'enCours':
      return couleurs.salle;
    case 'confirmationRequise':
      return couleurs.course;
    default:
      return couleurs.texteAttenue;
  }
}

/** Extrait un message d'erreur affichable (ErreurSauvegarde porte déjà un message rédigé). */
function messageErreur(e: unknown): string {
  return e instanceof Error ? e.message : 'Une erreur inattendue est survenue.';
}

export default function EcranReglages() {
  const router = useRouter();
  const { exporterSauvegarde, importerSauvegarde, genererRapport } = useMagasin();
  const sync = useMagasin((e) => e.sync);
  const connecterSync = useMagasin((e) => e.connecterSync);
  const deconnecterSync = useMagasin((e) => e.deconnecterSync);
  const synchroniserMaintenant = useMagasin((e) => e.synchroniserMaintenant);
  const ignorerRapprochement = useMagasin((e) => e.ignorerRapprochement);
  const e2ee = useMagasin((e) => e.e2ee);
  const activerE2EE = useMagasin((e) => e.activerE2EE);
  const deverrouillerE2EE = useMagasin((e) => e.deverrouillerE2EE);

  const [emailSync, setEmailSync] = useState('');
  const [mdpSync, setMdpSync] = useState('');
  const [passE2EE, setPassE2EE] = useState('');
  const [passE2EE2, setPassE2EE2] = useState('');
  const [erreurE2EE, setErreurE2EE] = useState<string | null>(null);

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

  const enCoursE2EE = e2ee.statut === 'enCours';

  function onActiverE2EE() {
    setErreurE2EE(null);
    if (passE2EE.length < 8) {
      setErreurE2EE('Choisis une phrase de chiffrement d’au moins 8 caractères.');
      return;
    }
    if (passE2EE !== passE2EE2) {
      setErreurE2EE('Les deux phrases de chiffrement ne correspondent pas.');
      return;
    }
    void activerE2EE(passE2EE).then(() => {
      setPassE2EE('');
      setPassE2EE2('');
    });
  }

  function onDeverrouillerE2EE() {
    setErreurE2EE(null);
    if (passE2EE.length === 0) {
      setErreurE2EE('Saisis ta phrase de chiffrement.');
      return;
    }
    void deverrouillerE2EE(passE2EE).then(() => setPassE2EE(''));
  }

  const messageE2EE = erreurE2EE ?? (e2ee.statut === 'erreur' ? e2ee.message : null);

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

      {/* Synchronisation cloud (opt-in, mobile) — docs/07 Phase 2. */}
      {sync.disponible ? (
        <Carte>
          <SousTitre>Synchronisation cloud</SousTitre>
          {sync.connecte ? (
            <>
              <Corps>
                Connecté{sync.email ? ` (${sync.email})` : ''}. Tes saisies remontent au cloud et
                redescendent sur tes autres appareils. Le moteur reste 100 % sur l’appareil.
              </Corps>
              <View style={styles.ligneSync}>
                <View style={[styles.pastille, { backgroundColor: couleurSync(sync.statut) }]} />
                <Text style={styles.etatSync}>{libelleSync(sync.statut, sync.derniere)}</Text>
              </View>
              {sync.statut === 'erreur' && sync.message ? (
                <Text style={styles.erreurSync}>{sync.message}</Text>
              ) : null}

              {sync.statut === 'confirmationRequise' ? (
                <Carte style={styles.carteErreur}>
                  <Corps>
                    Cet appareil et le cloud contiennent déjà des données. Fusionner peut écraser
                    des saisies si la même journée a été modifiée des deux côtés. Pense à exporter
                    une sauvegarde avant.
                  </Corps>
                  <Bouton
                    titre="Fusionner avec le cloud"
                    couleur={couleurs.course}
                    onPress={() => void synchroniserMaintenant(true)}
                  />
                  <Bouton titre="Plus tard" variante="secondaire" onPress={ignorerRapprochement} />
                </Carte>
              ) : (
                <Bouton
                  titre={sync.statut === 'enCours' ? 'Synchronisation…' : 'Synchroniser maintenant'}
                  couleur={couleurs.freeletics}
                  disabled={sync.statut === 'enCours'}
                  onPress={() => void synchroniserMaintenant()}
                />
              )}
              <Bouton
                titre="Se déconnecter"
                variante="secondaire"
                onPress={() => void deconnecterSync()}
              />
            </>
          ) : (
            <>
              <Corps>
                Connecte-toi à ton compte pour synchroniser tes données entre le mobile et le web.
                Déconnecté, l’app reste 100 % locale.
              </Corps>
              <Champ
                libelle="E-mail"
                valeur={emailSync}
                onChange={setEmailSync}
                placeholder="toi@exemple.fr"
              />
              <Champ libelle="Mot de passe" valeur={mdpSync} onChange={setMdpSync} secret />
              {sync.statut === 'erreur' && sync.message ? (
                <Text style={styles.erreurSync}>{sync.message}</Text>
              ) : null}
              <Bouton
                titre={sync.statut === 'enCours' ? 'Connexion…' : 'Se connecter'}
                couleur={couleurs.freeletics}
                disabled={sync.statut === 'enCours'}
                onPress={() => void connecterSync({ email: emailSync.trim(), motDePasse: mdpSync })}
              />
            </>
          )}
        </Carte>
      ) : null}

      {/* Chiffrement de bout en bout (opt-in) — docs/07 Phase 3. */}
      {sync.connecte || EST_WEB ? (
        <Carte>
          <SousTitre>Chiffrement de bout en bout</SousTitre>
          {e2ee.deverrouille ? (
            <>
              <View style={styles.ligneSync}>
                <View style={[styles.pastille, { backgroundColor: couleurs.freeletics }]} />
                <Text style={styles.etatSync}>Actif — tes données cloud sont chiffrées</Text>
              </View>
              <Corps>
                Le serveur ne stocke que de l’opaque, illisible sans ta phrase de chiffrement. Cette
                phrase reste sur l’appareil (jamais envoyée) et n’est pas conservée entre deux
                ouvertures de l’app.
              </Corps>
            </>
          ) : e2ee.configure ? (
            <>
              <Corps>
                Ce compte est chiffré. Saisis ta phrase de chiffrement pour déverrouiller et
                synchroniser sur cet appareil.
              </Corps>
              <Champ
                libelle="Phrase de chiffrement"
                valeur={passE2EE}
                onChange={setPassE2EE}
                secret
              />
              {messageE2EE ? <Text style={styles.erreurSync}>{messageE2EE}</Text> : null}
              <Bouton
                titre={enCoursE2EE ? 'Déverrouillage…' : 'Déverrouiller'}
                couleur={couleurs.freeletics}
                disabled={enCoursE2EE}
                onPress={onDeverrouillerE2EE}
              />
            </>
          ) : (
            <>
              <Corps>
                Chiffre tes données santé sur l’appareil avant de les envoyer : le serveur ne pourra
                jamais les lire. Choisis une phrase de chiffrement distincte de ton mot de passe de
                connexion.
              </Corps>
              <Champ
                libelle="Phrase de chiffrement"
                valeur={passE2EE}
                onChange={setPassE2EE}
                secret
                placeholder="8 caractères minimum"
              />
              <Champ
                libelle="Confirmer la phrase"
                valeur={passE2EE2}
                onChange={setPassE2EE2}
                secret
              />
              {messageE2EE ? <Text style={styles.erreurSync}>{messageE2EE}</Text> : null}
              <Bouton
                titre={enCoursE2EE ? 'Activation…' : 'Activer le chiffrement'}
                couleur={couleurs.salle}
                disabled={enCoursE2EE}
                onPress={onActiverE2EE}
              />
              <Corps style={styles.avertE2EE}>
                ⚠️ Phrase de chiffrement perdue = données cloud irrécupérables (aucune récupération
                serveur possible). Note-la en lieu sûr.
              </Corps>
            </>
          )}
        </Carte>
      ) : null}

      <Corps>
        Les sauvegardes, le rapport et l’import de séances restent locaux : rien ne transite par un
        serveur. Le partage utilise la feuille système de ton téléphone.
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
  ligneSync: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espace.sm,
    marginVertical: espace.xs,
  },
  pastille: { width: 10, height: 10, borderRadius: 5 },
  etatSync: { color: couleurs.texteAttenue, fontSize: 13 },
  erreurSync: { color: couleurs.sante, fontSize: 13, marginBottom: espace.sm },
  avertE2EE: { color: couleurs.texteAttenue, fontSize: 12, marginTop: espace.xs },
});
