# 🎄💡 pi-christmas-lights 🎄💡

This is the software for a project I built with my brother to sync our Christmas lights to music
using a Raspberry Pi and the Web Audio API.

**[Watch the video!](https://twitter.com/devongovett/status/1077725421356101633)**

![](https://media.giphy.com/media/3iBttTVcWRd7Ym5X4M/giphy.gif)

## Hardware

The hardware uses a Raspberry Pi, 8 relays, some standard electrical outlets, and a bunch of wiring,
all connected together in a wooden box under our front deck.

<img src="https://pbs.twimg.com/media/Du-ZBB9XcAAyuk4.jpg:large" width="400">
<img src="https://pbs.twimg.com/media/Du_0kl-W0AASkga.jpg" width="400">

Parts list:

* [Raspberry Pi](https://www.raspberrypi.org)
* [Relay](https://www.amazon.com/SainSmart-8-Channel-Duemilanove-MEGA2560-MEGA1280-x/dp/B006J4G45G)
* [Male to female jumper wire](https://www.amazon.com/gp/product/B01EV70C78/ref=od_aui_detailpages01?ie=UTF8&psc=1)
* 4 outlet electrical box
* 4 electrical outlets
* Outlet cover
* 14 guage electrical wire
* Electrical wire nuts
* Electrical tape
* Wood and screws for the box
* Lots of Christmas lights and extension cords 🎄🔌

## Software

There are two parts to the software: the server, which runs on the Raspberry Pi, and the UI.

### UI

The UI has two parts: an uploader, and a playback UI. Both are served from the Raspberry Pi
on our local network.

#### Uploader

The uploader uses the [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
to perform audio analysis and generate the data needed to drive the light show. This happens in advance
of the actual show so we don't need to do it in real time. The audio file is uploaded to the Pi and
stored, along with computed light show timing data.

Analysis uses an [FFT](https://en.wikipedia.org/wiki/Fast_Fourier_transform) to analyze frequency
domain data from an audio file chosen to upload. The frequency spectrum is bucketed into 8 groups,
one for each light. This is similar to the bar graph display you might have seen on stereo equipment
or other music visualizers. A rolling average is computed for each channel, and the lights turn on
or off based on their distance from the mean. When the frequencies in this bucket are louder,
the lights turn on, and when they are soft, they turn off.

The analysis is done using an offline audio context, and the result can be uploaded and stored on the Pi.
However, in order to make development and testing easier, the light show can be simulated in the browser
using virtual lights. This makes it much easier to tweak things without going outside in the freezing cold
to watch the light show for real. 😜

#### Playback

When it is time to play back a light show, a separate web page served from the Pi shows a list of songs
which have been uploaded. Tapping on one of these downloads the audio to the user's phone, and triggers
the light show to begin playing on the Pi via an API. The Pi delays its playback by 1 second in order
to avoid network lag, and tells the UI what time to start playing the audio on the phone. The audio is 
scheduled for that time and playback begins on both devices simultaneously.

### Server

The Raspberry Pi has a webserver and an API, which is written using [NodeJS](https://nodejs.org) and
[Express](http://expressjs.com). The lights are controlled using [rpio](https://npmjs.com/rpio) to
turn on and off GPIO pins controlling the relays. The Pi stores uploaded audio files and light timing
data on its filesystem.

To play back a light show, the Pi reads the data file for light timing data stored for a song,
which is a binary file that stores the light state for each frame. Usually there are 10 frames per second.
Since there are only 8 lights, the light data is packed into bits to save space. Each frame, one
byte is read, and the lights are turned on or off according to the bits. In order to make the show
more interesting, the lights are rotated every 5 frames so that the frequency channels move around
rather than staying fixed on one light.

## Running the code

To run the client locally for development, run the following on your computer:

```shell
# Install deps
yarn

# Run UI server
yarn watch
```

Now open http://localhost:1234/upload.html to try out the uploader. http://localhost:1234/index.html
is the playback UI.

To run the server, run the following on your Raspberry Pi:

```shell
# Install deps
yarn

# Build UI
yarn build

# Run server
yarn start
```

## License

MIT
