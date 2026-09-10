// תזכורות מתוזמנות — ארגמן

const cron = require('node-cron');
const config = require('./config');

// מקבל פונקציית שליחה sendMessage(chatId, text) — או אובייקט sock ישן (תאימות לאחור)
function initReminders(sender) {
  if (!config.GROUP_ID) {
    console.log('⚠️ לא הוגדר GROUP_ID — תזכורות לא יופעלו');
    return;
  }

  // מאחד את שתי השיטות לפונקציה אחת: sendMessage(chatId, text)
  const sendMessage = typeof sender === 'function'
    ? sender
    : (chatId, text) => sender.sendMessage(chatId, { text });

  // שליחה לקבוצה
  const sendGroup = (text) => sendMessage(config.GROUP_ID, text);

  console.log('🕐 מפעיל תזכורות...');

  // בדיקה שלא שישי/שבת (הגנה נוספת מעבר ל-cron)
  const isWorkDay = () => {
    const day = new Date().toLocaleDateString('en-US', { weekday: 'short', timeZone: config.TIMEZONE });
    return !['Fri', 'Sat'].includes(day);
  };

  // יומן עבודה — א-ה 18:00
  // אם הוגדרו נמענים (WORK_LOG_RECIPIENTS) — נשלח בפרטי לכל עובד. אחרת — לקבוצה.
  cron.schedule(config.REMINDER_WORK_LOG_TIME, async () => {
    if (!isWorkDay()) return;
    // מתג הפעלה — כבוי כברירת מחדל. הבוט לא ישלח תזכורות יומן עבודה
    // עד שיוגדר במפורש WORKLOG_REMINDERS=on במשתני הסביבה (אישור טליה).
    if (process.env.WORKLOG_REMINDERS !== 'on') {
      console.log('⏸️ תזכורת יומן עבודה כבויה (WORKLOG_REMINDERS≠on) — לא נשלח');
      return;
    }
    try {
      const recipients = config.WORK_LOG_RECIPIENTS || [];
      if (recipients.length) {
        for (const r of recipients) {
          if (!r.phone) continue;
          const chatId = `${r.phone}@c.us`;
          // הודעת טקסט קודם, ואז הלינק בהודעה נפרדת — כך וואטסאפ הופך אותו ללחיץ
          await sendMessage(chatId, `📝 היי ${r.name || ''}, תזכורת: נא למלא יומן עבודה להיום`.trim());
          await sendMessage(chatId, config.WORK_LOG_URL);
        }
        console.log(`✅ תזכורת יומן עבודה — נשלחה בפרטי ל-${recipients.length} עובדים`);
      } else {
        await sendGroup('📝 תזכורת: נא למלא יומן עבודה להיום');
        await sendGroup(config.WORK_LOG_URL);
        console.log('✅ תזכורת יומן עבודה — נשלחה לקבוצה');
      }
    } catch (e) { console.error('❌ תזכורת יומן:', e.message); }
  }, { timezone: config.TIMEZONE });

  // חשבונות — 1 לחודש (בקבוצה)
  cron.schedule(config.REMINDER_INVOICES_TIME, async () => {
    if (!isWorkDay()) return;
    try {
      await sendGroup('🧾 תזכורת חודשית: נא להגיש חשבונות\n\n1. היכנסו לפרויקט → כתב כמויות\n2. עדכנו כמות שבוצעה\n3. לחצו "אשר חשבון והעבר לגבייה"');
      console.log('✅ תזכורת חשבונות');
    } catch (e) { console.error('❌ תזכורת חשבונות:', e.message); }
  }, { timezone: config.TIMEZONE });

  // רכבים — 1 לחודש (בקבוצה)
  cron.schedule(config.REMINDER_VEHICLES_TIME, async () => {
    if (!isWorkDay()) return;
    try {
      await sendGroup('🚗 תזכורת חודשית: נא לבדוק רכבים — טסט, ביטוח, דיווח ק"מ');
      await sendGroup('https://argaman-new.vercel.app/KmReport');
      console.log('✅ תזכורת רכבים');
    } catch (e) { console.error('❌ תזכורת רכבים:', e.message); }
  }, { timezone: config.TIMEZONE });

  console.log('✅ תזכורות הופעלו (א-ה בלבד, לא שישי/שבת)');
}

module.exports = { initReminders };
