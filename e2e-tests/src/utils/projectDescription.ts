export function expectedDescriptionPreview(parts: {
  timeframe: string;
  budget: string;
  materials: string;
  access: string;
}) {
  return [
    `Timeframe: ${parts.timeframe}.`,
    `Budget: ${parts.budget}.`,
    `Materials: ${parts.materials}`,
    `Access: ${parts.access}`,
  ];
}
