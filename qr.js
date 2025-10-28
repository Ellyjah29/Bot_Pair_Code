import express from 'express';
import fs from 'fs-extra';
import pino from 'pino';
import { makeWASocket, useMultiFileAuthState, delay, makeCacheableSignalKeyStore, Browsers, jidNormalizedUser, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';

const router = express.Router();
const AUTH_PATH_BASE = './sessions';

// Ensure the session folder exists
function removeSession(folder) {
  try {
    if (fs.existsSync(folder)) fs.rmSync(folder, { recursive: true, force: true });
  } catch (e) {
    console.error("Error removing session folder:", e);
  }
}

router.get('/', async (req, res) => {
  let num = req.query.number;
  if (!num) return res.status(400).send({ code: "Missing number parameter" });

  // Clean number
  num = num.replace(/[^0-9]/g, '');
  if (!num) return res.status(400).send({ code: "Invalid number" });

  const sessionDir = `${AUTH_PATH_BASE}/${num}`;
  removeSession(sessionDir); // Remove previous session if exists

  async function startSession() {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    try {
      const { version } = await fetchLatestBaileysVersion();
      const bot = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
        },
        printQRInTerminal: false,
        logger: pino({ level: "fatal" }).child({ level: "fatal" }),
        browser: Browsers.windows('Chrome'),
      });

      bot.ev.on('creds.update', saveCreds);

      bot.ev.on('connection.update', async (update) => {
        const { connection, isNewLogin, isOnline } = update;

        // QR code sent
        if (!bot.authState.creds.registered && update.qr) {
          const qrCode = update.qr;
          if (!res.headersSent) await res.send({ qr: qrCode });
          console.log("🔑 QR code sent to user");
        }

        if (connection === 'open') {
          console.log("✅ Connected successfully!");

          const userJid = jidNormalizedUser(num + '@s.whatsapp.net');

          try {
            // Send tutorial video link
            await bot.sendMessage(userJid, {
              image: { url: 'https://img.youtube.com/vi/-oz_u1iMgf8/maxresdefault.jpg' },
              caption: `🎬 *KnightBot MD V2.0 Full Setup Guide!*\n\n🚀 Bug Fixes + New Commands + Fast AI Chat\n📺 Watch Now: https://youtu.be/-oz_u1iMgf8`
            });

            // Send warning message
            await bot.sendMessage(userJid, {
              text: `⚠️Do not share this QR code with anybody⚠️\n\n┌┤✑  Thanks for using Knight Bot\n│└────────────┈ ⳹\n│©2024 Mr Unique Hacker \n└─────────────────┈ ⳹\n\n`
            });

            console.log("🎬 Video and warning messages sent successfully");

            // Clean up session
            await delay(1000);
            removeSession(sessionDir);
            console.log("🧹 Session cleaned up successfully");

          } catch (err) {
            console.error("❌ Error sending messages:", err);
            removeSession(sessionDir);
          }
        }

        if (isNewLogin) console.log("🔐 New login via QR code");
        if (isOnline) console.log("📶 Client is online");
      });

    } catch (err) {
      console.error("❌ Error initializing session:", err);
      if (!res.headersSent) res.status(503).send({ code: "Service Unavailable" });
    }
  }

  await startSession();
});

// Global error handling
process.on('uncaughtException', (err) => {
  const ignoreErrors = [
    "conflict",
    "not-authorized",
    "Socket connection timeout",
    "rate-overlimit",
    "Connection Closed",
    "Timed Out",
    "Value not found",
    "Stream Errored",
    "Stream Errored (restart required)",
    "statusCode: 515",
    "statusCode: 503"
  ];

  const msg = String(err);
  if (!ignoreErrors.some(e => msg.includes(e))) console.error('Caught exception:', err);
});

export default router;
