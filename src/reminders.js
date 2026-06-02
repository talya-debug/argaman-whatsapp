// תזכורות מתוזמנות — ארגמן

const cron = require('node-cron');
const config = require('./config');

function initReminders(sock) {
  if (!config.GROUP_ID) {
    console.log('⚠️ לא הוגדר GROUP_ID — תזכורות לא יופעלו');
    return;
  }

  console.log('🕐 מפעיל תזכורות...');

  // יומן עבודה — כל יום א-ה 18:00
  cron.schedule(config.REMINDER_WORK_LOG_TIME, async () => {
    try {
      await sock.sendMessage(config.GROUP_ID, { text: '📝 תזכורת: נא למלא יומן עבודה להיום' });
      console.log('✅ תזכורת יומן עבודה');
    } catch (e) { console.error('❌ תזכורת יומן:', e.message); }
  }, { timezone: config.TIMEZONE });

  // חשבונות — 1 לחודש
  cron.schedule(config.REMINDER_INVOICES_TIME, async () => {
    try {
      await sock.sendMessage(config.GROUP_ID, { text: '🧾 תזכורת חודשית: נא להגיש חשבונות' });
      console.log('✅ תזכורת חשבונות');
    } catch (e) { console.error('❌ תזכורת חשבונות:', e.message); }
  }, { timezone: config.TIMEZONE });

  // רכבים — 1 לחודש
  cron.schedule(config.REMINDER_VEHICLES_TIME, async () => {
    try {
      await sock.sendMessage(config.GROUP_ID, { text: '🚗 תזכורת חודשית: נא לבדוק רכבים — טסט, ביטוח, דיווח ק"מ' });
      console.log('✅ תזכורת רכבים');
    } catch (e) { console.error('❌ תזכורת רכבים:', e.message); }
  }, { timezone: config.TIMEZONE });

  console.log('✅ תזכורות הופעלו');
}

module.exports = { initReminders };
