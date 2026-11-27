import Svg, { Circle, Path } from "react-native-svg";
import { colors } from "../theme/theme";

export function Mark({ size = 72 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 72 72" accessibilityLabel="Mountain Chicken">
      <Path d="M6 58 L26 24 L36 40 L48 16 L66 58 Z" fill={colors.sandstone} />
      <Path d="M26 24 L36 40 L30 40 Z" fill={colors.copperDeep} opacity={0.55} />
      <Circle cx="24" cy="46" r="10" fill={colors.chalk} />
      <Circle cx="33" cy="40" r="6.5" fill={colors.chalk} />
      <Path d="M38 39 L46 42 L38 44 Z" fill={colors.copper} />
      <Path d="M30 34 L32.5 30 L35 34 L33.2 33.2 L31.5 35.5 Z" fill={colors.amber} />
      <Circle cx="35.2" cy="39.2" r="0.9" fill={colors.ink} />
    </Svg>
  );
}
