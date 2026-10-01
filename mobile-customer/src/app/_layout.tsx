import { Tabs } from 'expo-router';
import { PhotosProvider } from '../photos';
import { colors } from '../ui';
export default function Layout() {
  return <PhotosProvider><Tabs screenOptions={{ headerStyle: { backgroundColor: colors.ivory }, headerTintColor: colors.olive, tabBarActiveTintColor: colors.olive, tabBarStyle: { backgroundColor: colors.white } }}>
    <Tabs.Screen name="index" options={{ title: 'Capture' }} />
    <Tabs.Screen name="photos" options={{ title: 'My photos' }} />
    <Tabs.Screen name="explore" options={{ title: 'Explore' }} />
  </Tabs></PhotosProvider>;
}
