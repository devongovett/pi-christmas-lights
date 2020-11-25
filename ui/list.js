import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';

// This is the IP address the raspberry pi is running at.
const PI_ADDRESS = 'http://pi.local';

class App extends React.Component {
  constructor() {
    super();
    this.ctx = new (window.AudioContext || window.webkitAudioContext);
    this.state = {
      list: [],
      playing: null
    };
  }

  async componentDidMount() {
    let res = await this.getList();
    this.setState({list: res.files});
  }

  async getList() {
    // Get a list of available songs from the pi.
    let res = await fetch(`${PI_ADDRESS}/list`);
    return res.json();
  }

  async downloadFile(filename) {
    // Download an audio file from the pi.
    let res = await fetch(`${PI_ADDRESS}/audio/${filename}`);
    return res.arrayBuffer();
  }

  async decodeAudio(ctx, buffer) {
    return new Promise((resolve, reject) => {
      ctx.decodeAudioData(buffer, resolve, reject);
    });
  }

  onClick(song) {
    if (this.state.playing === song) {
      this.stop()
    } else {
      this.ctx.resume();
      this.start(song);
    }
  }

  async start(filename) {
    // Stop the existing source if already playing another song
    if (this.source) {
      this.source.stop();
    }

    this.setState({playing: filename});
    
    // First, download the audio file from the pi and decode it.
    let buffer = await this.downloadFile(filename);
    let audioBuffer = await this.decodeAudio(this.ctx, buffer);

    // Setup an audio source with the web audio API.
    this.source = this.ctx.createBufferSource();
    this.source.buffer = audioBuffer;
    this.source.connect(this.ctx.destination);

    // Tell the pi to play the light sequence.
    // It will reply with the unix timestamp at which to start playing the audio.
    // This accounts for network latency (assuming clocks are synced).
    let res = await fetch(`${PI_ADDRESS}/play/${filename}`);
    let json = await res.json();
    let startTime = json.startTime;
    let wait = startTime - Date.now();

    // Start the audio after the delay
    this.source.start(wait / 1000);
  }

  async stop() {
    // Stop playing audio and update UI state.
    this.setState({playing: null});
    this.source.stop();
    this.source = null;

    // Tell the pi to stop the light sequence.
    await fetch(`${PI_ADDRESS}/stop`, {method: 'POST'});
  }

  render() {
    return (
      <ul>
        {this.state.list.map(song => 
          <li onClick={() => this.onClick(song)}>
            {this.state.playing === song ? '⏹' : '▶️'} {song}
          </li>
        )}
      </ul>
    );
  }
}

ReactDOM.render(<App />, document.getElementById('root'));
