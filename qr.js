import { exec } from "child_process";
import { upload } from './mega.js';
import express from 'express';
import pino from "pino";
import { toBuffer } from "qrcode";
import fs from "fs-extra";
import { Boom } from "@hapi/boom";
import {
  default as SuhailWASocket,
  useMultiFileAuthState,
  Browsers,
  delay,
  DisconnectReason
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

// Clean auth folder at startup
if (fs.existsSync('./auth_info_baileys')) {
  fs.emptyDirSync('./auth_info_baileys');
}

router.get('/', async (req, res) => {
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

        // Send QR image to client
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

        // When connected successfully
        if (connection === "open") {
          await delay(3000);
          const user = Smd.user.id;

          // Generate random Mega filename
          function randomMegaId(length = 6, numberLength = 4) {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            let result = '';
            for (let i = 0; i < length; i++) {
              result += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            const number = Math.floor(Math.random() * Math.pow(10, numberLength));
            return `${result}${number}`;
          }

          const authPath = './auth_info_baileys/';
          const megaUrl = await upload(fs.createReadStream(authPath + 'creds.json'), `${randomMegaId()}.json`);
          const Scan_Id = megaUrl.replace('https://mega.nz/file/', '');

          console.log(`
====================  SESSION ID  ==========================                   
SESSION-ID ==> ${Scan_Id}
-------------------   SESSION CLOSED   -----------------------
`);

          const msg = await Smd.sendMessage(user, { text: Scan_Id });
          await Smd.sendMessage(user, { text: MESSAGE }, { quoted: msg });
          await delay(1000);
          try { await fs.emptyDirSync('./auth_info_baileys'); } catch (e) {}
        }

        // Save updated creds
        Smd.ev.on('creds.update', saveCreds);

        // Handle disconnection reasons
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
