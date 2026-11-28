# Mountain Chicken

Outdoor bouldering app for iPhone and Android. Walk the camera across a rock, keep a 3D model in meters, tap holds onto it, and open that same model later in the room.

## Architecture / Status

The previous checkout of this repo was not an app. It was a README plus two GitHub release APKs (`v1.0`, `v1.1`) and no source. Those installs drew a dot cloud, then a solid face, on top of the camera. They did not run an AR session, so the rock never sat in the room and routes were not anchored in a real coordinate frame. This project replaces that with one Expo codebase.

**Stack**

| Piece | Choice |
| --- | --- |
| App | Expo SDK 58, React Native 0.88, TypeScript, Expo Router |
| AR | `@reactvision/react-viro` 3.3 (ViroReact). ARKit on iOS, ARCore on Android. New Architecture, which Expo 58 already uses. |
| 3D viewer | `expo-gl`. Orbit, pinch, and tap-to-place, including in the browser and Expo Go. |
| State | Zustand for the library, plus a small capture buffer while scanning. |
| Storage | `expo-sqlite` for the scan and route records. The mesh is an OBJ on disk (or `localStorage` on web). |
| Location | `expo-location`, with a link out to the platform maps app. |
| Builds | `eas.json` development and preview profiles produce an Android APK. iOS uses the same project and a development build. |

ViroReact is still the right AR library for this app. It is the maintained ViroReact, it ships an Expo config plugin, and 3.3 is the release that matches Expo SDK 58. It is also the first version whose world mesh fuses depth across frames: LiDAR on iPhone Pro, ARCore Depth on supported Android phones, and a monocular estimate otherwise. Expo Go cannot load it. Simulators cannot run ARKit or ARCore. A development build on a physical phone is required for the camera.

**What a scan actually saves**

While you walk, the camera shows Viro's fused world mesh (the wire overlay). At the same time the app samples depth hits, then feature points, and only then flat planes. Those samples are in meters, with the origin at the camera pose when tracking locked. On save they are fused into a closed shell (surface nets, about 3–5 cm voxels) and written as OBJ. Route points are `Vector3` positions in that same frame.

Viro can also snapshot its own world mesh with `snapshotWorldMeshToFile`, but that call only accepts the `locationTransform` returned by a successful cloud `finishScan`. That path needs a ReactVision project key. This build sets the anchor provider to `none` and does not require an account. The OBJ is the model you can open, plot on, and place again without a server.

**Coming back to a rock**

GPS is stored with the scan so you can get directions. "In your space" starts a new AR session, you put the crosshair on the base of the rock, and you lock the model there at true scale (1 unit = 1 meter). Twist and size are for when the phone's depth was a bit off. This is manual alignment, not visual positioning. Automatic re-localization (the phone recognizing the face by itself) is Viro's Advanced VPS and needs a ReactVision key plus `uploadScanRecording`. The data model already has `vpsLocationId`, `vpsMapId`, and `cloudAnchorId` for that later step.

**What works without a phone**

Home, the route library, the practice boulder, the orbit viewer, and tap-to-plot all run in Expo Go and on the web. The practice boulder is a generated mesh, labeled as such, so the plotter can be tried indoors.

**What still needs a physical device**

- The live wire mesh while scanning, and whether depth (not just planes) locks on that phone.
- Saving a real face and checking the OBJ against the rock.
- Placing the model in the room, walking around it, and reading the route line in sunlight.
- An installable APK. This environment has no Android SDK, so the preview build is `eas build -p android --profile preview` on your machine or Expo's builders. Config for that build is in the repo.

## Phase 1

1. Scan a face. Full-screen AR, coaching when tracking is limited, save when enough of the surface has locked.
2. Plot a route. Tap the model to drop start, hold, path, anchor, and finish points in scan meters. Grade, type, and notes.
3. Open it again. The library lists routes. "In your space" puts the model and the line back in the camera.

Phase 2 (climber tracking) and phase 3 (embedded maps, sharing, stitching cliffs) are not in this build. Directions open the phone's maps app. A map view inside the app can wait.

## Design

Dark charcoal background, sandstone and copper, amber for the grade and the crosshair. Type is large and heavy so it can be read in sun with chalky hands. The mark is a mountain with a small chicken.

## Data model

`src/domain/types.ts` is the model from the original design: `RockScan`, `Route`, and `RoutePoint`, coordinates in the scan frame in meters. SQLite stores each record as JSON so the TypeScript type stays the source of truth.

## Run it

```bash
npm install
npm test
npm run typecheck
npm run lint
npx expo start
```

On the web or in Expo Go, open **Scan a rock** and choose **Use a practice boulder**. Then plot a hold and open the route library.

## Install on a phone

AR needs a development build, not Expo Go.

```bash
npm install -g eas-cli
eas login
eas build -p android --profile preview
```

The preview profile builds an APK. Download it from the Expo build page, copy it to the phone, and allow install from that source. It is not a Play Store build. Install over the old Mountain Chicken APK or uninstall that one first if Android refuses the signature.

iOS, from a Mac or from EAS (an Apple Developer account is required):

```bash
eas build -p ios --profile development
```

Then install the development client and run `npx expo start --dev-client`.

A local Android build, with the SDK installed and a device plugged in:

```bash
npx expo prebuild --platform android
npx expo run:android
```

`android/` and `ios/` are generated. Change native settings in `app.json`, not by editing those folders.

## Phone check

1. Outdoors, or in a room with a textured wall standing in for the rock.
2. Scan a slow half-circle. The wire mesh should grow on the surface, not as a flat poster.
3. Save, then spin the model. The shell should follow the face you walked.
4. Tap a start, two holds, and a finish. The length is in meters.
5. In your space, lock the base and walk around the model. The line should stay on the shell.

Phones without LiDAR or ARCore Depth will say so. The model is still saved, and it is a sketch, not a survey.
