import { couleurs } from '@/design/theme';
import { sessionActuelle, surChangementAuth } from '@/donnees/auth';
import { configurerHandlerNotifications } from '@/donnees/notifications';
import { useMagasin } from '@/etat/magasin';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_600SemiBold,
  useFonts,
} from '@expo-google-fonts/space-grotesk';
import type { Session } from '@supabase/supabase-js';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Connexion from './connexion';
import Deverrouillage from './deverrouillage';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Affiche les rappels locaux même app au premier plan (no-op sur web, cf. notifications.web.ts).
configurerHandlerNotifications();

// Sur web, la sync cloud impose une connexion (Phase 1) ; sur mobile, l'app reste 100 % locale.
const SUR_WEB = Platform.OS === 'web';

export default function Layout() {
  const [policesPretes, erreurPolices] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_600SemiBold,
    JetBrainsMono_500Medium,
  });
  const pret = useMagasin((e) => e.pret);
  const etape = useMagasin((e) => e.etape);
  const e2ee = useMagasin((e) => e.e2ee);
  const initialiser = useMagasin((e) => e.initialiser);
  const [erreurInit, setErreurInit] = useState<string | null>(null);
  // `undefined` = session en cours de vérification (web) ; `null` = déconnecté ; mobile : ignoré.
  const [session, setSession] = useState<Session | null | undefined>(SUR_WEB ? undefined : null);

  // Web : vérifier la session restaurée et observer connexion/déconnexion avant toute init.
  useEffect(() => {
    if (!SUR_WEB) return;
    let actif = true;
    sessionActuelle()
      .then((s) => actif && setSession(s))
      .catch(() => actif && setSession(null));
    const off = surChangementAuth((s) => setSession(s));
    return () => {
      actif = false;
      off();
    };
  }, []);

  // Initialisation du store : directe sur mobile, conditionnée à la session sur web.
  useEffect(() => {
    if (SUR_WEB && !session) return;
    initialiser().catch((err) => {
      console.error('Init échouée', err);
      setErreurInit(err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err));
    });
  }, [initialiser, session]);

  // Mobile : synchronisation au retour au premier plan (no-op si non connecté à la sync cloud).
  useEffect(() => {
    if (SUR_WEB) return;
    const sub = AppState.addEventListener('change', (etatApp) => {
      if (etatApp === 'active') void useMagasin.getState().synchroniserMaintenant();
    });
    return () => sub.remove();
  }, []);

  // On ne bloque plus sur les polices : une erreur de police laisse passer (fallback système).
  const policesOk = policesPretes || !!erreurPolices;

  useEffect(() => {
    if (policesOk && (pret || erreurInit)) SplashScreen.hideAsync().catch(() => {});
  }, [policesOk, pret, erreurInit]);

  // Web : tant que la session n'est pas connue, on attend ; déconnecté → écran de connexion.
  if (SUR_WEB && policesOk && session === undefined) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: couleurs.fond,
          justifyContent: 'center',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <ActivityIndicator color={couleurs.salle} />
        <Text style={{ color: couleurs.texteAttenue, fontSize: 13 }}>
          Vérification de la session…
        </Text>
      </View>
    );
  }
  if (SUR_WEB && policesOk && session === null) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Connexion />
      </SafeAreaProvider>
    );
  }

  // Web : compte chiffré (E2EE) pas encore déverrouillé cette session → saisie de la passphrase
  // avant toute lecture (le contenu cloud est opaque tant que la clé n'est pas en mémoire).
  if (SUR_WEB && policesOk && session && e2ee.configure && !e2ee.deverrouille) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Deverrouillage />
      </SafeAreaProvider>
    );
  }

  // Erreur d'initialisation visible à l'écran (au lieu d'un spinner infini).
  if (erreurInit) {
    return (
      <View
        style={{ flex: 1, backgroundColor: couleurs.fond, padding: 24, justifyContent: 'center' }}
      >
        <Text style={{ color: couleurs.sante, fontSize: 18, marginBottom: 12 }}>
          Erreur d’initialisation
        </Text>
        <ScrollView style={{ maxHeight: 400 }}>
          <Text style={{ color: couleurs.texte, fontSize: 12, fontFamily: 'monospace' }}>
            {erreurInit}
          </Text>
        </ScrollView>
      </View>
    );
  }

  if (!policesOk || !pret) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: couleurs.fond,
          justifyContent: 'center',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <ActivityIndicator color={couleurs.salle} />
        <Text style={{ color: couleurs.texte, fontSize: 13 }}>Étape : {etape}</Text>
        <Text style={{ color: couleurs.texteAttenue, fontSize: 12 }}>
          polices : {policesPretes ? 'ok' : erreurPolices ? 'erreur' : 'chargement'}
        </Text>
        {erreurPolices ? (
          <Text style={{ color: couleurs.sante, fontSize: 11, paddingHorizontal: 24 }}>
            {String(erreurPolices)}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: couleurs.fond },
          headerTintColor: couleurs.texte,
          headerTitleStyle: { fontFamily: 'SpaceGrotesk_600SemiBold' },
          contentStyle: { backgroundColor: couleurs.fond },
        }}
      >
        <Stack.Screen name="(onglets)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="seance" options={{ title: 'Séance du jour' }} />
        <Stack.Screen name="seance-libre" options={{ title: 'Séance libre' }} />
        <Stack.Screen name="forme" options={{ title: 'Forme du jour' }} />
        <Stack.Screen name="seuils" options={{ title: 'Mes seuils' }} />
        <Stack.Screen name="bilan" options={{ title: 'Bilan hebdo' }} />
        <Stack.Screen name="apropos" options={{ title: 'Comment ça marche' }} />
        <Stack.Screen name="mesures" options={{ title: 'Mesures' }} />
        <Stack.Screen name="hydratation" options={{ title: 'Hydratation' }} />
        <Stack.Screen name="sante-connect" options={{ title: 'Importer des séances' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
