import express from 'express';
import fs from 'fs-extra';
import path from 'path';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import { upload } from './mega.js';
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

*Join channel* 📢  
Follow the Septorch ™ channel on WhatsApp: https://whatsapp.com/channel/0029Vb1ydGk8qIzkvps0nZ04  

*Sᴜᴘᴘᴏʀᴛ Gʀᴏᴜᴘ ꜰᴏʀ ϙᴜᴇʀʏ* 💭  
https://chat.whatsapp.com/GGBjhgrxiAS1Xf5shqiGXH?mode=wwt  

*Yᴏᴜ-ᴛᴜʙᴇ ᴛᴜᴛᴏʀɪᴀʟꜱ* 🪄  
https://youtube.com/@septorch  

*SEPTORCH--WHATTSAPP-BOT* 🤖
`;

// Random string
function randomString(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// Random Mega ID
function randomMegaId(length = 6, numberLength = 4) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < length; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  const number = Math.floor(Math.random() * Math.pow(10, numberLength));
  return `${text}${number}`;
}

router.get('/', async (req, res) => {
  try {
    let num = req.query.number;
    if (!num) return res.status(400).send({ code: 'Missing number parameter' });

    num = num.replace(/[^0-9]/g, '');
    if (!num) return res.status(400).send({ code: 'Invalid number' });

    const SESSION_ID = `${num}_${randomString(5)}`;
    const AUTH_PATH = path.join('./auth_sessions', SESSION_ID);
    await fs.ensureDir(AUTH_PATH);

    // Create isolated session
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

    // Update creds
    Smd.ev.on('creds.update', saveCreds);

    // Detect connection
    Smd.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'open') {
        console.log(`✅ Connected: ${num}`);

        try {
          await delay(5000);

          const credsFile = path.join(AUTH_PATH, 'creds.json');
          if (!fs.existsSync(credsFile)) throw new Error('creds.json not found');

          const megaUrl = await upload(fs.createReadStream(credsFile), `${randomMegaId()}.json`);
          const scanId = megaUrl.replace('https://mega.nz/file/', '');

          const userJid = jidNormalizedUser(num + '@s.whatsapp.net');
          const msg = await Smd.sendMessage(userJid, { text: scanId });
          await Smd.sendMessage(userJid, { text: MESSAGE }, { quoted: msg });

          console.log(`📤 Mega ID sent to ${num}`);

          await delay(1000);
          await fs.remove(AUTH_PATH);
          console.log(`🧹 Cleaned session folder: ${AUTH_PATH}`);

          // Close socket cleanly
          await delay(1000);
          Smd.ws.close();
          Smd.ev.removeAllListeners();

        } catch (err) {
          console.error(`❌ Error for ${num}:`, err);
        }
      }

      if (connection === 'close') {
        const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
        switch (reason) {
          case DisconnectReason.restartRequired:
          case DisconnectReason.timedOut:
            console.log(`🔄 Restarting session for ${num}...`);
            initiateSession().catch(console.error);
            break;
          default:
            console.log(`❌ Connection closed for ${num}:`, reason);
            break;
        }
      }
    });

    // Generate pairing code
    if (!Smd.authState.creds.registered) {
      await delay(1500);
      try {
        const code = await Smd.requestPairingCode(num);
        res.status(200).send({ code, session: SESSION_ID });
        console.log(`🔑 Pairing code for ${num}: ${code}`);
      } catch (err) {
        console.error(`❌ Error getting pairing code for ${num}:`, err);
        res.status(503).send({ code: 'Failed to get pairing code' });
      }
    }

  } catch (e) {
    console.error('Session error:', e);
    if (!res.headersSent) res.status(500).send({ code: 'Internal session error' });
  }
});

export default router;