import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function buildIconSvg(isMaskable = false) {
  // Safe zone scaling:
  // Android Adaptive icon requires key content to be within central 72% circle (radius ~368 at 1024px).
  // Standard icon uses ~88% of canvas.
  const scale = isMaskable ? 0.72 : 0.88;
  const cx = 512;
  const cy = 512;

  // Generate speedometer tick marks
  const ticks = [];
  const startAngle = 135;
  const endAngle = 405;
  const totalTicks = 28;
  const gaugeR1 = 410;
  const gaugeR2 = 428;
  const gaugeR2Major = 436;

  for (let i = 0; i <= totalTicks; i++) {
    const angleDeg = startAngle + (i / totalTicks) * (endAngle - startAngle);
    const rad = (angleDeg * Math.PI) / 180;
    const isMajor = i % 4 === 0;
    const isRedline = i >= 22;
    const rOuter = isMajor ? gaugeR2Major : gaugeR2;
    const x1 = cx + gaugeR1 * Math.cos(rad);
    const y1 = cy + gaugeR1 * Math.sin(rad);
    const x2 = cx + rOuter * Math.cos(rad);
    const y2 = cy + rOuter * Math.sin(rad);

    const color = isRedline ? '#EF4444' : isMajor ? '#F59E0B' : '#94A3B8';
    const width = isMajor ? 5 : 3;

    ticks.push(
      `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" />`
    );
  }

  // Generate gear teeth around outer perimeter (16 teeth)
  const gearTeeth = [];
  const teethCount = 16;
  for (let i = 0; i < teethCount; i++) {
    const angle = (i * 360) / teethCount;
    gearTeeth.push(`
      <rect x="502" y="58" width="20" height="24" rx="4" fill="url(#goldGradient)" transform="rotate(${angle} 512 512)" />
    `);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Background Radial Gradient -->
    <radialGradient id="bgGrad" cx="50%" cy="42%" r="70%">
      <stop offset="0%" stop-color="#1E293B" />
      <stop offset="45%" stop-color="#0F172A" />
      <stop offset="100%" stop-color="#070B14" />
    </radialGradient>

    <!-- Brushed Gold Metallic Gradient -->
    <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FDE68A" />
      <stop offset="25%" stop-color="#F59E0B" />
      <stop offset="50%" stop-color="#D97706" />
      <stop offset="80%" stop-color="#B45309" />
      <stop offset="100%" stop-color="#FBBF24" />
    </linearGradient>

    <!-- Secondary Amber Accent -->
    <linearGradient id="amberAccent" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#F59E0B" />
      <stop offset="100%" stop-color="#B45309" />
    </linearGradient>

    <!-- Chrome Metallic Gradient -->
    <linearGradient id="chromeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" />
      <stop offset="30%" stop-color="#E2E8F0" />
      <stop offset="70%" stop-color="#94A3B8" />
      <stop offset="100%" stop-color="#475569" />
    </linearGradient>

    <!-- Chrome Wrench Gradient 2 -->
    <linearGradient id="wrenchGrad" x1="100%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" />
      <stop offset="40%" stop-color="#CBD5E1" />
      <stop offset="80%" stop-color="#64748B" />
      <stop offset="100%" stop-color="#334155" />
    </linearGradient>

    <!-- Redline Gradient -->
    <linearGradient id="redlineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#F59E0B" />
      <stop offset="100%" stop-color="#EF4444" />
    </linearGradient>

    <!-- Deep Shadow Filters -->
    <filter id="gearShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#000000" flood-opacity="0.8" />
    </filter>
    <filter id="textShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.9" />
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#F59E0B" flood-opacity="0.4" />
    </filter>
    <filter id="glowGold" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Full Canvas Background -->
  <rect width="1024" height="1024" fill="url(#bgGrad)" />

  <!-- Subtle Carbon Matrix Pattern in Background -->
  <g opacity="0.07">
    <circle cx="512" cy="512" r="500" stroke="#FFFFFF" stroke-width="1" fill="none" />
    <circle cx="512" cy="512" r="460" stroke="#FFFFFF" stroke-width="1" fill="none" />
    <circle cx="512" cy="512" r="420" stroke="#FFFFFF" stroke-width="1" fill="none" />
    <circle cx="512" cy="512" r="380" stroke="#FFFFFF" stroke-width="1" fill="none" />
    <line x1="112" y1="512" x2="912" y2="512" stroke="#FFFFFF" stroke-width="1" />
    <line x1="512" y1="112" x2="512" y2="912" stroke="#FFFFFF" stroke-width="1" />
  </g>

  <!-- Central Scaled Automotive Emblem -->
  <g transform="translate(${cx}, ${cy}) scale(${scale}) translate(-${cx}, -${cy})" filter="url(#gearShadow)">
    
    <!-- Outer Gear Teeth -->
    ${gearTeeth.join('')}

    <!-- Outer Beveled Gear Rim -->
    <circle cx="512" cy="512" r="435" stroke="url(#goldGradient)" stroke-width="14" fill="#0A0F1D" />
    <circle cx="512" cy="512" r="420" stroke="#000000" stroke-width="3" fill="none" opacity="0.6" />
    
    <!-- Inner Metallic Inset Ring -->
    <circle cx="512" cy="512" r="385" stroke="url(#goldGradient)" stroke-width="4" stroke-dasharray="12 6" fill="#0C1324" opacity="0.9" />

    <!-- Speedometer Ticks -->
    ${ticks.join('')}

    <!-- Speedometer Active Arc Track -->
    <path d="M 222 802 A 410 410 0 1 1 802 802" fill="none" stroke="#334155" stroke-width="8" stroke-linecap="round" opacity="0.5" />
    <path d="M 222 802 A 410 410 0 1 1 732 292" fill="none" stroke="url(#goldGradient)" stroke-width="8" stroke-linecap="round" />
    <path d="M 732 292 A 410 410 0 0 1 802 802" fill="none" stroke="url(#redlineGrad)" stroke-width="8" stroke-linecap="round" />

    <!-- Crossed Tools in Background (Wrench & Spark Plug) -->
    <!-- Tool 1: Chrome Open Wrench (Angle -38 deg) -->
    <g transform="rotate(-38 512 512)" opacity="0.55">
      <!-- Wrench Handle -->
      <rect x="496" y="230" width="32" height="564" rx="14" fill="url(#wrenchGrad)" stroke="#1E293B" stroke-width="3" />
      <rect x="504" y="270" width="16" height="484" rx="8" fill="#1E293B" opacity="0.3" />
      <!-- Wrench Head Top -->
      <path d="M 470 240 C 470 190 554 190 554 240 L 536 240 C 536 215 488 215 488 240 Z" fill="url(#chromeGrad)" stroke="#0F172A" stroke-width="3" />
      <circle cx="512" cy="235" r="24" fill="#0C1324" />
      <rect x="502" y="210" width="20" height="35" fill="#0C1324" />
      <!-- Wrench Bottom Ring -->
      <circle cx="512" cy="780" r="32" fill="url(#chromeGrad)" stroke="#0F172A" stroke-width="3" />
      <circle cx="512" cy="780" r="18" fill="#0C1324" />
    </g>

    <!-- Tool 2: Chrome Spark Plug / Piston (Angle +38 deg) -->
    <g transform="rotate(38 512 512)" opacity="0.55">
      <!-- Plug Body / Shaft -->
      <rect x="494" y="240" width="36" height="544" rx="12" fill="url(#chromeGrad)" stroke="#1E293B" stroke-width="3" />
      <!-- Threading Rings -->
      <rect x="486" y="380" width="52" height="12" rx="3" fill="url(#goldGradient)" />
      <rect x="486" y="402" width="52" height="12" rx="3" fill="url(#goldGradient)" />
      <rect x="486" y="424" width="52" height="12" rx="3" fill="url(#goldGradient)" />
      <rect x="486" y="446" width="52" height="12" rx="3" fill="url(#goldGradient)" />
      <!-- Hex Nut Segment -->
      <polygon points="480,480 544,480 556,510 544,540 480,540 468,510" fill="url(#chromeGrad)" stroke="#1E293B" stroke-width="3" />
      <!-- Ceramic Insulator Ribs -->
      <rect x="490" y="560" width="44" height="14" rx="5" fill="#F8FAFC" />
      <rect x="488" y="582" width="48" height="14" rx="5" fill="#F8FAFC" />
      <rect x="490" y="604" width="44" height="14" rx="5" fill="#F8FAFC" />
      <rect x="502" y="630" width="20" height="140" rx="6" fill="url(#chromeGrad)" />
      <!-- Spark Electrode Tip -->
      <path d="M 504 240 L 504 220 L 520 220" fill="none" stroke="url(#chromeGrad)" stroke-width="6" stroke-linecap="round" />
    </g>

    <!-- Center High-Contrast Shield Base -->
    <circle cx="512" cy="495" r="280" fill="#080D1A" stroke="url(#goldGradient)" stroke-width="6" filter="url(#textShadow)" />
    <circle cx="512" cy="495" r="265" fill="#0C1427" opacity="0.85" />

    <!-- Speedometer Needle Pointer (Precision High Performance) -->
    <g transform="rotate(62 512 495)">
      <polygon points="512,250 519,495 505,495" fill="url(#redlineGrad)" filter="url(#glowGold)" />
      <circle cx="512" cy="495" r="28" fill="url(#chromeGrad)" stroke="#0F172A" stroke-width="4" />
      <circle cx="512" cy="495" r="14" fill="#EF4444" />
    </g>

    <!-- Central Monogram: BAP (Bold Geometric White with Golden Bevel & Shadow) -->
    <g filter="url(#textShadow)">
      <text x="512" y="545" 
            text-anchor="middle" 
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" 
            font-weight="900" 
            font-size="168" 
            letter-spacing="4" 
            fill="#FFFFFF"
            stroke="#0B1120"
            stroke-width="6"
            style="paint-order: stroke fill;">BAP</text>
      <!-- Front Highlight Glow -->
      <text x="512" y="545" 
            text-anchor="middle" 
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" 
            font-weight="900" 
            font-size="168" 
            letter-spacing="4" 
            fill="url(#chromeGrad)" 
            opacity="0.25">BAP</text>
    </g>

    <!-- Automotive Sub-Badge Banner: BEST AUTO PARTS -->
    <g transform="translate(0, 30)">
      <!-- Banner Plate -->
      <rect x="232" y="620" width="560" height="64" rx="32" fill="#070B14" stroke="url(#goldGradient)" stroke-width="4" filter="url(#textShadow)" />
      
      <!-- Subtle Decorative Accent Screws -->
      <circle cx="262" cy="652" r="6" fill="url(#chromeGrad)" stroke="#1E293B" stroke-width="1.5" />
      <circle cx="762" cy="652" r="6" fill="url(#chromeGrad)" stroke="#1E293B" stroke-width="1.5" />
      
      <!-- Banner Text -->
      <text x="512" y="662" 
            text-anchor="middle" 
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" 
            font-weight="900" 
            font-size="28" 
            letter-spacing="7" 
            fill="#F59E0B">BEST AUTO PARTS</text>
    </g>

    <!-- Location & Heritage Accent -->
    <text x="512" y="744" 
          text-anchor="middle" 
          font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" 
          font-weight="700" 
          font-size="18" 
          letter-spacing="5" 
          fill="#94A3B8" 
          opacity="0.9">SAHARANPUR • UP</text>

    <!-- 3 Stars Accent (Quality / Genuine Spares) -->
    <g fill="#F59E0B" transform="translate(512, 770)" opacity="0.9">
      <polygon points="0,-9 2.5,-3 8.5,-3 4,1 5.8,7 0,3.5 -5.8,7 -4,1 -8.5,-3 -2.5,-3" />
      <polygon points="-40,-7 -38,-2 -33,-2 -37,1 -35,6 -40,3 -45,6 -43,1 -47,-2 -42,-2" transform="scale(0.85)" />
      <polygon points="40,-7 42,-2 47,-2 43,1 45,6 40,3 35,6 37,1 33,-2 38,-2" transform="scale(0.85)" />
    </g>

  </g>
</svg>`;
}

async function generateIcons() {
  console.log('🚀 Starting studio-grade PWA icon generation for Best Auto Parts...');

  const iconsDir = path.join(projectRoot, 'public', 'icons');
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  const standardSvg = buildIconSvg(false);
  const maskableSvg = buildIconSvg(true);

  // Targets to generate:
  const targets = [
    // 1. Android / Chrome standard icons
    {
      path: path.join(iconsDir, 'icon-512x512.png'),
      size: 512,
      svg: standardSvg,
      desc: 'Standard Android / Chrome 512x512 PNG',
    },
    {
      path: path.join(iconsDir, 'icon-192x192.png'),
      size: 192,
      svg: standardSvg,
      desc: 'Standard Android / Chrome 192x192 PNG',
    },
    // 2. Android adaptive maskable icon (safe zone 72%)
    {
      path: path.join(iconsDir, 'icon-maskable-512x512.png'),
      size: 512,
      svg: maskableSvg,
      desc: 'Android Adaptive Maskable 512x512 PNG (72% safe-zone)',
    },
    // 3. Apple Touch Icon (180x180, solid square, no transparency)
    {
      path: path.join(projectRoot, 'public', 'apple-touch-icon.png'),
      size: 180,
      svg: standardSvg,
      desc: 'Apple Touch Icon 180x180 PNG (iOS Safari home screen)',
    },
    // 4. Favicon 32x32
    {
      path: path.join(projectRoot, 'public', 'favicon-32x32.png'),
      size: 32,
      svg: standardSvg,
      desc: 'Browser Favicon 32x32 PNG',
    },
    // 5. Next.js App Router native icon
    {
      path: path.join(projectRoot, 'src', 'app', 'icon.png'),
      size: 512,
      svg: standardSvg,
      desc: 'Next.js 16 App Router native icon (src/app/icon.png)',
    },
  ];

  for (const target of targets) {
    const dir = path.dirname(target.path);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const pngBuffer = await sharp(Buffer.from(target.svg))
      .resize(target.size, target.size, {
        fit: 'contain',
        background: { r: 11, g: 17, b: 32, alpha: 1 }, // #0B1120 deep obsidian
      })
      .png({
        compressionLevel: 9,
        adaptiveFiltering: true,
        quality: 100,
      })
      .toBuffer();

    fs.writeFileSync(target.path, pngBuffer);
    const stats = fs.statSync(target.path);
    console.log(`✅ [${target.size}x${target.size}] ${target.desc} -> ${stats.size} bytes`);
  }

  console.log('🎉 All 5 native PWA & iOS icon assets generated successfully!');
}

generateIcons().catch((err) => {
  console.error('❌ Failed to generate PWA icons:', err);
  process.exit(1);
});
