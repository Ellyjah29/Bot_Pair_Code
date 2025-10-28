import { exec } from "child_process";
import { upload } from './mega.js';
import express from 'express';
import pino from "pino";
import { toBuffer } from "qrcode";
import path from 'path';
import fs from "fs-extra";
import { Boom } from "@hapi/boom";
import {
  default as SuhailWASocket,
  useMultiFileAuthState,
  Browsers,
  delay,
  DisconnectReason,
  makeInMemoryStore
} from "@whiskeysockets/baileys";

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

// Ensure auth directory is clean
if (fs.existsSync('./auth_info_baileys')) {
  fs.emptyDirSync('./auth_info_baileys');
}

router.get('/', async (req, res) => {
  const store = makeInMemoryStore({
    logger: pino().child({ level: 'silent', stream: 'store' })
  });

  async function SUHAIL() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');

    try {
      const Smd = SuhailWASocket({
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        browser: Browsers.macOS("Desktop"),
        auth: state
      });

      Smd.ev.on("connection.update", async (s) => {
        const { connection, lastDisconnect, qr } = s;

        // Send QR Code
        if (qr && !res.headersSent) {
          try {
            const qrBuffer = await toBuffer(qr);
            res.setHeader('Content-Type', 'image/png');
            res.end(qrBuffer);
            return;
          } catch (error) {
            console.error("Error generating QR Code buffer:", error);
            return;
          }
        }

        // Connection opened
        if (connection === "open") {
          await delay(3000);
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

          const auth_path = './auth_info_baileys/';
          const mega_url = await upload(fs.createReadStream(auth_path + 'creds.json'), `${randomMegaId()}.json`);
          const Scan_Id = mega_url.replace('https://mega.nz/file/', '');

          console.log(`
====================  SESSION ID  ==========================                   
SESSION-ID ==> ${Scan_Id}
-------------------   SESSION CLOSED   -----------------------
`);

          const msgsss = await Smd.sendMessage(user, { text: Scan_Id });
          await Smd.sendMessage(user, { text: MESSAGE }, { quoted: msgsss });
          await delay(1000);
          try {
            await fs.emptyDirSync('./auth_info_baileys');
          } catch (e) { }
        }

        // Save credentials
        Smd.ev.on('creds.update', saveCreds);

        // Handle disconnections
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
              console.log('Connection closed with bot. Please run again.');
              console.log(reason);
              await delay(5000);
              exec('pm2 restart qasim');
              process.exit(0);
          }
        }
      });

    } catch (err) {
      console.log("Error in SUHAIL function:", err);
      exec('pm2 restart qasim');
      await fs.emptyDirSync('./auth_info_baileys');
    }
  }

  await SUHAIL().catch(async (err) => {
    console.log(err);
    await fs.emptyDirSync('./auth_info_baileys');
    exec('pm2 restart qasim');
  });
});

export default router;
