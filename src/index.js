// שרת בוט וואטסאפ - ארגמן

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, doc, updateDoc } = require('firebase/firestore');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const http = require('http');
const config = require('./config');
const { initReminders } = require('./reminders');

// אתחול Firebase
const firebaseApp = initializeApp({
  apiKey: "AIzaSyDEVZMA7R6FLZBdkPg1GPVhv5AajwjWVb8",
  authDomain: "argaman-f3921.firebaseapp.com",
  projectId: "argaman-f3921",
  storageBucket: "argaman-f3921.firebasestorage.app",
  messagingSenderId: "1089830122540",
  appId: "1:1089830122540:web:36a7ef49e3c90e8d8acd89"
});
const db = getFirestore(firebaseApp);
console.log('🔑 Firebase מאותחל');

const logger = pino({ level: 'silent' });

// מצב חיבור
let currentQR = '';
let isConnected = false;

// מעקב משימות פתוחות — { senderPhone: { taskId, lastMessageTime } }
const openTasks = {};

// מיפוי שם וואטסאפ לשם בעברית
function resolveUser(pushName) {
  if (!pushName) return null;
  for (const [name, hebrewName] of Object.entries(config.NAME_TO_USER)) {
    if (pushName.includes(name)) return hebrewName;
  }
  return pushName; // אם לא נמצא — שם כמו שהוא בוואטסאפ
}

// חילוץ אחראי — מתיוג וואטסאפ (mentions) או מ-@שם בטקסט
function extractAssignee(text, msg) {
  // קודם — בדיקת mentions מוואטסאפ (תיוגים אמיתיים)
  const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  if (mentions.length > 0) {
    const mentionedPhone = mentions[0].replace(/@.*/, '');
    // חיפוש לפי מספר טלפון
    if (config.PHONE_TO_USER[mentionedPhone]) {
      return config.PHONE_TO_USER[mentionedPhone];
    }
    // חיפוש לפי pushName של המשתתף — נלוג כדי לבנות מיפוי
    console.log(`📋 תיוג: ${mentionedPhone} — צריך להוסיף ל-PHONE_TO_USER`);
  }

  // אחר כך — בדיקת @שם בטקסט (ידני)
  const match = text.match(/@(\S+)/);
  if (match) {
    const name = match[1];
    if (config.NAME_TO_USER[name]) return config.NAME_TO_USER[name];
  }

  // שם בגוף ההודעה (בלי @) — בדיקה אם מילה ראשונה אחרי "משימה" היא שם
  const afterTask = text.replace(/^משימה\s*/i, '').trim();
  const firstWord = afterTask.split(/\s/)[0];
  if (config.NAME_TO_USER[firstWord]) return config.NAME_TO_USER[firstWord];

  return config.DEFAULT_ASSIGNEE;
}

// הסרת @אחראי ותיוגים מטקסט
function cleanTitle(text) {
  return text.replace(/^משימה\s*/i, '').replace(/@\S+/g, '').trim();
}

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
    res.end('<html dir="rtl"><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:Arial;background:#1a1d2e;color:#94a3b8;"><h2>ממתין...<script>setTimeout(()=>location.reload(),3000)</script></h2></body></html>');
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 דף QR זמין בפורט ${PORT}`);
});

// התחברות
async function connectToWhatsApp() {
  const authDir = process.env.AUTH_DIR || './auth_info';
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const sock = makeWASocket({ auth: state, logger, printQRInTerminal: false });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('\n📱 סרוק את הקוד:');
      qrcode.generate(qr, { small: true });
      currentQR = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log(`❌ חיבור נסגר. קוד: ${code}`);
      isConnected = false;
      currentQR = '';
      if (code !== DisconnectReason.loggedOut) {
        console.log('🔄 מתחבר מחדש...');
        setTimeout(() => connectToWhatsApp(), 5000);
      }
    }
    if (connection === 'open') {
      console.log('✅ מחובר לוואטסאפ');
      isConnected = true;
      currentQR = '';
      initReminders(sock);
    }
  });

  // האזנה להודעות
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (!msg.key.remoteJid?.endsWith('@g.us')) continue;
      if (msg.key.remoteJid !== config.GROUP_ID) continue;

      const senderPhone = msg.key.participant || '';
      const senderName = msg.pushName || 'לא ידוע';
      const senderUser = resolveUser(senderName) || senderName;

      // חילוץ טקסט
      const text = msg.message?.conversation
        || msg.message?.extendedTextMessage?.text
        || '';

      // זיהוי תמונות/קבצים
      const hasImage = !!msg.message?.imageMessage;
      const hasDocument = !!msg.message?.documentMessage;
      const hasAudio = !!msg.message?.audioMessage;
      const hasVideo = !!msg.message?.videoMessage;
      const mediaType = hasImage ? 'תמונה' : hasDocument ? 'קובץ' : hasAudio ? 'הודעה קולית' : hasVideo ? 'סרטון' : null;

      const now = Date.now();

      console.log(`📩 ${senderName}: ${text ? text.substring(0, 60) : (mediaType || '?')}`);

      // בדיקה אם יש משימה פתוחה לשולח הזה
      const openTask = openTasks[senderPhone];
      if (openTask && (now - openTask.lastMessageTime) < config.TASK_WINDOW_MS) {
        // הודעה שמתחילה ב"משימה" → סוגר קודמת ופותח חדשה
        if (text && text.match(/^משימה\s/i)) {
          // פותח משימה חדשה (ממשיך למטה)
        } else {
          // מצרף למשימה הפתוחה
          try {
            const addition = mediaType ? `\n📎 ${mediaType} צורף` : (text ? `\n${text}` : '');
            if (addition) {
              const taskRef = doc(db, 'tasks', openTask.taskId);
              await updateDoc(taskRef, {
                description: openTask.description + addition,
                updated_date: new Date().toISOString(),
              });
              openTask.description += addition;
              openTask.lastMessageTime = now;
              console.log(`📎 צורף למשימה: ${openTask.taskId}`);
            }
          } catch (e) {
            console.error('❌ שגיאה בצירוף למשימה:', e.message);
          }
          continue;
        }
      }

      // בדיקה אם זו משימה חדשה
      if (!text || !text.match(/^משימה\s/i)) continue;

      // יצירת משימה חדשה
      try {
        const assignee = extractAssignee(text, msg);
        const title = cleanTitle(text) || 'משימה ללא כותרת';
        const nowISO = new Date().toISOString();

        const docRef = await addDoc(collection(db, 'tasks'), {
          title,
          description: text,
          status: 'חדש',
          priority: 'בינונית',
          source_type: 'whatsapp',
          sender_name: senderUser,
          creator: senderUser,
          sender_phone: senderPhone,
          assigned_to: assignee,
          created_date: nowISO,
          createdAt: nowISO,
          updated_date: nowISO,
        });

        // שמירת משימה פתוחה
        openTasks[senderPhone] = {
          taskId: docRef.id,
          description: text,
          lastMessageTime: now,
        };

        await sock.sendMessage(config.GROUP_ID, {
          text: `✅ משימה נוצרה: ${title}\n👤 אחראי: ${assignee}\n📝 נוצר ע"י: ${senderUser}`
        });
        console.log(`✅ משימה: ${title} → ${assignee} (ע"י ${senderUser})`);
      } catch (err) {
        console.error('❌ שגיאה:', err.message);
      }
    }
  });
}

console.log('🚀 מפעיל בוט וואטסאפ - ארגמן');
connectToWhatsApp();
