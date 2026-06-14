import { couleurs, largeurMaxContenu, typo } from '@/design/theme';
import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

// Sur web desktop, on centre la barre d'onglets à la largeur de lecture du contenu plutôt
// que de l'étirer en bas de la fenêtre (rendu « appli mobile » indésirable sur grand écran).
const styleBarreWeb =
  Platform.OS === 'web'
    ? { maxWidth: largeurMaxContenu, width: '100%' as const, alignSelf: 'center' as const }
    : null;

// Tab bar des quatre espaces du quotidien. Les écrans de détail (séance, forme,
// bilan…) restent des routes Stack à la racine : ils recouvrent la tab bar.

function icone(nom: keyof typeof Feather.glyphMap) {
  return ({ color }: { color: string }) => <Feather name={nom} size={20} color={color} />;
}

export default function LayoutOnglets() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: couleurs.fond },
        headerShadowVisible: false,
        headerTintColor: couleurs.texte,
        headerTitleStyle: { fontFamily: typo.titre },
        tabBarStyle: {
          backgroundColor: couleurs.fond,
          borderTopColor: couleurs.trait,
          ...styleBarreWeb,
        },
        tabBarActiveTintColor: couleurs.texte,
        tabBarInactiveTintColor: couleurs.texteAttenue,
        tabBarLabelStyle: { fontFamily: typo.corps, fontSize: 11 },
        sceneStyle: { backgroundColor: couleurs.fond },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'REGISTRE.FORME',
          tabBarLabel: "Aujourd'hui",
          tabBarIcon: icone('home'),
        }}
      />
      <Tabs.Screen
        name="journal"
        options={{ title: 'Journal Crohn', tabBarLabel: 'Journal', tabBarIcon: icone('edit-3') }}
      />
      <Tabs.Screen
        name="alimentation"
        options={{ title: 'Alimentation', tabBarLabel: 'Aliments', tabBarIcon: icone('coffee') }}
      />
      <Tabs.Screen
        name="tendances"
        options={{ title: 'Tendances', tabBarIcon: icone('trending-up') }}
      />
      <Tabs.Screen name="reglages" options={{ title: 'Réglages', tabBarIcon: icone('settings') }} />
    </Tabs>
  );
}
