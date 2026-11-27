const { withInfoPlist, withAndroidManifest } = require("expo/config-plugins");

/** Keeps the camera permission text and does not add a second camera session. */
function withRockVision(config) {
  config = withInfoPlist(config, (value) => {
    value.modResults.NSCameraUsageDescription =
      value.modResults.NSCameraUsageDescription ||
      "Mountain Chicken uses the camera to scan a rock and place routes on it.";
    return value;
  });
  return withAndroidManifest(config, (value) => value);
}

module.exports = withRockVision;
