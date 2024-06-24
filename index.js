const fs = require('fs');
const ytdl = require('ytdl-core');
const express = require('express');
const dropboxV2Api = require('dropbox-v2-api');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = 3000;

const dropbox = dropboxV2Api.authenticate({
    token: process.env.DROPBOX_TOKEN
});

// Function to upload a file to Dropbox and get a shared link
function uploadFileToDropboxAndGetLink(localFilePath, dropboxFilePath, title, res) {
    const dropboxUploadStream = dropbox({
        resource: 'files/upload',
        parameters: {
            path: dropboxFilePath
        }
    }, (err, result, response) => {
        if (err) {
            console.error('Error uploading file:', err);
            res.status(500).json({ error: 'Error uploading file' });
            return;
        }
        console.log('File uploaded successfully:', result);
        createSharedLink(dropboxFilePath, title, res);

        fs.unlink(localFilePath, (err) => {
            if (err) {
                console.error('Error deleting local file:', err);
            } else {
                console.log('Local file deleted successfully:', localFilePath);
            }
        });
    });

    fs.createReadStream(localFilePath).pipe(dropboxUploadStream);
}

// Function to create a shared link for the uploaded file
function createSharedLink(dropboxFilePath, title, res) {
    dropbox({
        resource: 'sharing/create_shared_link_with_settings',
        parameters: {
            path: dropboxFilePath
        }
    }, (err, result, response) => {
        if (err) {
            if (err.error && err.error.error && err.error.error['.tag'] === 'shared_link_already_exists') {
                console.log('Shared link already exists:', err.error.error.shared_link_already_exists.metadata.url);
                res.json({ uploaded: { Sharelink: err.error.error.shared_link_already_exists.metadata.url, title: title } });
            } else {
                console.error('Error creating shared link:', err);
                res.status(500).json({ error: 'Error creating shared link' });
            }
            return;
        }
        console.log('Shared link created successfully:', result.url);
        res.json({ uploaded: { Sharelink: result.url, title: title } });
    });
}

// Function to download YouTube video as MP3
function downloadYouTubeMP3(link, callback, res) {
    ytdl.getInfo(link).then(info => {
        const title = info.videoDetails.title;
        const sanitizedTitle = title.replace(/ /g, '-');
        const outputFilePath = `${sanitizedTitle}.mp3`;

        const stream = ytdl(link, { filter: 'audioonly' })
            .pipe(fs.createWriteStream(outputFilePath));

        stream.on('finish', () => {
            console.log('Downloaded YouTube MP3 successfully:', outputFilePath);
            callback(outputFilePath, `/${outputFilePath}`, title, res);
        });

        stream.on('error', (err) => {
            console.error('Error downloading YouTube MP3:', err);
            res.status(500).json({ error: 'Error downloading YouTube MP3' });
        });
    }).catch(err => {
        console.error('Error getting YouTube info:', err);
        res.status(500).json({ error: 'Error getting YouTube info' });
    });
}

// Express route to handle upload
app.get('/upload', (req, res) => {
    const youtubeLink = req.query.url;
    if (!youtubeLink) {
        return res.status(400).json({ error: 'No YouTube URL provided' });
    }
    downloadYouTubeMP3(youtubeLink, uploadFileToDropboxAndGetLink, res);
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
