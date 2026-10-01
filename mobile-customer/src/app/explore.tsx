import { Alert, Linking, Text } from 'react-native';
import { Button, Page, styles } from '../ui';
async function open(path: string) {
  try {
    const origin = process.env.EXPO_PUBLIC_STORE_ORIGIN;
    if (!origin) throw new Error('Store connection has not been configured for this preview.');
    const base = new URL(origin); if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('Store connection needs a valid HTTPS origin.');
    await Linking.openURL(new URL(path, base).href);
  } catch (error) { Alert.alert('Store connection', error instanceof Error ? error.message : 'Could not open the store.'); }
}
export default function Explore() {
  return <Page title="Made to be kept.">
    <Text style={styles.body}>Explore Atelier Elunora’s magnets, event experiences, and private galleries.</Text>
    <Text style={styles.body}>These links open the website. Photos in your app tray are not transferred yet.</Text>
    <Button title="Shop photo magnets" onPress={() => void open('/collections/photo-magnets')} />
    <Button title="Open client gallery" onPress={() => void open('/pages/client-gallery')} />
    <Button title="Wedding packages" onPress={() => void open('/pages/packages')} />
    <Button title="Special events" onPress={() => void open('/pages/special-events')} />
    <Button title="Contact Atelier Elunora" onPress={() => void open('/pages/contact')} />
  </Page>;
}
