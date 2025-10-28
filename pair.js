import express from 'express';
import fs from 'fs-extra';
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
SESSION GENERATED SUCCESSFULLY ✅

Gɪᴠᴇ ᴀ ꜱᴛᴀʀ ᴛᴏ ʀᴇᴘᴏ ꜰᴏʀ ᴄᴏᴜʀᴀɢᴇ 🌟
https://github.com/GuhailTechInfo/ULTRA-MD

Sᴜᴘᴘᴏʀᴛ Gʀᴏᴜᴘ ꜰᴏʀ ϙᴜᴇʀʏ 💭
https://t.me/GlobalBotInc
https://whatsapp.com/channel/0029VagJIAr3bbVBCpEkAM07

Yᴏᴜ-ᴛᴜʙᴇ ᴛᴜᴛᴏʀɪᴀʟꜱ 🪄
https://youtube.com/GlobalTechInfo

ULTRA-MD--WHATTSAPP-BOT 🥀
`;

// Ensure auth directory is empty at start
const AUTH_PATH = './auth_info_baileys';
if (fs.existsSync(AUTH_PATH)) fs.emptyDirSync(AUTH_PATH);

// Helper: generate random Mega ID
function randomMegaId(length = 6, numberLength = 4) {
const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
let result = '';
for (let i = 0; i < length; i++) {
result += characters.charAt(Math.floor(Math.random() * characters.length));
}
const number = Math.floor(Math.random() * Math.pow(10, numberLength));
return ${result}${number};
}

router.get('/', async (req, res) => {
let num = req.query.number;
if (!num) return res.status(400).send({ code: "Missing number parameter" });

// Clean phone number
num = num.replace(/[^0-9]/g, '');
if (!num) return res.status(400).send({ code: "Invalid number" });

async function initiateSession() {
const { state, saveCreds } = await useMultiFileAuthState(AUTH_PATH);

const Smd = makeWASocket({  
  auth: {  
    creds: state.creds,  
    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),  
  },  
  printQRInTerminal: false,  
  logger: pino({ level: "fatal" }).child({ level: "fatal" }),  
  browser: Browsers.macOS('Safari'),  
});  

Smd.ev.on('creds.update', saveCreds);  

// Handle connection updates  
Smd.ev.on('connection.update', async (update) => {  
  const { connection, lastDisconnect } = update;  

  if (connection === 'open') {  
    console.log("✅ WhatsApp connection opened!");  

    try {  
      // Wait to ensure creds.json is written  
      await delay(5000);  
      const credsFile = AUTH_PATH + '/creds.json';  
      if (!fs.existsSync(credsFile)) throw new Error("creds.json not found");  

      // Upload to Mega  
      const mega_url = await upload(fs.createReadStream(credsFile), `${randomMegaId()}.json`);  
      const Scan_Id = mega_url.replace('https://mega.nz/file/', '');  

      // Send Mega ID and follow-up message to user  
      const userJid = jidNormalizedUser(num + '@s.whatsapp.net');  
      const msg = await Smd.sendMessage(userJid, { text: Scan_Id });  
      await Smd.sendMessage(userJid, { text: MESSAGE }, { quoted: msg });  

      console.log("📤 Mega ID and welcome message sent successfully");  

      // Clean up session folder  
      await delay(1000);  
      await fs.emptyDir(AUTH_PATH);  
      console.log("🧹 Session folder cleaned up");  

    } catch (e) {  
      console.error("❌ Error during file upload or message send:", e);  
    }  
  }  

  if (connection === 'close') {  
    const reason = new Boom(lastDisconnect?.error)?.output.statusCode;  
    switch (reason) {  
      case DisconnectReason.restartRequired:  
        console.log("🔄 Restart required, restarting session...");  
        initiateSession().catch(console.error);  
        break;  
      case DisconnectReason.timedOut:  
        console.log("⏱ Connection timed out, restarting...");  
        initiateSession().catch(console.error);  
        break;  
      default:  
        console.log("❌ Connection closed:", reason);  
        break;  
    }  
  }  
});  

// Request pairing code if user not registered  
if (!Smd.authState.creds.registered) {  
  await delay(1500);  
  try {  
    const code = await Smd.requestPairingCode(num);  
    if (!res.headersSent) await res.send({ code });  
    console.log("🔑 Pairing code sent to user:", code);  
  } catch (e) {  
    console.error("❌ Error requesting pairing code:", e);  
    if (!res.headersSent) await res.status(503).send({ code: "Failed to get pairing code" });  
  }  
}

}

await initiateSession();
});

export default router;
