import express from 'express';
import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
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
const AUTH_DIR = path.join('./auth_sessions');
await fs.ensureDir(AUTH_DIR);

const MESSAGE = process.env.MESSAGE || `
*SESSION GENERATED SUCCESSFULLY* ✅

*Join channel* 📢              
Follow the Septorch ™ channel on WhatsApp: https://whatsapp.com/channel/0029Vb1ydGk8qIzkvps0nZ04

*Sᴜᴘᴘᴏʀᴛ Gʀᴏᴜᴘ ꜰᴏʀ ϙᴜᴇʀʏ* 💭              
https://chat.whatsapp.com/GGBjhgrxiAS1Xf5shqiGXH?mode=wwt

*Yᴏᴜᴛᴜʙᴇ ᴛᴜᴛᴏʀɪᴀʟꜱ* 🪄               
https://youtube.com/@septorch

*SEPTORCH--WHATSAPP-BOT* 🤖
`;

function randomString(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function randomMegaId(length = 6, numberLength = 4) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < length; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  const number = Math.floor(Math.random() * Math.pow(10, numberLength));
  return `${text}${number}`;
}

// ---- Simple queue system ----
const sessionQueue = [];
let isProcessing = false;

async function processQueue() {
  if (isProcessing) return;
  if (sessionQueue.length === 0) return;

  isProcessing = true;
  const { num, res } = sessionQueue.shift();

  const SESSION_ID = `${num}_${randomString(6)}`;
  const SESSION_PATH = path.join(AUTH_DIR, SESSION_ID);
  await fs.ensureDir(SESSION_PATH);

  async function startSession() {
    try {
      const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);

      const sock = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' })),
        },
        printQRInTerminal: false,
        logger: pino({ level: 'fatal' }),
        browser: Browsers.macOS('Safari'),
      });

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
        if (connection === 'open') {
          try {
            await delay(10000);

            const credsFile = path.join(SESSION_PATH, 'creds.json');
            if (!fs.existsSync(credsFile)) throw new Error('creds.json not found');

            const megaUrl = await upload(fs.createReadStream(credsFile), `${randomMegaId()}.json`);
            const scanId = megaUrl.replace('https://mega.nz/file/', '');

            const userJid = jidNormalizedUser(`${num}@s.whatsapp.net`);
            const msg = await sock.sendMessage(userJid, { text: scanId });
            await sock.sendMessage(userJid, { text: MESSAGE }, { quoted: msg });

            await delay(1000);
            await fs.emptyDir(SESSION_PATH);
          } catch (err) {
            console.error('Error sending Mega ID or message:', err);
          }
        }

        if (connection === 'close') {
          const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
          switch (reason) {
            case DisconnectReason.restartRequired:
            case DisconnectReason.timedOut:
              console.log('🔄 Restarting session due to disconnect...');
              startSession().catch(console.error);
              break;
            default:
              console.log('❌ Connection closed:', reason);
              await delay(5000);
              exec('pm2 restart your-service-name');
          }
        }
      });

      if (!sock.authState.creds.registered) {
        await delay(1500);
        const code = await sock.requestPairingCode(num);
        if (!res.headersSent) res.send({ code, session: SESSION_ID });
      }
    } catch (err) {
      console.error('Session error:', err);
      exec('pm2 restart your-service-name');
      await fs.emptyDir(SESSION_PATH);
      if (!res.headersSent) res.send({ code: 'Try after a few minutes' });
    }
  }

  await startSession();
  isProcessing = false;
  // Start next in queue automatically
  processQueue();
}

router.get('/', async (req, res) => {
  let num = req.query.number;
  if (!num) return res.status(400).send({ code: 'Missing number parameter' });

  num = num.replace(/[^0-9]/g, '');
  if (!num) return res.status(400).send({ code: 'Invalid number' });

  // Add request to the queue
  sessionQueue.push({ num, res });
  processQueue();
});

export default router;