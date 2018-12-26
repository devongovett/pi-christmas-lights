const express = require('express');
const rpio = require('rpio');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// Configuration for light channels.
// This uses physical raspberry pi pin numbers, not GPIO numbers.
let LIGHTS = [
  {pin: 11, on: null}, // Candy Canes Bottom
  {pin: 12, on: null}, // Candy Canes Top
  {pin: 13, on: null}, // Icicles Right
  {pin: 15, on: null}, // Icicles Left
  {pin: 16, on: null}, // Icicles Garage
  {pin: 18, on: null}, // Stairs
  {pin: 22, on: null}, // Handrails
  {pin: 29, on: null}  // Tree
];

// Number of frames before rotating the channels
const ROTATE_FRAMES = 5;

// Initialize the pins for each light
for (let light of LIGHTS) {
  rpio.open(light.pin, rpio.OUTPUT);
}

let app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.raw({limit: '100mb'}));

// Play the provided light data
app.post('/play', async (req, res) => {
  let data = req.body;
  console.log(data);

  await stop();

  // Delay for 1 second to allow the music to start on the remote device.
  // Send the time the lights will start to the client so it can sync.
  let startTime = Date.now() + 1000;
  res.send({startTime});

  // rpio.msleep(Date.now() - startTime);
  await sleep(Date.now() - startTime);
  await start(data);
});

// Stop playing
app.post('/stop', async (req, res) => {
  await stop();
  res.sendStatus(200);
});

// Upload a file (either audio or light sequence data)
app.post('/upload', async (req, res) => {
  let data = req.body;
  let filename = req.header('X-Filename');

  fs.writeFileSync(path.join(__dirname, '..', 'audio', filename), data);
  res.send({success: true});
});

// List available audio files
app.get('/list', async (req, res) => {
  let files = fs.readdirSync(path.join(__dirname, '..', 'audio')).filter(file => !file.endsWith('.bin'));
  res.send({files});
});

// Get audio data
app.get('/audio/:filename', async (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'audio', req.params.filename));
});

// Play the light sequence for a specific file
app.get('/play/:filename', async (req, res) => {
  let data = fs.readFileSync(path.join(__dirname, '..', 'audio', req.params.filename + '.bin'));
  await stop();

  // Delay for 1 second to allow the music to start on the remote device.
  // Send the time the lights will start to the client so it can sync.
  let startTime = Date.now() + 1000;
  res.send({startTime});

  // rpio.msleep(Date.now() - startTime);
  await sleep(Date.now() - startTime);
  await start(data);
});

// Serve static files for the UI
app.use(express.static('dist'));

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function play(data) {
  // Read framerate from data
  let fps = data[0];
  let frameInterval = Math.floor(1000 / fps);

  let frameIndex = 0;
  for (let frame of data.slice(1)) {
    if (!playing) {
      break;
    }

    let frameStart = Date.now();

    // Light status for a frame is packed into bits
    for (let i = 0; i < LIGHTS.length; i++) {
      let light = LIGHTS[i];
      let on = Boolean((frame >>> i) & 1);
      if (light.on === on) {
        continue;
      }

      rpio.write(light.pin, on ? rpio.HIGH : rpio.LOW);
      light.on = on;
    }

    // Rotate the lights every few frames so the frequency channels move around
    if (frameIndex % ROTATE_FRAMES === 0) {
      LIGHTS = [LIGHTS.pop(), ...LIGHTS];
    }

    frameIndex++;
    
    // Compute the time it took to process this frame, and sleep for the remaining frame duration
    let writeTime = Date.now() - frameStart;
    await sleep(frameInterval - writeTime);
  }
}

let playing = false;
let playPromise = null;

function start(data) {
  // If already playing, queue up the next song.
  // Otherwise, play immediately
  if (playPromise) {
    playPromise = playPromise.then(() => play(data));
  } else {
    playing = true;
    playPromise = play(data);
  }

  return playPromise;
}

function stop() {
  if (!playing) {
    return;
  }

  playing = false;
  return playPromise.then(() => {
    playPromise = null;
  });
}

app.listen(3000);
