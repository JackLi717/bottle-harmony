import { setAudioModeAsync } from 'expo-audio';

let prepared: Promise<void> | null = null;
export function prepareGameAudio() {
  if (!prepared) prepared = setAudioModeAsync({ playsInSilentMode: false, shouldPlayInBackground: false,
    interruptionMode: 'mixWithOthers', allowsRecording: false }).catch(error => { prepared = null; throw error; });
  return prepared;
}
