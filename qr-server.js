const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const http = require('http');

let currentQR = '';
let connected = false;

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  const sock = makeWASocket({ auth: state, logger: pino({ level: 'silent' }), printQRInTerminal: false });

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async (update) => {
    const { qr, connection } = update;
    if (qr) {
      currentQR = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
      console.log('QR מוכן — ' + new Date().toLocaleTimeString('he-IL'));
    }
    if (connection === 'open') {
      connected = true;
      console.log('מחובר בהצלחה!');
    }
    if (connection === 'close' && !connected) {
      console.log('מתחבר מחדש...');
      setTimeout(start, 3000);
    }
  });
}

// שרת שמציג את ה-QR בדפדפן עם רענון אוטומטי
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  if (connected) {
    res.end('<html dir="rtl"><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:Arial;"><h1 style="color:green;">מחובר בהצלחה! אפשר לסגור.</h1></body></html>');
  } else if (currentQR) {
    res.end(`<html dir="rtl"><body style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;font-family:Arial;">
      <h2>סרקו את הקוד עם וואטסאפ</h2>
      <p>הגדרות > מכשירים מקושרים > קשר מכשיר</p>
      <img src="${currentQR}" style="margin:20px;" />
      <p style="color:gray;">הדף מתרענן אוטומטית</p>
      <script>setTimeout(()=>location.reload(), 15000)</script>
    </body></html>`);
  } else {
    res.end('<html dir="rtl"><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:Arial;"><h2>ממתין ל-QR... הדף יתרענן אוטומטית</h2><script>setTimeout(()=>location.reload(), 3000)</script></body></html>');
  }
}).listen(3456, () => {
  console.log('פתחו בדפדפן: http://localhost:3456');
});

start();
