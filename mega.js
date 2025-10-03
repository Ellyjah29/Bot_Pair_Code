import * as mega from 'megajs';
import { Readable } from 'stream';

// 🔐 HARD CODED MEGA CREDENTIALS (DO NOT SHARE THIS FILE!)
const auth = {
    email: 'jakejasons580@gmail.com',   // 👈 YOUR EMAIL
    password: 'Septorch111$$',          // 👈 YOUR PASSWORD
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.135 Safari/537.36 Edge/12.246'
};

console.log('🔐 Using hardcoded Mega credentials:');
console.log('Email:', auth.email);
console.log('Password length:', auth.password.length);

// Function to upload a file to Mega and return the URL
export const upload = (data, name) => {
    return new Promise((resolve, reject) => {
        try {
            // Authenticate with Mega storage
            const storage = new mega.Storage(auth, (loginErr) => {
                if (loginErr) {
                    console.error('❌ Mega Login Failed:', loginErr);
                    reject(loginErr);
                    return;
                }

                console.log('✅ Mega Login Successful!');

                // Upload the data (Buffer or Stream) to Mega
                const uploadStream = storage.upload({ name: name, allowUploadBuffering: true });

                // ✅ Convert Buffer to Readable Stream if needed
                let readable;
                if (Buffer.isBuffer(data)) {
                    readable = Readable.from([data]);
                } else if (typeof data.pipe === 'function') {
                    readable = data;
                } else {
                    reject(new Error('Data must be a Buffer or ReadableStream'));
                    return;
                }

                // Pipe the data into Mega
                readable.pipe(uploadStream);

                // When the file is successfully uploaded, resolve with the file's URL
                storage.on("add", (file) => {
                    file.link((err, url) => {
                        if (err) {
                            reject(err); // Reject if there's an error getting the link
                        } else {
                            storage.close(); // Close the storage session once the file is uploaded
                            resolve(url); // Return the file's link
                        }
                    });
                });

                // Handle errors during file upload process
                storage.on("error", (error) => {
                    reject(error);
                });
            });
        } catch (err) {
            reject(err); // Reject if any error occurs during the upload process
        }
    });
};

// Function to download a file from Mega using a URL
export const download = (url) => {
    return new Promise((resolve, reject) => {
        try {
            // Get file from Mega using the URL
            const file = mega.File.fromURL(url);

            file.loadAttributes((err) => {
                if (err) {
                    reject(err);
                    return;
                }

                // Download the file buffer
                file.downloadBuffer((err, buffer) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(buffer); // Return the file buffer
                    }
                });
            });
        } catch (err) {
            reject(err);
        }
    });
};
