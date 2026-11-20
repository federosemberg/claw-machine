export const ballColors = ['#e63246', '#d4ed38', '#294bd9', '#f47c36', '#e8289b', '#9637dc',
  '#04aa7c', '#ffcd2b', '#e8e4e1', '#b1bbc7', '#b98bef', '#f5f1ed'];

export function ballPreview(texture) {
  if (texture < 6) return `/assets/ball-${texture}.webp`;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 120;
  const context = canvas.getContext('2d');
  const light = context.createRadialGradient(44, 33, 1, 64, 62, 63);
  light.addColorStop(0, '#ffffff');
  light.addColorStop(.34, ballColors[texture]);
  light.addColorStop(.81, ballColors[texture]);
  light.addColorStop(1, '#252937');
  context.fillStyle = light;
  context.beginPath();
  context.arc(60, 60, 57, 0, Math.PI * 2);
  context.fill();
  return canvas.toDataURL();
}
