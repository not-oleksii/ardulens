// A fixed 8-hue categorical palette (not generated/random) so each RC channel gets a stable,
// CVD-distinguishable color across the RC Cal and RC Setup screens - the channel *number* is
// always shown alongside the color too, so identity never depends on color alone. Channels
// past 8 cycle back to slot 1.
const RC_CHANNEL_PALETTE = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
];

export function colorForRcChannel(channel: number): string {
  return RC_CHANNEL_PALETTE[(channel - 1) % RC_CHANNEL_PALETTE.length]!;
}
