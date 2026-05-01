function app() {
  const bound = window.go?.main?.App;
  if (!bound) throw new Error("Wails Backend ist nicht verfuegbar.");
  return bound;
}

export function ChooseHVSCRoot() {
  return app().ChooseHVSCRoot();
}

export function GetLibraryState() {
  return app().GetLibraryState();
}

export function GetPlaybackState() {
  return app().GetPlaybackState();
}

export function LoadTrack(trackId) {
  return app().LoadTrack(trackId);
}

export function PlayTrack(trackId, subtune, startAt) {
  return app().PlayTrack(trackId, subtune, startAt);
}

export function ResetEqualizer() {
  return app().ResetEqualizer();
}

export function Seek(seconds) {
  return app().Seek(seconds);
}

export function SetAudioControls(patch) {
  return app().SetAudioControls(patch);
}

export function SetEqualizer(patch) {
  return app().SetEqualizer(patch);
}

export function SetVolume(volume) {
  return app().SetVolume(volume);
}

export function Stop() {
  return app().Stop();
}

export function ToggleMute() {
  return app().ToggleMute();
}

export function TogglePause() {
  return app().TogglePause();
}
