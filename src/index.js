// שרת בוט וואטסאפ - ארגמן
// מאזין להודעות בקבוצה, יוצר משימות ב-Firestore ושולח תזכורות

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const admin = require('firebase-admin');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const http = require('http');
const config = require('./config');
const { initReminders } = require('./reminders');

// אתחול Firebase Admin
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: config.FIREBASE_PROJECT_ID,
  });
  console.log('🔑 Firebase מאותחל עם מפתח סודי (שרת)');
} else {
  admin.initializeApp({
    projectId: config.FIREBASE_PROJECT_ID,
  });
  console.log('🔑 Firebase מאותחל עם הרשאות מקומיות');
}
const db = admin.firestore();

// לוגר שקט
const logger = pino({ level: 'silent' });

// מצב QR ו-חיבור
let currentQR = '';
let isConnected = false;

// שרת HTTP להצגת QR
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  if (isConnected) {
    res.end('<html dir="rtl"><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:Arial;background:#1a1d2e;color:#4ade80;"><h1>✅ מחובר בהצלחה!</h1></body></html>');
  } else if (currentQR) {
    res.end(`<html dir="rtl"><body style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;font-family:Arial;background:#1a1d2e;color:#fff;">
      <h2>סרקו את הקוד עם וואטסאפ</h2>
      <p style="color:#94a3b8;">הגדרות > מכשירים מקושרים > קשר מכשיר</p>
      <img src="${currentQR}" style="margin:20px;border-radius:12px;" />
      <p style="color:#64748b;">הדף מתרענן אוטומטית</p>
      <script>setTimeout(()=>location.reload(), 15000)</script>
    </body></html>`);
  } else {
    res.end('<html dir="rtl"><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:Arial;background:#1a1d2e;color:#94a3b8;"><h2>ממתין ל-QR...<br><script>setTimeout(()=>location.reload(), 3000)</script></h2></body></html>');
  }
}).listen(PORT, () => {
  console.log(`🌐 דף QR זמין בפורט ${PORT}`);
});

// התחברות לוואטסאפ
async function connectToWhatsApp() {
  const authDir = process.env.AUTH_DIR || './auth_info';
  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const sock = makeWASocket({
    auth: state,
    logger,
    printQRInTerminal: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📱 סרוק את הקוד עם וואטסאפ:');
      qrcode.generate(qr, { small: true });
      currentQR = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`❌ החיבור נסגר. קוד: ${statusCode}`);
      isConnected = false;
      currentQR = '';
      if (shouldReconnect) {
        console.log('🔄 מתחבר מחדש...');
        connectToWhatsApp();
      }
    }

    if (connection === 'open') {
      console.log('✅ מחובר לוואטסאפ');
      isConnected = true;
      currentQR = '';
      initReminders(sock, db);
    }
  });

  // האזנה להודעות
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      const isGroup = msg.key.remoteJid?.endsWith('@g.us');
      if (!isGroup) continue;

      const groupId = msg.key.remoteJid;
      const senderName = msg.pushName || 'לא ידוע';
      const senderPhone = msg.key.participant || '';
      const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';

      if (!text) continue;
      console.log(`📩 [${groupId}] ${senderName}: ${text.substring(0, 80)}`);

      if (!config.GROUP_ID) {
        console.log(`ℹ️ GROUP_ID לא מוגדר. מזהה קבוצה זו: ${groupId}`);
        continue;
      }
      if (groupId !== config.GROUP_ID) continue;

      try {
        const title = text.substring(0, 100);
        await db.collection('tasks').add({
          title,
          description: text,
          status: 'חדש',
          priority: 'בינונית',
          source_type: 'whatsapp',
          sender_name: senderName,
          sender_phone: senderPhone,
          created_at: admin.firestore.FieldValue.serverTimestamp(),
          assigned_to: '',
        });

        await sock.sendMessage(groupId, { text: `✅ משימה נוצרה: ${title}` });
        console.log(`✅ משימה נוצרה: ${title}`);
      } catch (err) {
        console.error('❌ שגיאה ביצירת משימה:', err.message);
      }
    }
  });
}

console.log('🚀 מפעיל בוט וואטסאפ - ארגמן');
connectToWhatsApp();
