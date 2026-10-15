// Production resizing/cropping only. The approved artwork is not redrawn.
const fs = require('node:fs'), path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'assets/branding');
async function main() {
  const source = process.argv[2];
  if (!source || !fs.existsSync(source)) throw Error('Provide the generated opaque v5 icon master.');
  const master = path.join(out, 'marcoujogou-master-esportivo.png');
  if (path.resolve(source) !== master) fs.copyFileSync(source, master);
  const { width, height } = await sharp(master).metadata();
  if (width !== height || width < 1024) throw Error('Expected square high-resolution master.');
  for (const name of ['marcoujogou-icon.png', 'marcoujogou-adaptive.png', 'marcoujogou-mark.png']) {
    await sharp(master).resize(1024, 1024).flatten({ background: '#171A1D' }).png().toFile(path.join(out, name));
  }
  // Fixed print-safe framing around both words, without altering any glyphs.
  await sharp(master).extract({ left: Math.round(width * .16), top: Math.round(height * .33), width: Math.round(width * .68), height: Math.round(height * .34) })
    .resize(1024, 512).flatten({ background: '#171A1D' }).png().toFile(path.join(out, 'marcoujogou-wordmark.png'));
  console.log('Prepared opaque icon, adaptive foreground, splash and 2:1 wordmark from the approved image.');
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
