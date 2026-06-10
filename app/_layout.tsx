import { couleurs } from '@/design/theme';
import { useMagasin } from '@/etat/magasin';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_600SemiBold,
  useFonts,
} from '@expo-google-fonts/space-grotesk';
import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Affiche les rappels locaux même app au premier plan.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export default function Layout() {
  const [policesPretes, erreurPolices] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_600SemiBold,
    JetBrainsMono_500Medium,
  });
  const pret = useMagasin((e) => e.pret);
  const etape = useMagasin((e) => e.etape);
  const initialiser = useMagasin((e) => e.initialiser);
  const [erreurInit, setErreurInit] = useState<string | null>(null);

  useEffect(() => {
    initialiser().catch((err) => {
      console.error('Init échouée', err);
      setErreurInit(err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err));
    });
  }, [initialiser]);

  // On ne bloque plus sur les polices : une erreur de police laisse passer (fallback système).
  const policesOk = policesPretes || !!erreurPolices;

  useEffect(() => {
    if (policesOk && (pret || erreurInit)) SplashScreen.hideAsync().catch(() => {});
  }, [policesOk, pret, erreurInit]);

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
        <Stack.Screen name="index" options={{ title: 'REGISTRE.FORME' }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="seance" options={{ title: 'Séance du jour' }} />
        <Stack.Screen name="journal" options={{ title: 'Journal Crohn' }} />
        <Stack.Screen name="mesures" options={{ title: 'Mesures' }} />
        <Stack.Screen name="reglages" options={{ title: 'Réglages & données' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
