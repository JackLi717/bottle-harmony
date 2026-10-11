import { setAudioModeAsync } from 'expo-audio';
import { Platform } from 'react-native';

let prepared: Promise<void> | null = null;
export function prepareGameAudio() {
  // Android game effects follow media volume, independently of silent/vibrate
  // ringer modes. Keep Apple's existing silent-switch behavior.
  if (!prepared) prepared = setAudioModeAsync({ playsInSilentMode: Platform.OS === 'android', shouldPlayInBackground: false,
    interruptionMode: 'mixWithOthers', allowsRecording: false }).catch(error => { prepared = null; throw error; });
  return prepared;
}
