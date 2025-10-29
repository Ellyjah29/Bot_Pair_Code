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

const AUTH_DIR = path.join('./auth_sessions');

// Ensure auth directory exists
fs.ensureDirSync(AUTH_DIR);

function randomMegaId(length = 6, numberLength = 4) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < length; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  const number = Math.floor(Math.random() * Math.pow(10, numberLength));
  return `${text}${number}`;
}

router.get('/', async (req, res) => {
  let num = req.query.number;
  if (!num) return res.status(400).send({ code: 'Missing number parameter' });

  num = num.replace(/[^0-9]/g, '');
  if (!num) return res.status(400).send({ code: 'Invalid number' });

  const SESSION_PATH = path.join(AUTH_DIR, num);

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

      // Handle connection updates
      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

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
            console.error('Error during upload or message send:', err);
          }
        }

        if (connection === 'close') {
          const reason = new Boom(lastDisconnect?.error)?.output.statusCode;

          switch (reason) {
            case DisconnectReason.restartRequired:
              console.log('🔄 Restarting session...');
              startSession().catch(console.error);
              break;
            case DisconnectReason.timedOut:
              console.log('⏱ Connection timed out, retrying...');
              startSession().catch(console.error);
              break;
            default:
              console.log('❌ Connection closed:', reason);
              await delay(5000);
              exec('pm2 restart your-service-name'); // replace with your PM2 service
          }
        }
      });

      // Request pairing code if not registered
      if (!sock.authState.creds.registered) {
        await delay(1500);
        const code = await sock.requestPairingCode(num);
        if (!res.headersSent) res.send({ code });
      }
    } catch (err) {
      console.error('Session error:', err);
      exec('pm2 restart your-service-name');
      await fs.emptyDir(SESSION_PATH);
      if (!res.headersSent) res.send({ code: 'Try after a few minutes' });
    }
  }

  await startSession();
});

export default router;