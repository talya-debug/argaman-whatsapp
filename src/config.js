// הגדרות בוט וואטסאפ - ארגמן

module.exports = {
  GROUP_ID: '120363038805774681@g.us',
  FIREBASE_PROJECT_ID: 'argaman-f3921',
  TIMEZONE: 'Asia/Jerusalem',

  // תזכורות
  REMINDER_WORK_LOG_TIME: '0 18 * * 0-4',    // יומן עבודה — כל יום א-ה 18:00
  REMINDER_INVOICES_TIME: '0 9 1 * *',        // חשבונות — 1 לחודש 09:00
  REMINDER_VEHICLES_TIME: '0 9 1 * *',        // רכבים — 1 לחודש 09:00

  // זמן חלון משימה פתוחה (מילישניות) — 5 דקות
  TASK_WINDOW_MS: 5 * 60 * 1000,

  // ברירת מחדל אחראי
  DEFAULT_ASSIGNEE: 'chaya',

  // מיפוי שם בוואטסאפ → username במערכת
  NAME_TO_USER: {
    'יניר': 'yanir',
    'שי': 'shai',
    'רבקה': 'rivka',
    'דבורה': 'dvora',
    'חיה': 'chaya',
    'יהודה': 'yehuda',
  },

  // מיפוי WhatsApp ID → username
  // הבוט ידפיס מספרים חדשים בלוג כדי להוסיף
  PHONE_TO_USER: {
    '201966693142782': 'yanir',   // יניר
  },
};
