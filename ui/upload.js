import React from 'react';
import ReactDOM from 'react-dom';
import classNames from 'classnames';
import './index.css';

// This is the framerate that the light sequence will run on the raspberry pi.
const FPS = 10;

// Size of the FFT used to compute frequency data.
const FFT_SIZE = 2048;

// Minimum frequency to consider
const MIN_FREQ = 20;

// Maximum frequency to consider
const MAX_FREQ = 15000;

// This is the number of lights that are connected.
const NUM_LIGHTS = 16;

// The number of bytes needed to represent a single frame.
const BYTES_PER_FRAME = Math.ceil(NUM_LIGHTS / 8);

// Number of frames before rotating the channels
const ROTATE_FRAMES = FPS;

// This is the IP address the raspberry pi is running at.
const PI_ADDRESS = 'http://192.168.0.22:3000';

class App extends React.Component {
  constructor() {
    super();
    this.ctx = new (window.AudioContext || window.webkitAudioContext);
    this.state = {
      playing: false,
      lights: Array(NUM_LIGHTS).fill(false)
    };
  }

  onFileChange(e) {
    // Read the selected audio file to an array buffer, and store it.
    let reader = new FileReader();
    reader.onload = async (e) => {
      await this.setupAudio(e.target.result);
    };

    this.filename = e.target.files[0].name;
    reader.readAsArrayBuffer(e.target.files[0])
  }

  async setupAudio(buffer) {
    this.audioData = buffer.slice();
    this.audioBuffer = await this.decodeAudio(buffer);
    this.data = await this.analyze(this.audioBuffer);
  }

  async decodeAudio(buffer) {
    return new Promise((resolve, reject) => {
      this.ctx.decodeAudioData(buffer, resolve, reject);
    });
  }

  async analyze(buffer) {
    // Setup an offline audio context to do the analysis.
    let ctx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, this.audioBuffer.length, this.ctx.sampleRate);
    let source = ctx.createBufferSource();
    source.buffer = this.audioBuffer;

    let analyser = this.setupAnalyser(ctx);
    source.connect(analyser);
    analyser.connect(ctx.destination);

    // Compute the frame interval and total number of frames to generate,
    // and store the frame rate as the first byte of data.
    let interval = (1000 / FPS) / 1000;
    let numFrames = Math.ceil(buffer.duration / interval);
    let data = new Uint8Array((numFrames + 1) * BYTES_PER_FRAME);
    data[0] = FPS;

    // At each interval, suspend the audio context and create a frame of data
    // for the light show sequence to send to the raspberry pi.
    let i = 1;
    let offset = interval;
    let frame = async () => {
      // Get the state of each light for this frame, and pack them into bits.
      let lights = this.updateAnalyser();
      let index = NUM_LIGHTS - 1;
      for (let j = 0; j < BYTES_PER_FRAME; j++) {
        let val = 0;
        for (let i = 7; i >= 0 && index >= 0; i--) {
          val = (val << 1) | (lights[index--] ? 1 : 0);
        }

        data[i++] = val;
      }

      // Resume the audio context and suspend at the next frame offset
      offset += interval;
      let promise = ctx.suspend(offset).then(frame);
      ctx.resume();
      await promise;
    };

    source.start();
    ctx.suspend(offset).then(frame);

    await ctx.startRendering();
    console.log(data);
    return data;
  }

  setupAnalyser(ctx) {
    let analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    let bufferLength = analyser.frequencyBinCount;
    let binSize = ctx.sampleRate / analyser.fftSize;
    let startBin = Math.ceil(MIN_FREQ / binSize);
    let endBin = Math.floor(MAX_FREQ / binSize);
    let bucketSize = Math.ceil((endBin - startBin) / NUM_LIGHTS);
    let dataArray = new Uint8Array(bufferLength);
    let mean = new Float32Array(bufferLength).fill(12);
    let std = new Float32Array(bufferLength).fill(1.5);
    let numSamples = 0;

    this.updateAnalyser = () => {
      analyser.getByteFrequencyData(dataArray);

      // Bucket frequency data from FFT for each light by averaging groups
      let buckets = [];
      let offset = startBin;
      for (let i = 0; i < NUM_LIGHTS; i++) {
        let sum = 0;
        for (let j = 0; j < bucketSize; j++) {
          sum += dataArray[offset + j];
        }

        buckets[i] = sum / bucketSize;
        offset += bucketSize;
      }

      numSamples++;

      // Compute mean and standard deviation for each bucket
      if (numSamples === 1) {
        for (let i = 0; i < NUM_LIGHTS; i++) {
          mean[i] = buckets[i];
          std[i] = 0;
        }
      } else {
        for (let i = 0; i < NUM_LIGHTS; i++) {
          let oldMean = mean[i];
          mean[i] = mean[i] + (buckets[i] - oldMean) / numSamples;
          std[i] = std[i] + (buckets[i] - oldMean) * (buckets[i] - mean[i]);
        }
      }

      let lights = [];
      for (let i = 0; i < NUM_LIGHTS; i++) {
        // Brightness of each light is based on distance from the mean.
        // Since we only support lights that are on or off, we use a threshold.
        let stddev = numSamples > 1 ? Math.sqrt(std[i] / (numSamples - 1)) : 0;
        let brightness = buckets[i] - mean[i] + (stddev * 0.5);
        brightness = (brightness / (stddev * (0.5 + 0.75)));
        lights[i] = brightness >= 0.8;
      }

      return lights;
    };

    return analyser;
  }

  async start() {
    // Play the audio using a live audio context
    this.source = this.ctx.createBufferSource();
    this.source.buffer = this.audioBuffer;
    this.source.connect(this.ctx.destination);
    this.source.start();

    // Simulate the light show on the screen.
    // This allows for easy testing and tweaking without going outside in the
    // freezing cold to watch the light show for real. 😜
    let fps = this.data[0];
    let data = this.data.slice(1);
    let interval = 1000 / fps;
    let lastFrame = -1;
    let startTime = Date.now();
    let LIGHTS = Array(NUM_LIGHTS).fill(0).map((_, i) => i);
    let onFrame = () => {
      // Decide which frame to show based on time
      let frame = Math.round((Date.now() - startTime) / interval);
      if (frame !== lastFrame) {
        lastFrame = frame;
        let idx = frame * BYTES_PER_FRAME;
        if (idx >= data.length) return;

        // Unpack light states from bits
        let lights = [];
        let index = 0;
        for (let j = 0; j < BYTES_PER_FRAME; j++) {
          let val = data[idx + j];
          for (let i = 0; i < 8 && index < NUM_LIGHTS; i++) {
            lights[LIGHTS[index++]] = Boolean((val >>> i) & 1);
          }
        }

        // Rotate the lights every few frames so the frequency channels move around
        if (frame % ROTATE_FRAMES === 0) {
          LIGHTS = [LIGHTS.pop(), ...LIGHTS];
        }    
        
        this.setState({lights});
      }

      this.frame = requestAnimationFrame(onFrame);
    };

    this.frame = requestAnimationFrame(onFrame);
  }

  async stop() {
    this.setState({playing: false});
    this.source.stop();
    cancelAnimationFrame(this.frame);
  }

  async upload() {
    // Upload the audio file and binary light show sequence data to the pi
    await this.uploadFile(this.filename, this.audioData);
    await this.uploadFile(this.filename + '.bin', this.data.buffer);
  }

  async uploadFile(filename, data) {
    console.log(filename, data)
    let res = await fetch(`${PI_ADDRESS}/upload`, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Filename': filename
      },
      method: 'POST',
      body: data
    });
  }

  render() {
    return (
      <React.Fragment>
        <div><input type="file" onChange={(e) => this.onFileChange(e)}></input></div>
        {!this.state.playing 
          ? <button onClick={() => this.start()}>Play</button>
          : <button onClick={() => this.stop()}>Stop</button>
        }
        <button onClick={() => this.upload()}>Upload</button>
        <div>
          {this.state.lights.map((light, i) => 
            <div key={i} className={classNames('light', {on: light})} />
          )}
        </div>
      </React.Fragment>
    );
  }
}

ReactDOM.render(<App />, document.getElementById('root'));
