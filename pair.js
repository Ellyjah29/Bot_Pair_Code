import express from 'express';
import fs from 'fs';
import pino from 'pino';
import { makeWASocket, useMultiFileAuthState, delay, makeCacheableSignalKeyStore, Browsers, jidNormalizedUser, fetchLatestBaileysVersion } from 'baileys';
import pn from 'awesome-phonenumber';

// 👇 Import your mega.js upload function
import { upload } from './mega.js';

const router = express.Router();

// Function to remove files or directories
function removeFile(FilePath) {
    try {
        if (!fs.existsSync(FilePath)) return false;
        fs.rmSync(FilePath, { recursive: true, force: true });
        return true;
    } catch (e) {
        console.error('Error removing file:', e);
        return false;
    }
}

router.get('/', async (req, res) => {
    let num = req.query.number;
    let dirs = './' + (num || `session`);

    // Remove existing session if present
    await removeFile(dirs);

    // Clean the phone number - remove any non-digit characters
    num = num.replace(/[^0-9]/g, '');

    // Validate the phone number using awesome-phonenumber
    const phone = pn('+' + num);
    if (!phone.isValid()) {
        if (!res.headersSent) {
            return res.status(400).send({ code: 'Invalid phone number. Please enter your full international number (e.g., 2349022334455 for Nigeria, 15551234567 for US, 447911123456 for UK, etc.) without + or spaces.' });
        }
        return;
    }
    // Use the international number format (E.234, without '+')
    num = phone.getNumber('e164').replace('+', '');

    async function initiateSession() {
        const { state, saveCreds } = await useMultiFileAuthState(dirs);

        try {
            const { version, isLatest } = await fetchLatestBaileysVersion();
            let KnightBot = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: Browsers.windows('Chrome'),
                markOnlineOnConnect: false,
                generateHighQualityLinkPreview: false,
                defaultQueryTimeoutMs: 60000,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
                retryRequestDelayMs: 250,
                maxRetries: 5,
            });

            KnightBot.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, isNewLogin, isOnline } = update;

                if (connection === 'open') {
                    console.log("✅ Connected successfully!");
                    console.log("📤 Uploading creds.json to Mega...");

                    try {
                        const sessionKnight = fs.readFileSync(dirs + '/creds.json');

                        // 🔓 NO ENCRYPTION — upload as-is
                        const megaUrl = await upload(sessionKnight, 'creds.json');
                        console.log('🔗 Mega URL generated:', megaUrl);

                        // Extract just the file ID + key (remove https://mega.nz/file/)
                        const sessionId = megaUrl.split('/file/')[1]; // e.g., "CRojAZKT#16tZq5iEEPVEPeKkHmQoJ4Ds3kasJ-1qVLQDwTuFKEU"

                        // ✅ Send Session ID ALONE — NO EXTRA TEXT, JUST THE RAW ID
                        const userJid = jidNormalizedUser(num + '@s.whatsapp.net');
                        await KnightBot.sendMessage(userJid, {
                            text: sessionId
                        });
                        console.log("✅ Session ID sent alone (raw) for easy copy-paste");

                        // ✅ Send YouTube tutorial with image preview
                        await KnightBot.sendMessage(userJid, {
                            image: { url: 'https://i.ytimg.com/vi/t2R0RwF6jyY/hq2.jpg?sqp=-oaymwFBCOADEI4CSFryq4qpAzMIARUAAIhCGADYAQHiAQoIGBACGAY4AUAB8AEB-AHuAoACkAWKAgwIABABGA8gZShUMA8=&rs=AOn4CLBAV4HZoA4kvuQinQcCBQfN-FAVzg' },
                            caption: `🎬 *SEPTORCH BOT V1.9 Full Setup Guide!*  
🚀 Bug Fixes + New Commands + Fast AI Chat  
📺 Watch Now: https://www.youtube.com/shorts/t2R0RwF6jyY`
                        });
                        console.log("🎬 YouTube tutorial with preview sent successfully");

                        // ✅ Send socials and warning
                        await KnightBot.sendMessage(userJid, {
                            text: `📲 Follow us for updates:
Instagram: https://www.instagram.com/septorch29/
Twitter (X): https://twitter.com/septorch29
YouTube: https://www.youtube.com/channel/UCHMm8kXPLiwOkeD5MMaAcig
WhatsApp Channel: https://whatsapp.com/channel/0029Vb1ydGk8qIzkvps0nZ04

⚠️ *Please send the above Session ID to the Telegram bot* ⚠️\n 
┌┤✑  Thanks for choosing Septorch Bot
│└────────────┈ ⳹        
│©2025 Septorch
└─────────────────┈ ⳹\n\n`
                        });
                        console.log("📌 Socials and warning sent successfully");

                        // Clean up session after use
                        console.log("🧹 Cleaning up session...");
                        await delay(1000);
                        removeFile(dirs);
                        console.log("✅ Session cleaned up successfully");
                        console.log("🎉 Process completed successfully!");

                    } catch (error) {
                        console.error("❌ Error during upload or sending:", error);
                        // Still clean up session even if sending fails
                        removeFile(dirs);
                    }

                }

                if (isNewLogin) {
                    console.log("🔐 New login via pair code");
                }

                if (isOnline) {
                    console.log("📶 Client is online");
                }

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;

                    if (statusCode === 401) {
                        console.log("❌ Logged out from WhatsApp. Need to generate new pair code.");
                    } else {
                        console.log("🔁 Connection closed — restarting...");
                        initiateSession();
                    }
                }
            });

            if (!KnightBot.authState.creds.registered) {
                await delay(3000); // Wait 3 seconds before requesting pairing code
                num = num.replace(/[^\d+]/g, '');
                if (num.startsWith('+')) num = num.substring(1);

                try {
                    let code = await KnightBot.requestPairingCode(num);
                    code = code?.match(/.{1,4}/g)?.join('-') || code;
                    if (!res.headersSent) {
                        console.log({ num, code });
                        await res.send({ code });
                    }
                } catch (error) {
                    console.error('Error requesting pairing code:', error);
                    if (!res.headersSent) {
                        res.status(503).send({ code: 'Failed to get pairing code. Please check your phone number and try again.' });
                    }
                }
            }

            KnightBot.ev.on('creds.update', saveCreds);
        } catch (err) {
            console.error('Error initializing session:', err);
            if (!res.headersSent) {
                res.status(503).send({ code: 'Service Unavailable' });
            }
        }
    }

    await initiateSession();
});

// Global uncaught exception handler
process.on('uncaughtException', (err) => {
    let e = String(err);
    if (e.includes("conflict")) return;
    if (e.includes("not-authorized")) return;
    if (e.includes("Socket connection timeout")) return;
    if (e.includes("rate-overlimit")) return;
    if (e.includes("Connection Closed")) return;
    if (e.includes("Timed Out")) return;
    if (e.includes("Value not found")) return;
    if (e.includes("Stream Errored")) return;
    if (e.includes("Stream Errored (restart required)")) return;
    if (e.includes("statusCode: 515")) return;
    if (e.includes("statusCode: 503")) return;
    console.log('Caught exception: ', err);
});

export default router;
