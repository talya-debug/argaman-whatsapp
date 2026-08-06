// שרת בוט וואטסאפ - ארגמן — גרסת Green-API (חיבור יציב דרך שירות מנוהל)
// מקבל הודעות מהקבוצה דרך webhook, יוצר משימות ב-Firestore, ושולח תזכורות.

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, doc, updateDoc } = require('firebase/firestore');
const http = require('http');
const https = require('https');
const config = require('./config');
const { initReminders } = require('./reminders');

// ----- אתחול Firebase -----
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

// ----- הגדרות Green-API (מגיעות ממשתני סביבה) -----
const ID_INSTANCE = process.env.GREENAPI_ID_INSTANCE || '';
const API_TOKEN = process.env.GREENAPI_API_TOKEN || '';
const API_URL = (process.env.GREENAPI_API_URL || 'https://api.green-api.com').replace(/\/$/, '');
if (!ID_INSTANCE || !API_TOKEN) {
  console.warn('⚠️ חסרים GREENAPI_ID_INSTANCE / GREENAPI_API_TOKEN — יש להגדיר במשתני הסביבה');
}

// שליחת הודעה דרך Green-API
function sendMessage(chatId, text) {
  return new Promise((resolve, reject) => {
    const url = `${API_URL}/waInstance${ID_INSTANCE}/sendMessage/${API_TOKEN}`;
    const body = JSON.stringify({ chatId, message: text });
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
        else reject(new Error(`Green-API ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// שליחה לקבוצה שלנו
const sendToGroup = (text) => sendMessage(config.GROUP_ID, text);

// ----- לוגיקת משימות -----
// מעקב משימות פתוחות — { senderId: { taskId, description, lastMessageTime } }
const openTasks = {};

// מיפוי שם וואטסאפ לשם בעברית
function resolveUser(pushName) {
  if (!pushName) return null;
  for (const [name, hebrewName] of Object.entries(config.NAME_TO_USER)) {
    if (pushName.includes(name)) return hebrewName;
  }
  return pushName;
}

// חילוץ אחראי מתוך הטקסט — @שם, או שם כמילה ראשונה אחרי "משימה"
function extractAssignee(text) {
  const match = text.match(/@(\S+)/);
  if (match && config.NAME_TO_USER[match[1]]) return config.NAME_TO_USER[match[1]];
  const afterTask = text.replace(/^משימה\s*/i, '').trim();
  const firstWord = afterTask.split(/\s/)[0];
  if (config.NAME_TO_USER[firstWord]) return config.NAME_TO_USER[firstWord];
  return config.DEFAULT_ASSIGNEE;
}

// ניקוי מילת "משימה", תיוגים, ושם האחראי מתחילת הכותרת
function cleanTitle(text) {
  let t = text.replace(/^משימה\s*/i, '').replace(/@\S+/g, '').trim();
  const firstWord = t.split(/\s/)[0];
  if (config.NAME_TO_USER[firstWord]) t = t.slice(firstWord.length).trim();
  return t;
}

// עיבוד הודעה נכנסת מ-webhook של Green-API
async function handleWebhook(body) {
  if (body.typeWebhook !== 'incomingMessageReceived') return; // רק הודעות נכנסות

  const chatId = body.senderData?.chatId || '';
  if (!chatId.endsWith('@g.us')) return;      // רק קבוצות
  if (chatId !== config.GROUP_ID) return;     // רק הקבוצה שלנו

  const senderName = body.senderData?.senderName || body.senderData?.chatName || 'לא ידוע';
  const senderId = body.senderData?.sender || '';
  const senderUser = resolveUser(senderName) || senderName;

  const md = body.messageData || {};
  const text = md.textMessageData?.textMessage || md.extendedTextMessageData?.text || '';

  const tp = md.typeMessage || '';
  const mediaType = tp === 'imageMessage' ? 'תמונה'
    : tp === 'documentMessage' ? 'קובץ'
    : tp === 'audioMessage' ? 'הודעה קולית'
    : tp === 'videoMessage' ? 'סרטון' : null;

  const now = Date.now();
  console.log(`📩 ${senderName}: ${text ? text.substring(0, 60) : (mediaType || '?')}`);

  // צירוף למשימה פתוחה (בתוך חלון הזמן) אם ההודעה לא מתחילה ב"משימה"
  const openTask = openTasks[senderId];
  if (openTask && (now - openTask.lastMessageTime) < config.TASK_WINDOW_MS) {
    if (!(text && text.match(/^משימה\s/i))) {
      try {
        const addition = mediaType ? `\n📎 ${mediaType} צורף` : (text ? `\n${text}` : '');
        if (addition) {
          await updateDoc(doc(db, 'tasks', openTask.taskId), {
            description: openTask.description + addition,
            updated_date: new Date().toISOString(),
          });
          openTask.description += addition;
          openTask.lastMessageTime = now;
          console.log(`📎 צורף למשימה: ${openTask.taskId}`);
        }
      } catch (e) { console.error('❌ שגיאה בצירוף למשימה:', e.message); }
      return;
    }
  }

  // משימה חדשה רק אם ההודעה מתחילה ב"משימה"
  if (!text || !text.match(/^משימה\s/i)) return;

  try {
    const assignee = extractAssignee(text);
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
      sender_phone: senderId,
      assigned_to: assignee,
      created_date: nowISO,
      createdAt: nowISO,
      updated_date: nowISO,
    });

    openTasks[senderId] = { taskId: docRef.id, description: text, lastMessageTime: now };

    await sendToGroup(`✅ משימה נוצרה: ${title}\n👤 אחראי: ${assignee}\n📝 נוצר ע"י: ${senderUser}`);
    console.log(`✅ משימה: ${title} → ${assignee} (ע"י ${senderUser})`);
  } catch (err) { console.error('❌ שגיאה ביצירת משימה:', err.message); }
}

// ----- שרת HTTP: מקבל webhooks + דף בריאות -----
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  if (req.method === 'POST') {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', async () => {
      res.writeHead(200); res.end('OK'); // מאשרים מיד ל-Green-API
      try { if (data) await handleWebhook(JSON.parse(data)); }
      catch (e) { console.error('❌ שגיאת webhook:', e.message); }
    });
    return;
  }
  // GET — דף בריאות
  const ready = ID_INSTANCE && API_TOKEN;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<html dir="rtl"><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:Arial;background:#1a1d2e;color:${ready ? '#4ade80' : '#f59e0b'};"><h1>${ready ? '✅ בוט ארגמן פעיל (Green-API)' : '⚠️ ממתין להגדרת Green-API'}</h1></body></html>`);
}).listen(PORT, '0.0.0.0', () => console.log(`🌐 שרת webhook פעיל בפורט ${PORT}`));

// ----- תזכורות מתוזמנות (sendMessage תומך גם בשליחה פרטית לעובדים) -----
initReminders(sendMessage);

console.log('🚀 בוט ארגמן (Green-API) מוכן');
