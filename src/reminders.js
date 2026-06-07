// תזכורות מתוזמנות — ארגמן

const cron = require('node-cron');
const config = require('./config');

function initReminders(sock) {
  if (!config.GROUP_ID) {
    console.log('⚠️ לא הוגדר GROUP_ID — תזכורות לא יופעלו');
    return;
  }

  console.log('🕐 מפעיל תזכורות...');

  // בדיקה שלא שישי/שבת (הגנה נוספת מעבר ל-cron)
  const isWorkDay = () => {
    const day = new Date().toLocaleDateString('en-US', { weekday: 'short', timeZone: config.TIMEZONE });
    return !['Fri', 'Sat'].includes(day);
  };

  // יומן עבודה — א-ה 18:00 עם לינק
  cron.schedule(config.REMINDER_WORK_LOG_TIME, async () => {
    if (!isWorkDay()) return;
    try {
      await sock.sendMessage(config.GROUP_ID, {
        text: `📝 תזכורת: נא למלא יומן עבודה להיום\n\n🔗 למילוי: ${config.WORK_LOG_URL}`
      });
      console.log('✅ תזכורת יומן עבודה');
    } catch (e) { console.error('❌ תזכורת יומן:', e.message); }
  }, { timezone: config.TIMEZONE });

  // חשבונות — 1 לחודש (אם נופל על שישי/שבת — לא שולח)
  cron.schedule(config.REMINDER_INVOICES_TIME, async () => {
    if (!isWorkDay()) return;
    try {
      await sock.sendMessage(config.GROUP_ID, { text: '🧾 תזכורת חודשית: נא להגיש חשבונות\n\n1. היכנסו לפרויקט → כתב כמויות\n2. עדכנו כמות שבוצעה\n3. לחצו "אשר חשבון והעבר לגבייה"' });
      console.log('✅ תזכורת חשבונות');
    } catch (e) { console.error('❌ תזכורת חשבונות:', e.message); }
  }, { timezone: config.TIMEZONE });

  // רכבים — 1 לחודש
  cron.schedule(config.REMINDER_VEHICLES_TIME, async () => {
    if (!isWorkDay()) return;
    try {
      await sock.sendMessage(config.GROUP_ID, { text: '🚗 תזכורת חודשית: נא לבדוק רכבים — טסט, ביטוח, דיווח ק"מ\n\n🔗 דיווח ק"מ: https://argaman-new.vercel.app/KmReport' });
      console.log('✅ תזכורת רכבים');
    } catch (e) { console.error('❌ תזכורת רכבים:', e.message); }
  }, { timezone: config.TIMEZONE });

  console.log('✅ תזכורות הופעלו (א-ה בלבד, לא שישי/שבת)');
}

module.exports = { initReminders };
