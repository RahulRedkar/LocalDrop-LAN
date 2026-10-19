const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function getBase64Image(filename) {
  const filePath = path.join(__dirname, 'screenshots', filename);
  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath).slice(1);
    const data = fs.readFileSync(filePath).toString('base64');
    return `data:image/${ext};base64,${data}`;
  }
  return '';
}

const radarImg = getBase64Image('01_radar_dashboard.png');
const qrImg = getBase64Image('02_qr_pairing.png');
const syncImg = getBase64Image('03_folder_sync.png');
const transferImg = getBase64Image('05_active_transfer.png');

const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>LocalDrop LAN - Feature Advertisement & Overview</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
    
    @page {
      size: A4;
      margin: 0;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #090b10;
      color: #e2e8f0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page {
      width: 210mm;
      height: 297mm;
      max-height: 297mm;
      padding: 14mm 16mm 10mm 16mm;
      position: relative;
      background: radial-gradient(circle at top right, #171b26 0%, #090b10 65%);
      page-break-after: always;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
    }

    .page:last-child {
      page-break-after: avoid;
    }

    /* Header & Branding */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      padding-bottom: 10px;
      margin-bottom: 16px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .logo-badge {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: linear-gradient(135deg, #3b82f6, #6366f1);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 800;
      font-size: 20px;
      box-shadow: 0 0 16px rgba(99, 102, 241, 0.4);
    }

    .brand-text h1 {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #ffffff;
      line-height: 1.1;
    }

    .brand-text p {
      font-size: 10px;
      font-weight: 600;
      color: #38bdf8;
      text-transform: uppercase;
      letter-spacing: 1.2px;
    }

    .header-badge {
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.3);
      padding: 5px 12px;
      border-radius: 9999px;
      font-size: 10px;
      font-weight: 600;
      color: #a5b4fc;
    }

    /* Hero Section */
    .hero {
      text-align: center;
      margin-bottom: 14px;
    }

    .hero-tagline {
      display: inline-block;
      background: rgba(56, 189, 248, 0.1);
      border: 1px solid rgba(56, 189, 248, 0.25);
      color: #38bdf8;
      font-size: 10px;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 9999px;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }

    .hero-title {
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -0.8px;
      line-height: 1.15;
      margin-bottom: 8px;
      background: linear-gradient(135deg, #ffffff 40%, #94a3b8 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .hero-desc {
      font-size: 12px;
      color: #94a3b8;
      max-width: 540px;
      margin: 0 auto 12px auto;
      line-height: 1.45;
    }

    /* Quick Badges Row */
    .badges-row {
      display: flex;
      justify-content: center;
      gap: 8px;
      margin-bottom: 14px;
    }

    .pill {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      padding: 5px 10px;
      font-size: 10px;
      font-weight: 600;
      color: #e2e8f0;
      display: flex;
      align-items: center;
      gap: 5px;
    }

    /* Showcase Image Box */
    .showcase-box {
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.12);
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.5);
      margin-bottom: 16px;
      background: #11141d;
    }

    .showcase-box img {
      width: 100%;
      display: block;
    }

    /* Feature Cards Grid */
    .features-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }

    .feature-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.07);
      border-radius: 10px;
      padding: 12px;
    }

    .feature-icon-title {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }

    .feature-icon {
      width: 24px;
      height: 24px;
      border-radius: 6px;
      background: rgba(99, 102, 241, 0.15);
      color: #818cf8;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
    }

    .feature-title {
      font-size: 12px;
      font-weight: 700;
      color: #ffffff;
    }

    .feature-desc {
      font-size: 10.5px;
      color: #94a3b8;
      line-height: 1.4;
    }

    /* Page 2 Specifics */
    .section-title {
      font-size: 18px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #ffffff;
      margin-bottom: 4px;
    }

    .section-subtitle {
      font-size: 11px;
      color: #94a3b8;
      margin-bottom: 12px;
    }

    .two-col-showcase {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 14px;
    }

    .col-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      overflow: hidden;
      padding: 10px;
    }

    .col-card img {
      width: 100%;
      border-radius: 6px;
      margin-bottom: 8px;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .col-card h3 {
      font-size: 12px;
      font-weight: 700;
      color: #f1f5f9;
      margin-bottom: 3px;
    }

    .col-card p {
      font-size: 10.5px;
      color: #94a3b8;
      line-height: 1.35;
    }

    /* Benefit Banner */
    .benefit-banner {
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(56, 189, 248, 0.08));
      border: 1px solid rgba(99, 102, 241, 0.25);
      border-radius: 10px;
      padding: 12px 16px;
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .benefit-stat {
      text-align: center;
    }

    .stat-val {
      font-size: 18px;
      font-weight: 800;
      color: #38bdf8;
    }

    .stat-lbl {
      font-size: 9.5px;
      color: #94a3b8;
      text-transform: uppercase;
      font-weight: 600;
    }

    /* Creator Box */
    .creator-box {
      background: linear-gradient(135deg, #131722, #0d1017);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 12px;
      padding: 14px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
    }

    .creator-info h4 {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #38bdf8;
      font-weight: 700;
      margin-bottom: 2px;
    }

    .creator-name {
      font-size: 18px;
      font-weight: 800;
      color: #ffffff;
      margin-bottom: 1px;
    }

    .creator-sub {
      font-size: 10.5px;
      color: #94a3b8;
    }

    .repo-pill {
      background: #ffffff;
      color: #090b10;
      font-size: 11px;
      font-weight: 700;
      padding: 8px 16px;
      border-radius: 9999px;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }

    .page-footer {
      text-align: center;
      font-size: 9.5px;
      color: #64748b;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
    }
  </style>
</head>
<body>

  <!-- PAGE 1: HERO & CORE FEATURES -->
  <div class="page">
    <div>
      <div class="header">
        <div class="brand">
          <div class="logo-badge">⚡</div>
          <div class="brand-text">
            <h1>LocalDrop LAN</h1>
            <p>High-Speed Local File Sharing</p>
          </div>
        </div>
        <div class="header-badge">Open Source • 100% Private</div>
      </div>

      <div class="hero">
        <div class="hero-tagline">No Cloud. No Limits. Pure Speed.</div>
        <h2 class="hero-title">Lightning-Fast Transfers.<br>Zero Internet Required.</h2>
        <p class="hero-desc">
          Transfer files and folders directly across your local Wi-Fi and Ethernet. Enjoy blistering 500 Mbps speeds, instant radar device discovery, and seamless cross-PC folder sync.
        </p>

        <div class="badges-row">
          <div class="pill">⚡ Up to 500 Mbps</div>
          <div class="pill">📦 15GB+ Large Files</div>
          <div class="pill">📱 QR Code Mobile Connect</div>
          <div class="pill">🔒 100% Private LAN</div>
        </div>
      </div>

      <div class="showcase-box">
        <img src="${radarImg}" alt="LocalDrop LAN Radar Dashboard">
      </div>

      <div class="features-grid">
        <div class="feature-card">
          <div class="feature-icon-title">
            <div class="feature-icon">🚀</div>
            <div class="feature-title">500 Mbps Transfer Speed</div>
          </div>
          <p class="feature-desc">
            Direct device-to-device streaming over your local network. Transfer gigabytes in seconds without internet bandwidth usage.
          </p>
        </div>

        <div class="feature-card">
          <div class="feature-icon-title">
            <div class="feature-icon">📁</div>
            <div class="feature-title">No File Size Limits</div>
          </div>
          <p class="feature-desc">
            Seamlessly handles 15GB+ files, 4K videos, ISOs, and entire folders with direct stream-to-disk reliability.
          </p>
        </div>

        <div class="feature-card">
          <div class="feature-icon-title">
            <div class="feature-icon">📡</div>
            <div class="feature-title">Instant Radar Discovery</div>
          </div>
          <p class="feature-desc">
            Zero configuration. Automatically discovers PCs, laptops, and smartphones on the same Wi-Fi instantly.
          </p>
        </div>

        <div class="feature-card">
          <div class="feature-icon-title">
            <div class="feature-icon">🔒</div>
            <div class="feature-title">100% Private & Cloud-Free</div>
          </div>
          <p class="feature-desc">
            Your data never touches external servers or third-party clouds. Pure local-area network privacy.
          </p>
        </div>
      </div>
    </div>

    <div class="page-footer">
      Page 1 of 2 • LocalDrop LAN Overview • https://github.com/RahulRedkar/LocalDrop-LAN
    </div>
  </div>

  <!-- PAGE 2: SYNC, MOBILE CONNECT & CREATOR SPOTLIGHT -->
  <div class="page">
    <div>
      <div class="header">
        <div class="brand">
          <div class="logo-badge">🔄</div>
          <div class="brand-text">
            <h1>LocalDrop LAN</h1>
            <p>Folder Sync & Mobile Pairing</p>
          </div>
        </div>
        <div class="header-badge">Cross-Platform Ready</div>
      </div>

      <div class="section-title">Designed for Everyday Productivity</div>
      <p class="section-subtitle">
        Whether transferring large project files between workstations or receiving photos from a smartphone, LocalDrop LAN makes it seamless.
      </p>

      <div class="two-col-showcase">
        <div class="col-card">
          <img src="${syncImg}" alt="Folder Synchronization">
          <h3>Cross-PC Folder Synchronization</h3>
          <p>
            Keep project directories and folders in sync across desktop computers with automated differential comparison and bi-directional mirroring.
          </p>
        </div>

        <div class="col-card">
          <img src="${qrImg}" alt="QR Code Mobile Connect">
          <h3>Instant Mobile Pairing</h3>
          <p>
            Scan the on-screen QR code with any iPhone, iPad, or Android camera to instantly connect and transfer files without installing any apps.
          </p>
        </div>
      </div>

      <div class="benefit-banner">
        <div class="benefit-stat">
          <div class="stat-val">500 Mbps</div>
          <div class="stat-lbl">Peak Throughput</div>
        </div>
        <div class="benefit-stat">
          <div class="stat-val">0 MB</div>
          <div class="stat-lbl">Cloud Storage Used</div>
        </div>
        <div class="benefit-stat">
          <div class="stat-val">100%</div>
          <div class="stat-lbl">Local Privacy</div>
        </div>
        <div class="benefit-stat">
          <div class="stat-val">&lt; 10ms</div>
          <div class="stat-lbl">Discovery Latency</div>
        </div>
      </div>

      <div class="showcase-box" style="margin-bottom: 14px;">
        <img src="${transferImg}" alt="Active Transfer Telemetry">
      </div>
    </div>

    <div>
      <div class="creator-box">
        <div class="creator-info">
          <h4>Created & Developed By</h4>
          <div class="creator-name">Rahul Redkar</div>
          <div class="creator-sub">Open Source Developer • Full Stack & Systems Engineering</div>
        </div>
        <div class="repo-pill">
          ⭐ View on GitHub
        </div>
      </div>

      <div class="page-footer">
        Page 2 of 2 • LocalDrop LAN • Created by Rahul Redkar • https://github.com/RahulRedkar/LocalDrop-LAN
      </div>
    </div>
  </div>

</body>
</html>
`;

async function generatePDF() {
  const outputPath = path.join(__dirname, 'LocalDrop-LAN-Brochure.pdf');
  console.log('Rendering PDF brochure via Edge / Puppeteer...');

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 800));

  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' }
  });

  await browser.close();
  console.log('PDF brochure generated successfully at:', outputPath);
}

generatePDF().catch(err => {
  console.error('Failed to generate PDF:', err);
  process.exit(1);
});
