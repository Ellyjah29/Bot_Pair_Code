import express from 'express';
import fs from 'fs-extra';
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
  DisconnectReason
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

*ULTRA-MD--WHATTSAPP-BOT* 🥀
`;

// Ensure the directory is empty when the app starts
if (fs.existsSync('./auth_info_baileys')) {
  fs.emptyDirSync(new URL('./auth_info_baileys', import.meta.url).pathname);
}

router.get('/', async (req, res) => {
  let num = req.query.number;

  async function SUHAIL() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
    try {
      const Smd = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
        },
        printQRInTerminal: false,
        logger: pino({ level: "fatal" }).child({ level: "fatal" }),
        browser: Browsers.macOS("Safari"),
      });

      if (!Smd.authState.creds.registered) {
        await delay(1500);
        num = num.replace(/[^0-9]/g, '');
        const code = await Smd.requestPairingCode(num);
        if (!res.headersSent) {
          await res.send({ code });
        }
      }

      Smd.ev.on('creds.update', saveCreds);
      Smd.ev.on("connection.update", async (s) => {
        const { connection, lastDisconnect } = s;

        if (connection === "open") {
          try {
            await delay(10000);

            const authPath = './auth_info_baileys/';
            const user = Smd.user.id;

            function randomMegaId(length = 6, numberLength = 4) {
              const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
              let result = '';
              for (let i = 0; i < length; i++) {
                result += characters.charAt(Math.floor(Math.random() * characters.length));
              }
              const number = Math.floor(Math.random() * Math.pow(10, numberLength));
              return `${result}${number}`;
            }

            const mega_url = await upload(fs.createReadStream(authPath + 'creds.json'), `${randomMegaId()}.json`);
            const Scan_Id = mega_url.replace('https://mega.nz/file/', '');

            const msg = await Smd.sendMessage(user, { text: Scan_Id });
            await Smd.sendMessage(user, { text: MESSAGE }, { quoted: msg });
            await delay(1000);

            fs.emptyDirSync('./auth_info_baileys');
          } catch (e) {
            console.log("Error during file upload or message send: ", e);
          }
        }

        if (connection === "close") {
          const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
          switch (reason) {
            case DisconnectReason.connectionClosed:
              console.log("Connection closed!");
              break;
            case DisconnectReason.connectionLost:
              console.log("Connection Lost from Server!");
              break;
            case DisconnectReason.restartRequired:
              console.log("Restart Required, Restarting...");
              SUHAIL().catch(err => console.log(err));
              break;
            case DisconnectReason.timedOut:
              console.log("Connection TimedOut!");
              break;
            default:
              console.log('Connection closed with bot. Restarting...');
              console.log(reason);
              await delay(5000);
              exec('pm2 restart qasim');
          }
        }
      });

    } catch (err) {
      console.log("Error in SUHAIL function: ", err);
      exec('pm2 restart qasim');
      console.log("Service restarted due to error");
      SUHAIL();
      fs.emptyDirSync('./auth_info_baileys');
      if (!res.headersSent) {
        await res.send({ code: "Try After Few Minutes" });
      }
    }
  }

  await SUHAIL();
});

export default router;
