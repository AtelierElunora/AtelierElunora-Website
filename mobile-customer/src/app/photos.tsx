import { Alert, Image, Text, View } from 'react-native';
import { router } from 'expo-router';
import { usePhotos } from '../photos';
import { Button, Page, styles } from '../ui';
export default function Photos() {
  const { photos, remove } = usePhotos();
  return <Page title="Your little keepsakes.">
    <Text style={styles.body}>{photos.length} {photos.length === 1 ? 'photo' : 'photos'} in your tray.</Text>
    <Text style={styles.body}>Preview version: this tray lasts for this app session. Ordering from the tray is coming next.</Text>
    {photos.map(photo => <View key={photo.uri} style={{ gap: 8 }}><Image source={{ uri: photo.uri }} style={{ width: '100%', aspectRatio: 1, borderRadius: 18 }} resizeMode="contain" /><Button title="Remove photo" onPress={() => Alert.alert('Remove this photo?', 'This removes it from your tray only.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => remove(photo.uri) }])} /></View>)}
    <Button title="Add more photos" onPress={() => router.push('/')} />
  </Page>;
}
