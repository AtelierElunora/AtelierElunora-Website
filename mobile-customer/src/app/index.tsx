import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Image, Linking, Text, View } from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { router, useIsFocused } from 'expo-router';
import { Photo, usePhotos } from '../photos';
import { Button, Page, styles } from '../ui';
export default function Capture() {
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Photo | null>(null);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const focused = useIsFocused(); const { add } = usePhotos();
  useEffect(() => { const listener = AppState.addEventListener('change', state => setActive(state === 'active')); return () => listener.remove(); }, []);
  const attachCamera = useCallback((instance: CameraView | null) => { camera.current = instance; if (!instance) setReady(false); }, []);
  async function capture() {
    if (busy || !ready || !camera.current) return;
    setBusy(true);
    try { const photo = await camera.current.takePictureAsync({ quality: 1 }); if (photo) setPreview(photo); }
    catch { Alert.alert('Could not take photo', 'Please try again.'); }
    finally { setBusy(false); }
  }
  async function importPhotos() {
    if (busy) return; setBusy(true);
    try { const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 1 }); if (!result.canceled) { result.assets.forEach(add); router.push('/photos'); } }
    catch { Alert.alert('Could not open photos', 'Please try again.'); }
    finally { setBusy(false); }
  }
  return <Page title="Keep this moment.">
    <Text style={styles.body}>Take a photo, or choose one you already love.</Text>
    {preview ? <><Image source={{ uri: preview.uri }} style={{ width: '100%', height: 350, borderRadius: 24 }} resizeMode="contain" />
      <Button title="Keep photo" onPress={() => { add(preview); setPreview(null); router.push('/photos'); }} />
      <Button title="Retake" onPress={() => setPreview(null)} /></> : <>
      {permission?.granted && focused && active ? <View style={{ height: 350, borderRadius: 24, overflow: 'hidden' }}><CameraView key={facing} ref={attachCamera} style={{ flex: 1 }} facing={facing} onCameraReady={() => setReady(true)} onMountError={() => { setReady(false); Alert.alert('Camera unavailable', 'You can still choose photos from your phone.'); }} /></View> : <Text style={styles.body}>Allow camera access to see your live preview.</Text>}
      {!permission?.granted && <Button title={permission?.canAskAgain === false ? 'Open camera settings' : 'Enable camera'} onPress={() => { if (permission?.canAskAgain === false) void Linking.openSettings(); else void requestPermission(); }} />}
      <Button title={busy ? 'Working…' : 'Take photo'} disabled={busy || !ready || !focused || !active} onPress={() => void capture()} />
      <Button title="Flip camera" disabled={busy} onPress={() => { setReady(false); setFacing(old => old === 'back' ? 'front' : 'back'); }} />
      <Button title="Choose from phone" disabled={busy} onPress={() => void importPhotos()} />
    </>}
  </Page>;
}
