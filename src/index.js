// שרת בוט וואטסאפ - ארגמן
// מאזין להודעות בקבוצה, יוצר משימות ב-Firestore ושולח תזכורות

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const admin = require('firebase-admin');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const config = require('./config');
const { initReminders } = require('./reminders');

// אתחול Firebase Admin
admin.initializeApp({
  projectId: config.FIREBASE_PROJECT_ID,
});
const db = admin.firestore();

// לוגר שקט - בלי הצפה של הודעות baileys
const logger = pino({ level: 'silent' });

// התחברות לוואטסאפ
async function connectToWhatsApp() {
  // טעינת מצב אימות שמור (או יצירת חדש)
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

  const sock = makeWASocket({
    auth: state,
    logger,
    printQRInTerminal: false, // נציג QR בעצמנו
  });

  // שמירת פרטי אימות בכל עדכון
  sock.ev.on('creds.update', saveCreds);

  // טיפול בחיבור
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    // הצגת QR code בטרמינל
    if (qr) {
      console.log('\n📱 סרוק את הקוד עם וואטסאפ:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(`❌ החיבור נסגר. קוד: ${statusCode}`);

      if (shouldReconnect) {
        console.log('🔄 מתחבר מחדש...');
        connectToWhatsApp();
      } else {
        console.log('🚪 התנתקת מוואטסאפ. יש למחוק את תיקיית auth_info ולהתחבר מחדש');
      }
    }

    if (connection === 'open') {
      console.log('✅ מחובר לוואטסאפ');

      // הפעלת תזכורות מתוזמנות
      initReminders(sock, db);
    }
  });

  // האזנה להודעות נכנסות
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    // רק הודעות חדשות (לא היסטוריה)
    if (type !== 'notify') return;

    for (const msg of messages) {
      // דילוג על הודעות שנשלחו על ידי הבוט
      if (msg.key.fromMe) continue;

      // בדיקה אם ההודעה מקבוצה
      const isGroup = msg.key.remoteJid?.endsWith('@g.us');
      if (!isGroup) continue;

      const groupId = msg.key.remoteJid;
      const senderName = msg.pushName || 'לא ידוע';
      const senderPhone = msg.key.participant || '';

      // חילוץ טקסט ההודעה
      const text = msg.message?.conversation
        || msg.message?.extendedTextMessage?.text
        || '';

      if (!text) continue;

      // לוג של כל הודעה עם מזהה הקבוצה - שימושי למציאת GROUP_ID
      console.log(`📩 [${groupId}] ${senderName}: ${text.substring(0, 80)}`);

      // אם לא הוגדרה קבוצה - לא ליצור משימות
      if (!config.GROUP_ID) {
        console.log(`ℹ️ GROUP_ID לא מוגדר. מזהה קבוצה זו: ${groupId}`);
        continue;
      }

      // יצירת משימה רק מהקבוצה המוגדרת
      if (groupId !== config.GROUP_ID) continue;

      try {
        const title = text.substring(0, 100);

        // יצירת משימה ב-Firestore
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

        // תגובה בקבוצה
        await sock.sendMessage(groupId, {
          text: `✅ משימה נוצרה: ${title}`,
        });

        console.log(`✅ משימה נוצרה: ${title}`);
      } catch (err) {
        console.error('❌ שגיאה ביצירת משימה:', err.message);
      }
    }
  });
}

// הפעלה
console.log('🚀 מפעיל בוט וואטסאפ - ארגמן');
connectToWhatsApp();
