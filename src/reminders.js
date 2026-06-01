// מודול תזכורות מתוזמנות - ארגמן

const cron = require('node-cron');
const config = require('./config');

// אתחול תזכורות
function initReminders(sock, db) {
  if (!config.GROUP_ID) {
    console.log('⚠️ לא הוגדר GROUP_ID - התזכורות לא יופעלו');
    console.log('⚠️ יש למלא את GROUP_ID בקובץ src/config.js');
    return;
  }

  console.log('🕐 מפעיל תזכורות מתוזמנות...');

  // תזכורת יומן עבודה - כל יום א-ה בשעה 18:00
  cron.schedule(config.REMINDER_WORK_LOG_TIME, async () => {
    try {
      await sock.sendMessage(config.GROUP_ID, {
        text: '📝 תזכורת: נא למלא יומן עבודה להיום',
      });
      console.log('✅ נשלחה תזכורת יומן עבודה');
    } catch (err) {
      console.error('❌ שגיאה בשליחת תזכורת יומן:', err.message);
    }
  }, { timezone: config.TIMEZONE });

  // תזכורת משימות ליום - כל יום א-ה בשעה 09:00
  cron.schedule(config.REMINDER_TASKS_TIME, async () => {
    try {
      await sendDailyTaskReminders(sock, db);
    } catch (err) {
      console.error('❌ שגיאה בשליחת תזכורות משימות:', err.message);
    }
  }, { timezone: config.TIMEZONE });

  // סיכום שבועי - כל יום ראשון בשעה 08:00
  cron.schedule(config.WEEKLY_SUMMARY_TIME, async () => {
    try {
      await sendWeeklySummary(sock, db);
    } catch (err) {
      console.error('❌ שגיאה בשליחת סיכום שבועי:', err.message);
    }
  }, { timezone: config.TIMEZONE });

  console.log('✅ תזכורות הופעלו בהצלחה');
}

// שליחת תזכורות משימות ליום הנוכחי
async function sendDailyTaskReminders(sock, db) {
  // חישוב תחילת וסוף היום
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // שליפת משימות שתאריך היעד שלהן הוא היום
  const tasksSnapshot = await db.collection('tasks')
    .where('due_date', '>=', today)
    .where('due_date', '<', tomorrow)
    .where('status', '!=', 'הושלם')
    .get();

  if (tasksSnapshot.empty) {
    console.log('ℹ️ אין משימות ליום זה');
    return;
  }

  // שליחת תזכורת לכל משימה
  for (const doc of tasksSnapshot.docs) {
    const task = doc.data();
    const assignedTo = task.assigned_to || 'לא מוקצה';
    const text = `⏰ משימה ליום: ${task.title} - מוקצה ל: ${assignedTo}`;

    await sock.sendMessage(config.GROUP_ID, { text });
  }

  console.log(`✅ נשלחו ${tasksSnapshot.size} תזכורות משימות`);
}

// שליחת סיכום שבועי
async function sendWeeklySummary(sock, db) {
  // ספירת משימות פתוחות
  const openSnapshot = await db.collection('tasks')
    .where('status', 'in', ['חדש', 'בתהליך'])
    .get();

  // ספירת משימות שהושלמו השבוע
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const completedSnapshot = await db.collection('tasks')
    .where('status', '==', 'הושלם')
    .where('updated_at', '>=', weekAgo)
    .get();

  const text = `📊 סיכום שבועי: ${openSnapshot.size} משימות פתוחות, ${completedSnapshot.size} הושלמו`;

  await sock.sendMessage(config.GROUP_ID, { text });
  console.log('✅ נשלח סיכום שבועי');
}

module.exports = { initReminders };
