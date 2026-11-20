import { ballColors } from './ball-preview.js';
import { FIELD, HOME } from './playfield.js';

export function createArena(canvas) {
  const context = canvas.getContext('2d');
  const unit = 86;
  const x = value => 500 + value * unit;
  const y = value => 300 + value * unit;
  const { halfWidth, halfDepth, chuteBack, chuteEdge } = FIELD;

  return function render(state) {
    const density = Math.min(devicePixelRatio || 1, 2);
    const width = Math.round(canvas.clientWidth * density);
    const height = Math.round(canvas.clientHeight * density);
    if (!width || !height) return;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const scale = Math.min(width / 1000, height / 600);
    context.resetTransform();
    context.clearRect(0, 0, width, height);
    context.setTransform(scale, 0, 0, scale, (width - 1000 * scale) / 2, (height - 600 * scale) / 2);
    context.fillStyle = '#b1b7bf';
    context.fillRect(x(-halfWidth), y(-halfDepth), halfWidth * unit * 2, halfDepth * unit * 2);
    context.fillStyle = '#424d5a';
    context.fillRect(x(-halfWidth), y(chuteBack), (halfWidth + chuteEdge) * unit, (halfDepth - chuteBack) * unit);
    context.fillStyle = '#f1e9e6';
    context.font = 'bold 19px system-ui';
    context.textAlign = 'center';
    context.fillText('SALIDA', x(FIELD.chuteX), y(halfDepth - .12));
    for (const ball of [...(state?.balls ?? [])].sort((a, b) => a.y - b.y)) {
      if (ball.y < 0) continue;
      const centerX = x(ball.x);
      const centerY = y(ball.z);
      const r = ball.radius * unit;
      const shade = context.createRadialGradient(centerX - r * .26, centerY - r * .32, 0, centerX, centerY, r);
      shade.addColorStop(0, '#fff');
      shade.addColorStop(.40, ballColors[ball.texture]);
      shade.addColorStop(1, '#39323a');
      context.fillStyle = shade;
      context.beginPath();
      context.arc(centerX, centerY, r, 0, Math.PI * 2);
      context.fill();
    }
    const claw = state?.claw ?? { ...HOME, open: .82, jawRadius: .39 };
    context.strokeStyle = '#163d62';
    context.lineWidth = 4;
    context.beginPath();
    context.arc(x(claw.x), y(claw.z), claw.jawRadius * unit * (1.04 + claw.open), 0, Math.PI * 2);
    context.stroke();
  };
}
