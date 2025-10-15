const express = require('express');
const fs = require('fs');
const pino = require('pino');
const { default: makeWASocket, useMultiFileAuthState, delay, Browsers, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const { upload } = require('./mega');
const { makeid } = require('./gen-id');

const router = express.Router();

// Helper to remove temporary folders
function removeFile(FilePath) {
    if (fs.existsSync(FilePath)) {
        fs.rmSync(FilePath, { recursive: true, force: true });
    }
}

router.get('/', async (req, res) => {
    const id = makeid();
    let num = req.query.number;

    // 🔍 Validate phone number
    if (!num) {
        return res.status(400).send({
            error: true,
            message: "❌ Missing number. Use format: /?number=2547XXXXXXXX"
        });
    }
    num = num.replace(/[^0-9]/g, ''); // digits only

    if (num.length < 10) {
        return res.status(400).send({
            error: true,
            message: "❌ Invalid phone number. Must include country code (e.g. 2547XXXXXXXX)"
        });
    }

    async function TREND_X_PAIR_CODE() {
        const { state, saveCreds } = await useMultiFileAuthState(`./temp/${id}`);
        try {
            const sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }))
                },
                printQRInTerminal: false,
                generateHighQualityLinkPreview: true,
                logger: pino({ level: 'fatal' }),
                browser: Browsers.macOS('Safari'),
                syncFullHistory: false
            });

            // Generate pairing code
            if (!sock.authState.creds.registered) {
                console.log(`📱 Requesting pairing code for: ${num}`);
                await delay(1500);
                const code = await sock.requestPairingCode(num);
                console.log(`✅ Pairing code generated: ${code}`);

                if (!res.headersSent) {
                    res.status(200).send({
                        status: 'success',
                        number: num,
                        code,
                        message: `📲 Enter this code in WhatsApp:\n\nLinked Devices → Link a device → "Link with phone number"\n\nThen input: ${code}`
                    });
                }
            }

            // Save session when updated
            sock.ev.on('creds.update', saveCreds);

            // Connection updates
            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === 'open') {
                    console.log(`✅ ${sock.user.id} connected successfully.`);
                    await delay(4000);

                    const rf = `./temp/${id}/creds.json`;
                    if (!fs.existsSync(rf)) return;

                    // Generate and upload session
                    const megaUrl = await upload(fs.createReadStream(rf), `${sock.user.id}.json`);
                    const stringSession = megaUrl.replace('https://mega.nz/file/', '');
                    const sessionId = 'trend-x~' + stringSession;

                    // Send session ID to user
                    await sock.sendMessage(sock.user.id, { text: sessionId });
                    await sock.sendMessage(sock.user.id, {
                        text: `*Hey there, TREND-X User!* 👋🏻\n\nYour session has been successfully created.\n\n🔐 *Session ID:* Sent above\n⚠️ *Keep it safe!* Do NOT share this ID with anyone.\n\n———\n✅ *Stay Updated:*\nhttps://whatsapp.com/channel/0029Vb6b7ZdF6sn4Vmjf2X1O\n———\n💻 *Source Code:*\nhttps://github.com/trendex2030/TREND-X\n———\n> *© Powered by TREND-X King*`
                    });

                    await delay(2000);
                    await sock.ws.close();
                    removeFile(`./temp/${id}`);
                    console.log(`🧹 Cleaned up session folder and exited.`);
                    process.exit();
                }

                if (connection === 'close') {
                    const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
                    if (shouldReconnect) {
                        console.log("🔁 Connection closed, retrying...");
                        await TREND_X_PAIR_CODE();
                    } else {
                        console.log("❌ Logged out or invalid session.");
                        removeFile(`./temp/${id}`);
                    }
                }
            });
        } catch (err) {
            console.error("❗ Pairing service error:", err);
            removeFile(`./temp/${id}`);
            if (!res.headersSent) {
                res.status(500).send({
                    error: true,
                    message: "❗ Service Unavailable. Try again later."
                });
            }
        }
    }

    return await TREND_X_PAIR_CODE();
});

module.exports = router;
