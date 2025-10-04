import express from 'express';
import fs from 'fs';
import pino from 'pino';
import { makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, Browsers, jidNormalizedUser, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { delay } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';

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
    // Generate unique session for each request to avoid conflicts
    const sessionId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const dirs = `./qr_sessions/session_${sessionId}`;

    // Ensure qr_sessions directory exists
    if (!fs.existsSync('./qr_sessions')) {
        fs.mkdirSync('./qr_sessions', { recursive: true });
    }

    async function initiateSession() {
        // ✅ PERMANENT FIX: Create the session folder before anything
        if (!fs.existsSync(dirs)) fs.mkdirSync(dirs, { recursive: true });

        const { state, saveCreds } = await useMultiFileAuthState(dirs);

        try {
            const { version, isLatest } = await fetchLatestBaileysVersion();
            
            let qrGenerated = false;
            let responseSent = false;

            // QR Code handling logic
            const handleQRCode = async (qr) => {
                if (qrGenerated || responseSent) return;
                
                qrGenerated = true;
                console.log('🟢 QR Code Generated! Scan it with your WhatsApp app.');
                console.log('📋 Instructions:');
                console.log('1. Open WhatsApp on your phone');
                console.log('2. Go to Settings > Linked Devices');
                console.log('3. Tap "Link a Device"');
                console.log('4. Scan the QR code below');
                // Display QR in terminal
                //qrcodeTerminal.generate(qr, { small: true });
                try {
                    // Generate QR code as data URL
                    const qrDataURL = await QRCode.toDataURL(qr, {
                        errorCorrectionLevel: 'M',
                        type: 'image/png',
                        quality: 0.92,
                        margin: 1,
                        color: {
                            dark: '#000000',
                            light: '#FFFFFF'
                        }
                    });

                    if (!responseSent) {
                        responseSent = true;
                        console.log('QR Code generated successfully');
                        await res.send({ 
                            qr: qrDataURL, 
                            message: 'QR Code Generated! Scan it with your WhatsApp app.',
                            instructions: [
                                '1. Open WhatsApp on your phone',
                                '2. Go to Settings > Linked Devices',
                                '3. Tap "Link a Device"',
                                '4. Scan the QR code above'
                            ]
                        });
                    }
                } catch (qrError) {
                    console.error('Error generating QR code:', qrError);
                    if (!responseSent) {
                        responseSent = true;
                        res.status(500).send({ code: 'Failed to generate QR code' });
                    }
                }
            };

            // Improved Baileys socket configuration
            const socketConfig = {
                version,
                logger: pino({ level: 'silent' }),
                browser: Browsers.windows('Chrome'),
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                markOnlineOnConnect: false,
                generateHighQualityLinkPreview: false,
                defaultQueryTimeoutMs: 60000,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
                retryRequestDelayMs: 250,
                maxRetries: 5,
            };

            // Create socket and bind events
            let sock = makeWASocket(socketConfig);
            let reconnectAttempts = 0;
            const maxReconnectAttempts = 3;

            // Connection event handler function
            const handleConnectionUpdate = async (update) => {
                const { connection, lastDisconnect, qr } = update;
                console.log(`🔄 Connection update: ${connection || 'undefined'}`);

                if (qr && !qrGenerated) {
                    await handleQRCode(qr);
                }

                if (connection === 'open') {
                    console.log('✅ Connected successfully!');
                    console.log('💾 Session saved to:', dirs);
                    reconnectAttempts = 0; // Reset reconnect attempts on successful connection
                    
                    // Read the session file
                    const sessionKnight = fs.readFileSync(dirs + '/creds.json');
                    
                    // Get the user's JID from the session
                    const userJid = Object.keys(sock.authState.creds.me || {}).length > 0 
                        ? jidNormalizedUser(sock.authState.creds.me.id) 
                        : null;
                        
                    if (userJid) {
                        try {
                            console.log('📤 Uploading creds.json to Mega...');
                            
                            // 🔓 NO ENCRYPTION — upload as-is
                            const megaUrl = await upload(sessionKnight, 'creds.json');
                            
                            console.log('🔗 Mega URL generated:', megaUrl);
                            
                            // Extract just the file ID + key (remove https://mega.nz/file/)
                            const megaFileIdKey = megaUrl.split('/file/')[1]; // e.g., "CRojAZKT#16tZq5iEEPVEPeKkHmQoJ4Ds3kasJ-1qVLQDwTuFKEU"

                            // Send Mega ID+Key as clean, copy-paste friendly text
                            let messageText = `📌 *Your Session File ID & Key*  
\`\`\`
${megaFileIdKey}
\`\`\`

⚠️ *Send this exact text to the Telegram bot to complete setup.*

---

🎬 *Watch Our Setup Guide:*  
👉 https://www.youtube.com/shorts/t2R0RwF6jyY

---

📲 Follow us for updates:
Instagram: https://www.instagram.com/septorch29/
Twitter (X): https://twitter.com/septorch29
YouTube: https://www.youtube.com/channel/UCHMm8kXPLiwOkeD5MMaAcig
WhatsApp Channel: https://whatsapp.com/channel/0029Vb1ydGk8qIzkvps0nZ04
`;

                            await sock.sendMessage(userJid, {
                                text: messageText
                            });

                            console.log("✅ Mega ID+Key sent successfully to", userJid);

                            // Send YouTube tutorial with image preview
                            await sock.sendMessage(userJid, {
                                image: { url: 'https://i.ytimg.com/vi/t2R0RwF6jyY/hq2.jpg?sqp=-oaymwFBCOADEI4CSFryq4qpAzMIARUAAIhCGADYAQHiAQoIGBACGAY4AUAB8AEB-AHuAoACkAWKAgwIABABGA8gZShUMA8=&rs=AOn4CLBAV4HZoA4kvuQinQcCBQfN-FAVzg' },
                                caption: `🎬 *SEPTORCH BOT V1.9 Full Setup Guide!*  
🚀 Bug Fixes + New Commands + Fast AI Chat  
📺 Watch Now: https://www.youtube.com/shorts/t2R0RwF6jyY`
                            });
                            console.log("🎬 YouTube tutorial with preview sent successfully");

                            // Send warning message
                            await sock.sendMessage(userJid, {
                                text: `⚠️ *Please send the above Mega ID & Key to the Telegram bot* ⚠️\n 
┌┤✑  Thanks for choosing Septorch Bot
│└────────────┈ ⳹        
│©2025 Septorch
└─────────────────┈ ⳹\n\n`
                            });

                            // ✅ IMMEDIATE CLEANUP — delete session folder right after sending messages
                            setTimeout(() => {
                                console.log('🧹 Cleaning up session immediately...');
                                const deleted = removeFile(dirs);
                                if (deleted) {
                                    console.log('✅ Session cleaned up successfully');
                                } else {
                                    console.log('❌ Failed to clean up session folder');
                                }
                            }, 0); // 👈 Zero delay — runs after event loop

                        } catch (uploadError) {
                            console.error("❌ Failed to upload to Mega:", uploadError);
                            
                            // Fallback: send error message via WhatsApp
                            await sock.sendMessage(userJid, {
                                text: `❌ Failed to upload session file to Mega.\n\nPlease try again later or contact support.\n\nError: ${uploadError.message}`
                            });

                            // Clean up even on failure
                            setTimeout(() => {
                                console.log('🧹 Cleaning up session after error...');
                                removeFile(dirs);
                            }, 0);
                        }
                    } else {
                        console.log("❌ Could not determine user JID to send Mega link");
                        // Clean up if no JID
                        setTimeout(() => {
                            removeFile(dirs);
                        }, 0);
                    }
                }

                if (connection === 'close') {
                    console.log('❌ Connection closed');
                    if (lastDisconnect?.error) {
                        console.log('❗ Last Disconnect Error:', lastDisconnect.error);
                    }
                    
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    
                    // Handle specific error codes
                    if (statusCode === 401) {
                        console.log('🔐 Logged out - need new QR code');
                        removeFile(dirs);
                    } else if (statusCode === 515 || statusCode === 503) {
                        console.log(`🔄 Stream error (${statusCode}) - attempting to reconnect...`);
                        reconnectAttempts++;
                        
                        if (reconnectAttempts <= maxReconnectAttempts) {
                            console.log(`🔄 Reconnect attempt ${reconnectAttempts}/${maxReconnectAttempts}`);
                            // Wait a bit before reconnecting
                            setTimeout(() => {
                                try {
                                    sock = makeWASocket(socketConfig);
                                    sock.ev.on('connection.update', handleConnectionUpdate);
                                    sock.ev.on('creds.update', saveCreds);
                                } catch (err) {
                                    console.error('Failed to reconnect:', err);
                                }
                            }, 2000);
                        } else {
                            console.log('❌ Max reconnect attempts reached');
                            if (!responseSent) {
                                responseSent = true;
                                res.status(503).send({ code: 'Connection failed after multiple attempts' });
                            }
                        }
                    } else if (statusCode === 440) {
                        console.log('🛑 Stream Errored (conflict) — logging out all devices...');
                        // Force logout by deleting session
                        removeFile(dirs);
                        if (!responseSent) {
                            responseSent = true;
                            res.status(503).send({ code: 'Conflict detected — please log out all other devices and try again.' });
                        }
                    } else {
                        console.log('🔄 Connection lost - attempting to reconnect...');
                        // Let it reconnect automatically
                    }
                }
            };

            // Bind the event handler
            sock.ev.on('connection.update', handleConnectionUpdate);

            sock.ev.on('creds.update', saveCreds);

            // Set a timeout to clean up if no QR is generated
            setTimeout(() => {
                if (!responseSent) {
                    responseSent = true;
                    res.status(408).send({ code: 'QR generation timeout' });
                    removeFile(dirs);
                }
            }, 30000); // 30 second timeout

        } catch (err) {
            console.error('Error initializing session:', err);
            if (!res.headersSent) {
                res.status(503).send({ code: 'Service Unavailable' });
            }
            removeFile(dirs);
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
