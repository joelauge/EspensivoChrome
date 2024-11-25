// Run this in Node.js to create placeholder icons
const fs = require('fs');
const { createCanvas } = require('canvas');

const sizes = [16, 48, 128];

sizes.forEach(size => {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Draw a simple "E" icon
  ctx.fillStyle = '#2563eb';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = 'white';
  ctx.font = `bold ${size * 0.6}px Arial`;
  ctx.fillText('E', size * 0.25, size * 0.7);
  
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(`images/icon${size}.png`, buffer);
}); 