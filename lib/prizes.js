// Implement this catalog interface with a database when the backoffice is ready.
export const demoPrizeCatalog = {
  draw(random = Math.random) {
    const prizes = [
      { title: '¡Un juego extra!', description: 'Ganaste un turno de bonificación en Grab Lab.', label: 'BONIFICACIÓN' },
      { title: 'Coleccionista', description: 'Encontraste una esfera de edición especial.', label: 'ESFERA ESPECIAL' },
      { title: 'Tiro de campeón', description: 'Desbloqueaste una insignia de campeón de la garra.', label: 'INSIGNIA' },
      { title: 'Cápsula sorpresa', description: 'Tu esfera traía una sorpresa de la colección Grab Lab.', label: 'SORPRESA' },
    ];
    return prizes[Math.floor(random() * prizes.length)];
  },
};
