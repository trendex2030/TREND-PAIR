const { makeid } = require('./gen-id');
const express = require('express');
const fs = require('fs');
let router = express.Router();
const pino = require("pino");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    Browsers,
    makeCacheableSignalKeyStore,
    jidNormalizedUser
} = require('@whiskeysockets/baileys');

const { upload } = require('./mega');

// Remove folder
function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return;
    fs.rmSync(FilePath, { recursive: true, force: true });
}

router.get('/', async (req, res) => {
    const id = makeid();
    let num = req.query.number;

    async function TREND_X_PAIR() {
        const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);

        try {
            const sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(
                        state.keys,
                        pino({ level: "fatal" }).child({ level: "fatal" })
                    ),
                },
                printQRInTerminal: false,
                generateHighQualityLinkPreview: true,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                syncFullHistory: false,
                browser: Browsers.macOS("Safari")
            });

            // Request pair code
            if (!sock.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');
                const code = await sock.requestPairingCode(num);

                if (!res.headersSent) {
                    return res.send({ code });
                }
            }

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on("connection.update", async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === "open") {
                    console.log("CONNECTED:", sock.user.id);

                    await delay(8000); // Allow WhatsApp to finish login

                    const userJid = jidNormalizedUser(sock.user.id);
                    const credsPath = `${__dirname}/temp/${id}/creds.json`;

                    try {
                        // Upload the creds.json to MEGA
                        const megaUrl = await upload(
                            fs.createReadStream(credsPath),
                            `${userJid}.json`
                        );

                        const session = megaUrl.replace("https://mega.nz/file/", "");
                        const messageText = "trend-x~" + session;

                        // Send session ID
                        const sent = await sock.sendMessage(userJid, { text: messageText });
                        await delay(1500);

                        // Send description
                        const desc = `*Hey there, TREND-X User!* 👋🏻

Your session has been successfully created.

🔐 *Session ID:* Delivered above  
⚠️ *Do NOT share it with anyone!*`;

                        await sock.sendMessage(
                            userJid,
                            {
                                text: desc,
                                contextInfo: {
                                    externalAdReply: {
                                        title: "TREND-X",
                                        thumbnailUrl: "https://files.catbox.moe/adymbp.jpg",
                                        sourceUrl: "https://whatsapp.com/channel/0029Vb6b7ZdF6sn4Vmjf2X1O",
                                        mediaType: 1,
                                        renderLargerThumbnail: true
                                    }
                                }
                            },
                            { quoted: sent }
                        );

                        // Ensure messages deliver before exit
                        await delay(5000);

                        await sock.ws.close();
                        removeFile('./temp/' + id);
                        process.exit();

                    } catch (err) {
                        console.log("SEND ERROR:", err);

                        const userJid = jidNormalizedUser(sock.user.id);
                        await sock.sendMessage(userJid, {
                            text: "❗ ERROR SENDING SESSION:\n" + String(err)
                        });
                    }

                } else if (
                    connection === "close" &&
                    lastDisconnect &&
                    lastDisconnect.error &&
                    lastDisconnect.error.output.statusCode !== 401
                ) {
                    TREND_X_PAIR(); // retry
                }
            });

        } catch (err) {
            console.log("Service Error:", err);
            removeFile('./temp/' + id);
            if (!res.headersSent) res.send({ code: "❗ Service Unavailable" });
        }
    }

    TREND_X_PAIR();
});

module.exports = router;
