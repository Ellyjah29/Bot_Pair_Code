import express from 'express';
import fs from 'fs-extra';
import path from 'path';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import { upload } from './mega.js';
import rateLimit from 'express-rate-limit';
import {
  default as makeWASocket,
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
  DisconnectReason,
} from '@whiskeysockets/baileys';

const router = express.Router();

const MESSAGE = process.env.MESSAGE || `
*SESSION GENERATED SUCCESSFULLY* ✅

*Gɪᴠᴇ ᴀ ꜱᴛᴀʀ ᴛᴏ ʀᴇᴘᴏ ꜰᴏʀ ᴄᴏᴜʀᴀɢᴇ* 🌟
https://github.com/GuhailTechInfo/ULTRA-MD

*Sᴜᴘᴘᴏʀᴛ Gʀᴏᴜᴘ ꜰᴏʀ ϙᴜᴇʀʏ* 💭
https://t.me/GlobalBotInc
https://whatsapp.com/channel/0029VagJIAr3bbVBCpEkAM07

*Yᴏᴜ-ᴛᴜʙᴇ ᴛᴜᴛᴏʀɪᴀʟꜱ* 🪄 
https://youtube.com/GlobalTechInfo

*ULTRA-MD--WHATSAPP-BOT* 🥀
`;

// Rate limit: max 10 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many session requests, please try again later.' },
});
router.use(limiter);

// Helper: random string generator
function randomMegaId(length = 6, numberLength = 4) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  const num = Math.floor(Math.random() * Math.pow(10, numberLength));
  return `${result}${num}`;
}

function withTimeout(promise, ms, message = 'Operation timed out') {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

router.get('/', async (req, res) => {
  let num = req.query.number;
  if (!num) return res.status(400).send({ code: 'Missing number parameter' });

  num = num.replace(/[^0-9]/g, '');
  if (!num) return res.status(400).send({ code: 'Invalid number' });

  const sessionId = randomMegaId(8);
  const AUTH_PATH = path.join('/tmp', `session_${sessionId}`); // ✅ Use /tmp for Render (only writeable area)
  await fs.ensureDir(AUTH_PATH);

  async function cleanUp() {
    try {
      await fs.remove(AUTH_PATH);
      console.log(`🧹 Cleaned session ${sessionId}`);
    } catch {}
  }

  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_PATH);

    const Smd = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
      },
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: Browsers.macOS('Safari'),
    });

    Smd.ev.on('creds.update', saveCreds);

    Smd.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'open') {
        console.log(`✅ ${sessionId}: Connected`);

        try {
          await delay(4000);
          const credsFile = path.join(AUTH_PATH, 'creds.json');
          if (!fs.existsSync(credsFile)) throw new Error('creds.json not found');

          const megaUrl = await withTimeout(
            upload(fs.createReadStream(credsFile), `${randomMegaId()}.json`),
            20000,
            'Upload timeout'
          );
          const scanId = megaUrl.replace('https://mega.nz/file/', '');

          const userJid = jidNormalizedUser(num + '@s.whatsapp.net');
          const msg = await Smd.sendMessage(userJid, { text: scanId });
          await Smd.sendMessage(userJid, { text: MESSAGE }, { quoted: msg });

          console.log(`📤 ${sessionId}: Sent to ${num}`);
          await delay(1000);
          await cleanUp();

        } catch (err) {
          console.error(`❌ ${sessionId}:`, err.message);
          await cleanUp();
        }
      }

      if (connection === 'close') {
        const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
        console.log(`⚠️ ${sessionId}: Connection closed (${reason})`);
        await cleanUp();
      }
    });

    if (!Smd.authState.creds.registered) {
      await delay(1500);
      try {
        const code = await withTimeout(Smd.requestPairingCode(num), 15000, 'Pairing code timeout');
        if (!res.headersSent) res.send({ code, sessionId });
        console.log(`🔑 ${sessionId}: Pairing code ${code}`);
      } catch (err) {
        console.error(`❌ ${sessionId}: Failed to get code -`, err.message);
        if (!res.headersSent) res.status(503).send({ code: 'Failed to get pairing code' });
        await cleanUp();
      }
    }

  } catch (err) {
    console.error(`❌ ${sessionId}:`, err.message);
    if (!res.headersSent) res.status(500).send({ code: 'Internal error' });
    await cleanUp();
  }
});

export default router;